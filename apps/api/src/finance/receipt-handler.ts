import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulidSchema } from '@naaseh/domain';
import { authorizeReceiptRequest } from '../attachments/receipt-authorization.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { parseReceiptQuery, readReceiptPage } from './receipt-query-service.js';
import { createReceiptService } from './receipt-service.js';

const receiptPath = /^\/api\/v1\/finance\/receipts(?:\/([^/]+)(?:\/(complete|retry|pending))?)?$/u;
const transactionPath = /^\/api\/v1\/finance\/transactions\/([^/]+)\/receipts(\/uploads)?$/u;

export async function dispatchFinanceReceipt(
  event: APIGatewayProxyEventV2,
  auth: { userId: string; role?: string; csrfToken?: string; sessionHash?: string },
) {
  const receiptRoute = receiptPath.exec(event.rawPath);
  const transactionRoute = transactionPath.exec(event.rawPath);
  if (!receiptRoute && !transactionRoute) return undefined;
  const correlationId = event.requestContext.requestId;
  try {
    const authorize = await authorizeReceiptRequest(
      {
        userId: auth.userId,
        sessionHash: auth.sessionHash ?? '',
        expectedUserId: event.headers['x-finance-owner'],
        grant: event.headers['x-finance-unlock'],
        tabNonce: event.headers['x-finance-tab'],
      },
      auth.role === 'admin' ? 'admin' : 'user',
    );
    const method = event.requestContext.http.method;
    if (method !== 'GET')
      requireMutationSecurity(
        event.headers.origin,
        auth.csrfToken ?? '',
        event.headers['x-csrf-token'],
      );
    const receipts = createReceiptService({ actorId: auth.userId, authorize });
    const parentId = transactionRoute?.[1] && decodeURIComponent(transactionRoute[1]);
    const upload = Boolean(transactionRoute?.[2]);
    if (method === 'POST' && parentId && upload)
      return json(201, await receipts.initiate(parentId, JSON.parse(event.body ?? '{}')));
    const id = receiptRoute?.[1];
    const action = receiptRoute?.[2];
    if (method === 'GET' && !id && !upload)
      return json(
        200,
        await readReceiptPage({
          userId: auth.userId,
          ...(parentId ? { transactionId: parentId } : {}),
          authorize,
          query: parseReceiptQuery(event.rawQueryString),
        }),
      );
    if (id) {
      const receiptId = ulidSchema.parse(id);
      if (method === 'GET' && !action) return json(200, await receipts.metadata(receiptId));
      if (method === 'POST' && action === 'complete')
        return json(200, await receipts.complete(receiptId, JSON.parse(event.body ?? '{}')));
      if (method === 'POST' && action === 'retry')
        return json(200, await receipts.retry(receiptId, JSON.parse(event.body ?? '{}')));
      if (method === 'DELETE' && action === 'pending')
        return json(200, await receipts.cancel(receiptId));
    }
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'finance.receipts',
      actorId: auth.userId,
    });
  }
}
