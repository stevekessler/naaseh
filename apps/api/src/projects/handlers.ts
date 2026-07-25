import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { errorResponse, json, problem, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { createManagedProject, editManagedProject } from './project-service.js';
import { getProject, listProjects } from './project-repository.js';
import { changeProjectLifecycle } from './organization-lifecycle-service.js';
import { createDeletionPreview } from '../deletion/deletion-preview-service.js';
import { deletionConfirmationSecret } from '../deletion/deletion-secret.js';
import { verifyConfirmationToken } from '../deletion/confirmation-token.js';
import {
  createDeletionJob,
  findDeletionJob,
  findDeletionReceipt,
  saveDeletionJob,
} from '../deletion/deletion-repository.js';
import { permanentlyDeleteEmptyOrganization } from './organization-deletion-service.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  const auth = (event.requestContext as any).authorizer?.lambda as
    | { userId?: string; role?: string; csrfToken?: string }
    | undefined;
  if (!auth?.userId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    const id = event.pathParameters?.projectId;
    const lifecycleAction = event.rawPath.endsWith('/archive')
      ? 'archive'
      : event.rawPath.endsWith('/restore')
        ? 'restore'
        : undefined;
    if (event.requestContext.http.method === 'GET') {
      if (id && event.rawPath.endsWith('/deletion-preview')) {
        if (auth.role !== 'admin')
          throw new SafeApiError(
            403,
            'forbidden',
            'Administrator access required.',
            'authorization',
          );
        return json(
          200,
          await createDeletionPreview({
            resourceType: 'project',
            resourceId: id,
            actorId: auth.userId,
            secret: await deletionConfirmationSecret(),
          }),
        );
      }
      const value = id
        ? await getProject(id)
        : await listProjects(event.queryStringParameters?.categoryId);
      return value
        ? json(200, value)
        : problem(404, 'not_found', 'Project not found.', correlationId);
    }
    if (auth.role !== 'admin')
      throw new SafeApiError(403, 'forbidden', 'Administrator access required.', 'authorization');
    requireMutationSecurity(
      event.headers.origin,
      auth.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const expected = Number(event.headers['if-match']);
    if (id && lifecycleAction) {
      if (!expected)
        throw new SafeApiError(428, 'precondition_required', 'If-Match is required.', 'validation');
      return json(
        200,
        await changeProjectLifecycle({
          projectId: id,
          action: lifecycleAction,
          actorId: auth.userId,
          expectedVersion: expected,
        }),
      );
    }
    if (id && event.requestContext.http.method === 'DELETE') {
      const mutationId = event.headers['idempotency-key'];
      if (!expected || !mutationId)
        throw new SafeApiError(
          428,
          'precondition_required',
          'If-Match and Idempotency-Key are required.',
          'validation',
        );
      const replay = await findDeletionReceipt(auth.userId, mutationId);
      if (replay) return json(200, await findDeletionJob(replay.jobId));
      const body = JSON.parse(event.body ?? '{}') as { confirmationToken?: string };
      const preview = await createDeletionPreview({
        resourceType: 'project',
        resourceId: id,
        actorId: auth.userId,
        secret: await deletionConfirmationSecret(),
      });
      if (preview.blockers.length)
        throw new SafeApiError(
          409,
          'organization_not_empty',
          'Project cannot be deleted while references remain.',
          'conflict',
        );
      const original = JSON.parse(
        Buffer.from(body.confirmationToken?.split('.')[0] ?? '', 'base64url').toString('utf8'),
      ) as { expiresAt?: string };
      const current = JSON.parse(
        Buffer.from(preview.confirmationToken.split('.')[0] ?? '', 'base64url').toString('utf8'),
      ) as { dependencyDigest?: string };
      verifyConfirmationToken(
        body.confirmationToken ?? '',
        {
          actorId: auth.userId,
          resourceType: 'project',
          resourceId: id,
          targetVersion: expected,
          dependencyDigest: current.dependencyDigest ?? '',
          expiresAt: original.expiresAt ?? '',
        },
        await deletionConfirmationSecret(),
      );
      await permanentlyDeleteEmptyOrganization({
        resourceType: 'project',
        resourceId: id,
        expectedVersion: expected,
      });
      const job = await createDeletionJob({
        resourceType: 'project',
        resourceId: id,
        requestedBy: auth.userId,
        requestMutationId: mutationId,
        targetVersion: expected,
        dependencyDigest: current.dependencyDigest ?? '',
      });
      if (!job) throw new Error('Deletion receipt could not be created.');
      return json(
        200,
        await saveDeletionJob({
          ...job,
          status: 'complete',
          progress: 100,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
    }
    const body = JSON.parse(event.body ?? '{}') as {
      categoryId?: string;
      name?: string;
      endDate?: string | null;
    };
    if (!id) {
      if (!body.categoryId || !body.name)
        throw new Error('Category and Project name are required.');
      return json(
        201,
        await createManagedProject({
          categoryId: body.categoryId,
          name: body.name,
          ...(body.endDate ? { endDate: body.endDate } : {}),
        }),
      );
    }
    if (!expected)
      throw new SafeApiError(428, 'precondition_required', 'If-Match is required.', 'validation');
    return json(
      200,
      await editManagedProject(
        id,
        {
          ...(body.categoryId ? { categoryId: body.categoryId } : {}),
          ...(body.name ? { name: body.name } : {}),
          ...(body.endDate ? { endDate: body.endDate } : {}),
        },
        expected,
      ),
    );
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'projects.request',
      actorId: auth.userId,
      resourceId: event.pathParameters?.projectId,
    });
  }
};
