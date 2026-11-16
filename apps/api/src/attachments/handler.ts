import { S3Client } from '@aws-sdk/client-s3';
import { ulidSchema } from '@naaseh/domain';
import { createReceiptContentReader, createReceiptS3Reader } from './receipt-content-service.js';
import { authorizeReceiptRequest } from './receipt-authorization.js';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { attachmentCompleteSchema, attachmentInitiateSchema } from '@naaseh/contracts';
import { errorResponse, json, problem, SafeApiError } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { findAttachment, findAttachmentBlob } from './attachment-repository.js';
import { initiateUpload } from './upload-service.js';
import { completeUpload } from './completion-service.js';
import { createDownloadGrant } from './download-service.js';
import { deleteAttachment } from './deletion-service.js';
import { authorizeAttachmentParent } from './attachment-authorization.js';
import { retryAttachmentScan } from './retry-service.js';
const readReceiptBytes = createReceiptS3Reader(
  new S3Client({}),
  process.env.NAASEH_ATTACHMENT_BUCKET ?? '',
);
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
    if (method === 'GET' && event.routeKey === 'GET /api/v1/finance/receipts/{receiptId}/content') {
      const receiptId = ulidSchema.parse(event.pathParameters?.receiptId);
      const authorize = await authorizeReceiptRequest(
        {
          userId: actor.id,
          sessionHash: typeof auth.sessionHash === 'string' ? auth.sessionHash : '',
          expectedUserId: event.headers['x-finance-owner'],
          grant: event.headers['x-finance-unlock'],
          tabNonce: event.headers['x-finance-tab'],
        },
        actor.role,
      );
      return await createReceiptContentReader({
        findReceipt: findAttachment,
        findBlob: findAttachmentBlob,
        authorize,
        readBytes: readReceiptBytes,
      })(receiptId, { range: event.headers.range, ifMatch: event.headers['if-match'] });
    }
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
    if (
      error instanceof SafeApiError &&
      error.status === 416 &&
      'contentRange' in error &&
      typeof error.contentRange === 'string'
    )
      return problem(416, error.code, error.safeMessage, correlationId, {
        'content-range': error.contentRange,
      });
    return errorResponse(error, {
      correlationId,
      operation: 'attachments.request',
      actorId: actor.id,
      resourceId: event.pathParameters?.attachmentId,
    });
  }
};
