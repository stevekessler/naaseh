import { journalKeyEnvelopeResponseSchema } from '@naaseh/contracts';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoJournalRepository } from './journal-repository.js';

export interface JournalRequest {
  method?: string;
  path?: string;
  ownerId?: string;
  body?: unknown;
}
export interface JournalResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
const concealed = (statusCode: number, code: string): JournalResponse => ({
  statusCode,
  headers: { 'cache-control': 'no-store', 'content-type': 'application/problem+json' },
  body: JSON.stringify({ code, message: 'The requested journal resource is unavailable.' }),
});
const repository = new DynamoJournalRepository();

export async function journalHandler(event: JournalRequest): Promise<JournalResponse> {
  if (!event.ownerId) return concealed(401, 'AUTHENTICATION_REQUIRED');
  if (event.method === 'GET' && event.path === '/journal/key-envelope') {
    const envelope = await repository.keyEnvelope(event.ownerId);
    return envelope
      ? {
          statusCode: 200,
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
          body: JSON.stringify(envelope),
        }
      : concealed(404, 'JOURNAL_NOT_FOUND');
  }
  if (event.method === 'PUT' && event.path === '/journal/key-envelope') {
    const parsed = journalKeyEnvelopeResponseSchema.safeParse(event.body);
    if (!parsed.success || parsed.data.ownerId !== event.ownerId)
      return concealed(400, 'INVALID_JOURNAL_ENVELOPE');
    const baseVersion = parsed.data.version - 1;
    const saved = await repository.saveKeyEnvelope(event.ownerId, parsed.data, baseVersion);
    return saved
      ? {
          statusCode: 200,
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
          body: JSON.stringify(saved),
        }
      : concealed(409, 'JOURNAL_CONFLICT');
  }
  return concealed(404, 'JOURNAL_NOT_FOUND');
}

export const handler: APIGatewayProxyHandlerV2 = async (event: APIGatewayProxyEventV2) => {
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: { lambda?: { userId?: string } };
  };
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : undefined;
  } catch {
    return concealed(400, 'INVALID_JOURNAL_ENVELOPE');
  }
  return journalHandler({
    method: event.requestContext.http.method,
    path: event.rawPath.replace(/^\/api\/v1/u, ''),
    ...(context.authorizer?.lambda?.userId ? { ownerId: context.authorizer.lambda.userId } : {}),
    body,
  });
};
