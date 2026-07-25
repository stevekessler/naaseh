import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { errorResponse, json, problem, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { verifyConfirmationToken } from './confirmation-token.js';
import { createDeletionPreview } from './deletion-preview-service.js';
import { createDeletionJob, findDeletionJob, findDeletionReceipt } from './deletion-repository.js';
import { deletionConfirmationSecret } from './deletion-secret.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  const claims = (event.requestContext as any).authorizer?.lambda as
    | { userId?: string; csrfToken?: string }
    | undefined;
  const actorId = claims?.userId;
  if (!actorId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    const jobId = event.pathParameters?.jobId;
    if (jobId && event.requestContext.http.method === 'GET') {
      const job = await findDeletionJob(jobId);
      return job && job.requestedBy === actorId
        ? json(200, job)
        : problem(404, 'not_found', 'Deletion job not found.', correlationId);
    }
    const resourceType = event.pathParameters?.taskId ? 'task' : 'list';
    const resourceId = event.pathParameters?.taskId ?? event.pathParameters?.listId;
    if (!resourceId) return problem(404, 'not_found', 'Resource not found.', correlationId);
    const secret = await deletionConfirmationSecret();
    if (event.requestContext.http.method === 'GET')
      return json(200, await createDeletionPreview({ resourceType, resourceId, actorId, secret }));
    requireMutationSecurity(
      event.headers.origin,
      claims?.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const rawVersion = event.headers['if-match'];
    const mutationId = event.headers['idempotency-key'];
    if (!rawVersion || !mutationId)
      throw new SafeApiError(
        428,
        'precondition_required',
        'If-Match and Idempotency-Key are required.',
        'validation',
      );
    const replay = await findDeletionReceipt(actorId, mutationId);
    if (replay) return json(202, await findDeletionJob(replay.jobId));
    const body = JSON.parse(event.body ?? '{}') as { confirmationToken?: string };
    if (!body.confirmationToken)
      throw new SafeApiError(
        400,
        'confirmation_required',
        'Deletion confirmation is required.',
        'validation',
      );
    const preview = await createDeletionPreview({ resourceType, resourceId, actorId, secret });
    if (preview.targetVersion !== Number(rawVersion))
      throw new SafeApiError(
        409,
        'stale_confirmation',
        'The resource changed. Review it again.',
        'conflict',
      );
    const originalClaims = JSON.parse(
      Buffer.from(body.confirmationToken.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { expiresAt?: string };
    const currentClaims = JSON.parse(
      Buffer.from(preview.confirmationToken.split('.')[0]!, 'base64url').toString('utf8'),
    ) as { dependencyDigest: string };
    verifyConfirmationToken(
      body.confirmationToken,
      {
        actorId,
        resourceType,
        resourceId,
        targetVersion: preview.targetVersion,
        dependencyDigest: currentClaims.dependencyDigest,
        expiresAt: originalClaims.expiresAt ?? '',
      },
      secret,
    );
    const digest = currentClaims.dependencyDigest;
    const job = await createDeletionJob({
      resourceType,
      resourceId,
      requestedBy: actorId,
      requestMutationId: mutationId,
      targetVersion: preview.targetVersion,
      dependencyDigest: digest,
    });
    if (!job) throw new Error('Deletion job could not be created.');
    await new SFNClient({}).send(
      new StartExecutionCommand({
        stateMachineArn: process.env.DELETION_STATE_MACHINE_ARN,
        name: job.id,
        input: JSON.stringify({ jobId: job.id }),
      }),
    );
    return json(202, job);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'deletion.request',
      actorId,
      resourceId: event.pathParameters?.taskId ?? event.pathParameters?.listId,
    });
  }
};
