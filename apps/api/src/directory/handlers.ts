import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createUlid } from '@naaseh/domain';
import { directoryItemCreateSchema, directoryItemPatchSchema } from '@naaseh/contracts';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import {
  findDirectoryItem,
  listDirectoryItems,
  saveDirectoryItemRecord,
} from './directory-repository.js';
import { createDirectoryItem, updateDirectoryItem } from './directory-service.js';
import { prepareAudienceChange } from '../sync/change-feed-repository.js';
const directoryFeed = async (value: import('@naaseh/domain').GlobalDirectoryItem) => [
  await prepareAudienceChange({
    audience: 'PUBLIC',
    entityType: 'directoryItem',
    entityId: value.id,
    version: value.version,
    operation: value.status === 'archived' ? 'tombstone' : 'upsert',
    ...(value.status === 'archived' ? {} : { payload: value }),
    changedAt: value.updatedAt,
  }),
];
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const actor = (event.requestContext as any).authorizer?.lambda;
  const correlationId = event.requestContext.requestId;
  if (!actor?.userId)
    return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    const id = event.pathParameters?.directoryItemId,
      method = event.requestContext.http.method;
    if (method === 'GET' && !id)
      return json(200, {
        items: await listDirectoryItems(Number(event.queryStringParameters?.limit ?? 100)),
      });
    requireMutationSecurity(
      event.headers.origin,
      actor.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const mutationId = event.headers['x-client-mutation-id'] ?? createUlid();
    if (method === 'POST' && !id) {
      const input = directoryItemCreateSchema.parse(JSON.parse(event.body ?? '{}'));
      const value = createDirectoryItem(input, actor.userId);
      await saveDirectoryItemRecord(value, actor.userId, mutationId, 0, await directoryFeed(value));
      return json(201, value);
    }
    const current = id ? await findDirectoryItem(id) : undefined;
    if (!current) return problem(404, 'not_found', 'Directory item not found.', correlationId);
    if (Number(event.headers['if-match']) && Number(event.headers['if-match']) !== current.version)
      return problem(409, 'conflict', 'The directory item changed.', correlationId);
    if (method === 'PATCH') {
      const parsed = directoryItemPatchSchema.parse(JSON.parse(event.body ?? '{}'));
      const patch = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== undefined),
      ) as Parameters<typeof updateDirectoryItem>[1];
      const value = updateDirectoryItem(current, patch, actor.userId);
      await saveDirectoryItemRecord(
        value,
        actor.userId,
        mutationId,
        current.version,
        await directoryFeed(value),
      );
      return json(200, value);
    }
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'directory.request',
      actorId: actor.userId,
      resourceId: event.pathParameters?.directoryItemId,
    });
  }
};
