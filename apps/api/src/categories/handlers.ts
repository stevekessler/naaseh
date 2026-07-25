import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createUlid } from '@naaseh/domain';
import { listCategories } from './category-repository.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { putRecord } from '../shared/store.js';
import { requireMutationSecurity } from '../shared/security.js';
import { requireAdminMutation } from '../admin/admin-authorization.js';
import { createLogger } from '@naaseh/observability';
import { createManagedCategory, editManagedCategory } from './category-service.js';
import { changeCategoryLifecycle } from '../projects/organization-lifecycle-service.js';
import { createDeletionPreview } from '../deletion/deletion-preview-service.js';
import { deletionConfirmationSecret } from '../deletion/deletion-secret.js';
import { verifyConfirmationToken } from '../deletion/confirmation-token.js';
import {
  createDeletionJob,
  findDeletionJob,
  findDeletionReceipt,
  saveDeletionJob,
} from '../deletion/deletion-repository.js';
import { permanentlyDeleteEmptyOrganization } from '../projects/organization-deletion-service.js';

export const createCategoryHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: { lambda?: { role?: string; userId?: string; csrfToken?: string } };
  };
  const auth = context.authorizer?.lambda;
  const logger = createLogger(process.env);
  if (!auth?.userId)
    return problem(401, 'unauthorized', 'Authentication required.', event.requestContext.requestId);
  const id = event.pathParameters?.categoryId;
  if (event.requestContext.http.method === 'GET') {
    if (id && event.rawPath.endsWith('/deletion-preview')) {
      if (auth.role !== 'admin')
        return problem(
          403,
          'forbidden',
          'Administrator access required.',
          event.requestContext.requestId,
        );
      return json(
        200,
        await createDeletionPreview({
          resourceType: 'category',
          resourceId: id,
          actorId: auth.userId,
          secret: await deletionConfirmationSecret(),
        }),
      );
    }
    return json(200, await listCategories());
  }
  try {
    requireAdminMutation(auth);
  } catch {
    return problem(
      403,
      'forbidden',
      'Administrator access required.',
      event.requestContext.requestId,
    );
  }
  try {
    requireMutationSecurity(
      event.headers.origin,
      auth.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const expected = Number(event.headers['if-match']);
    const lifecycleAction = event.rawPath.endsWith('/archive')
      ? 'archive'
      : event.rawPath.endsWith('/restore')
        ? 'restore'
        : undefined;
    if (id && lifecycleAction) {
      if (!expected)
        return problem(
          428,
          'precondition_required',
          'If-Match is required.',
          event.requestContext.requestId,
        );
      const value = await changeCategoryLifecycle({
        categoryId: id,
        action: lifecycleAction,
        actorId: auth.userId,
        expectedVersion: expected,
      });
      await putRecord({
        PK: `AUDIT#${createUlid()}`,
        SK: 'EVENT',
        event: `category.${lifecycleAction}`,
        actorId: auth.userId,
        categoryId: id,
        at: new Date().toISOString(),
      });
      logger.metric('CategoryAdminChanges', 1);
      return json(200, value);
    }
    if (event.requestContext.http.method === 'DELETE' && id) {
      const mutationId = event.headers['idempotency-key'];
      if (!expected || !mutationId)
        return problem(
          428,
          'precondition_required',
          'If-Match and Idempotency-Key are required.',
          event.requestContext.requestId,
        );
      const replay = await findDeletionReceipt(auth.userId, mutationId);
      if (replay) return json(200, await findDeletionJob(replay.jobId));
      const body = JSON.parse(event.body ?? '{}') as { confirmationToken?: string };
      const secret = await deletionConfirmationSecret();
      const preview = await createDeletionPreview({
        resourceType: 'category',
        resourceId: id,
        actorId: auth.userId,
        secret,
      });
      if (preview.blockers.length)
        return problem(
          409,
          'organization_not_empty',
          'Category cannot be deleted while references remain.',
          event.requestContext.requestId,
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
          resourceType: 'category',
          resourceId: id,
          targetVersion: expected,
          dependencyDigest: current.dependencyDigest ?? '',
          expiresAt: original.expiresAt ?? '',
        },
        secret,
      );
      await permanentlyDeleteEmptyOrganization({
        resourceType: 'category',
        resourceId: id,
        expectedVersion: expected,
      });
      const job = await createDeletionJob({
        resourceType: 'category',
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
    const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    if (id) {
      if (!expected)
        return problem(
          428,
          'precondition_required',
          'If-Match is required.',
          event.requestContext.requestId,
        );
      const value = await editManagedCategory(
        id,
        body as Partial<
          Pick<import('@naaseh/domain').CategoryRecord, 'name' | 'color' | 'defaultAssigneeId'>
        >,
        expected,
      );
      await putRecord({
        PK: `AUDIT#${createUlid()}`,
        SK: 'EVENT',
        event: 'category.updated',
        actorId: auth.userId,
        categoryId: id,
        at: new Date().toISOString(),
      });
      logger.metric('CategoryAdminChanges', 1);
      return json(200, value);
    }
    const value = await createManagedCategory(body as { name: string; color: string });
    await putRecord({
      PK: `AUDIT#${createUlid()}`,
      SK: 'EVENT',
      event: 'category.created',
      actorId: auth.userId,
      categoryId: value.id,
      at: new Date().toISOString(),
    });
    logger.metric('CategoryAdminChanges', 1);
    return json(201, value);
  } catch (error) {
    return errorResponse(error, {
      correlationId: event.requestContext.requestId,
      operation: 'categories.request',
      actorId: auth.userId,
      resourceId: event.pathParameters?.categoryId,
    });
  }
};
export const handler = createCategoryHandler;
