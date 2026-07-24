import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { attachmentCompleteSchema, attachmentInitiateSchema } from '@naaseh/contracts';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { findAttachment } from './attachment-repository.js';
import { initiateUpload } from './upload-service.js';
import { completeUpload } from './completion-service.js';
import { createDownloadGrant } from './download-service.js';
import { deleteAttachment } from './deletion-service.js';
import { authorizeAttachmentParent } from './attachment-authorization.js';
import { retryAttachmentScan } from './retry-service.js';
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = (event.requestContext as any).authorizer?.lambda,
    correlationId = event.requestContext.requestId;
  if (!auth?.userId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  const actor = {
    id: auth.userId as string,
    role: (auth.role ?? 'user') as 'admin' | 'user',
    active: true,
    groupIds: String(auth.groupIds ?? '')
      .split(',')
      .filter(Boolean),
  };
  try {
    const id = event.pathParameters?.attachmentId,
      method = event.requestContext.http.method;
    if (method === 'GET' && id) {
      if (event.rawPath.endsWith('/download'))
        return json(200, await createDownloadGrant(id, actor));
      const value = await findAttachment(id);
      return value &&
        (await authorizeAttachmentParent(value.parentType, value.parentId, actor, 'read'))
        ? json(200, value)
        : problem(404, 'not_found', 'Attachment not found.', correlationId);
    }
    requireMutationSecurity(
      event.headers.origin,
      auth.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    if (method === 'POST' && event.rawPath.endsWith('/uploads'))
      return json(
        201,
        await initiateUpload(
          attachmentInitiateSchema.parse(JSON.parse(event.body ?? '{}')),
          actor,
          event.headers['x-client-mutation-id'],
        ),
      );
    if (method === 'POST' && id && event.rawPath.endsWith('/complete')) {
      const input = attachmentCompleteSchema.parse(JSON.parse(event.body ?? '{}'));
      return json(
        200,
        await completeUpload(
          id,
          event.headers['x-upload-session-id'] ?? '',
          input.objectVersionId,
          actor,
        ),
      );
    }
    if (method === 'POST' && id && event.rawPath.endsWith('/retry'))
      return json(200, await retryAttachmentScan(id, actor));
    if (method === 'DELETE' && id) {
      await deleteAttachment(id, actor);
      return json(204, undefined);
    }
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'attachments.request',
      actorId: actor.id,
      resourceId: event.pathParameters?.attachmentId,
    });
  }
};
