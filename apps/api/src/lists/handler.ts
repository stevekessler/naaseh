import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createUlid } from '@naaseh/domain';
import {
  completionRequestSchema,
  listCreateSchema,
  listItemCreateSchema,
  listItemPatchSchema,
  listPatchSchema,
} from '@naaseh/contracts';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import {
  findList,
  findListItem,
  listItemsForList,
  saveList,
  saveListItem,
} from './list-repository.js';
import {
  addOwnedListItem,
  createOwnedList,
  updateOwnedList,
  updateOwnedListItem,
} from './list-service.js';
import { authorizeList } from './list-authorization.js';
import { listAudienceChanges, listItemAudienceChanges } from './list-audience.js';
import { prepareAudienceChange } from '../sync/change-feed-repository.js';
import { recordListAdminRead } from './telemetry.js';
import { resolveProjectAssignment } from '../projects/project-service.js';
const actorFor = (event: any) => ({
  id: event.requestContext.authorizer?.lambda?.userId as string,
  role: (event.requestContext.authorizer?.lambda?.role ?? 'user') as 'admin' | 'user',
  active: true,
  groupIds: ((event.requestContext.authorizer?.lambda?.groupIds ?? '') as string)
    .split(',')
    .filter(Boolean),
});
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId;
  try {
    const actor = actorFor(event);
    if (!actor.id) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    const listId = event.pathParameters?.listId,
      itemId = event.pathParameters?.itemId,
      method = event.requestContext.http.method;
    const current = listId ? await findList(listId) : undefined;
    if (method === 'GET' && listId) {
      const decision = authorizeList(current, actor);
      if (!decision.allowed) return problem(404, 'not_found', 'List not found.', correlationId);
      if (decision.privileged) recordListAdminRead(correlationId, actor.id, listId);
      return json(200, { list: current, items: await listItemsForList(listId) });
    }
    requireMutationSecurity(
      event.headers.origin,
      (event.requestContext as any).authorizer?.lambda?.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const mutationId = event.headers['x-client-mutation-id'] ?? createUlid();
    if (method === 'POST' && !listId) {
      const input = listCreateSchema.parse(JSON.parse(event.body ?? '{}'));
      const assignment = await resolveProjectAssignment(input.projectId ?? null);
      const value = createOwnedList(input.name, actor.id, new Date(), assignment.projectId);
      const feeds = await Promise.all(
        listAudienceChanges(undefined, value).map(prepareAudienceChange),
      );
      await saveList(value, actor.id, mutationId, 'create', ['name'], 0, feeds);
      return json(201, value);
    }
    if (!current || !authorizeList(current, actor, 'edit').allowed)
      return problem(404, 'not_found', 'List not found.', correlationId);
    const expected = Number(event.headers['if-match']);
    if (event.rawPath.endsWith('/project') && !expected)
      return problem(428, 'precondition_required', 'If-Match is required.', correlationId);
    if (
      expected &&
      (itemId ? (await findListItem(itemId))?.version !== expected : current.version !== expected)
    )
      return problem(409, 'conflict', 'The resource changed on another device.', correlationId);
    if (method === 'PATCH' && !itemId) {
      const parsed = listPatchSchema.parse(JSON.parse(event.body ?? '{}'));
      const assignment =
        parsed.projectId !== undefined
          ? await resolveProjectAssignment(parsed.projectId)
          : undefined;
      const patch = {
        ...Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => value !== undefined && value !== null),
        ),
        ...(assignment ? { projectId: assignment.projectId } : {}),
      } as Pick<Partial<typeof current>, 'name' | 'groupId' | 'locked' | 'status' | 'projectId'>;
      const value = updateOwnedList(current, patch, actor.id);
      const feeds = await Promise.all(
        listAudienceChanges(current, value).map(prepareAudienceChange),
      );
      await saveList(
        value,
        actor.id,
        mutationId,
        parsed.locked === true ? 'lock' : parsed.locked === false ? 'unlock' : 'update',
        Object.keys(parsed),
        current.version,
        feeds,
      );
      return json(200, value);
    }
    if (method === 'POST' && event.rawPath.endsWith('/items')) {
      const parsed = listItemCreateSchema.parse(JSON.parse(event.body ?? '{}'));
      const input = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== undefined),
      ) as Parameters<typeof addOwnedListItem>[1];
      const items = await listItemsForList(current.id);
      const value = addOwnedListItem(current, input, actor.id, items.at(-1)?.orderKey);
      const feeds = await Promise.all(
        listItemAudienceChanges(current, value, value).map(prepareAudienceChange),
      );
      await saveListItem(value, actor.id, mutationId, 'create', Object.keys(input), 0, feeds);
      return json(201, value);
    }
    if (itemId) {
      const item = await findListItem(itemId);
      if (!item || item.listId !== current.id)
        return problem(404, 'not_found', 'List item not found.', correlationId);
      const body = JSON.parse(event.body ?? '{}');
      const patch: Partial<typeof item> = event.rawPath.endsWith('/completion')
        ? { status: completionRequestSchema.parse(body).completed ? 'completed' : 'open' }
        : event.rawPath.endsWith('/reset-to-global')
          ? { nameOverride: undefined, valueOverride: undefined }
          : method === 'DELETE'
            ? { status: 'removed' }
            : Object.fromEntries(
                Object.entries(listItemPatchSchema.parse(body)).filter(
                  ([, value]) => value !== undefined && value !== null,
                ),
              );
      const value = updateOwnedListItem(current, item, patch, actor.id);
      const status = patch.status;
      const feeds = await Promise.all(
        listItemAudienceChanges(current, value, value).map(prepareAudienceChange),
      );
      await saveListItem(
        value,
        actor.id,
        mutationId,
        status === 'completed'
          ? 'complete'
          : status === 'open'
            ? 'reopen'
            : status === 'removed'
              ? 'delete'
              : event.rawPath.endsWith('/reset-to-global')
                ? 'resetOverrides'
                : patch.orderKey
                  ? 'reorder'
                  : 'update',
        Object.keys(patch),
        item.version,
        feeds,
      );
      return method === 'DELETE' ? json(204, undefined) : json(200, value);
    }
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'lists.request',
      resourceId: event.pathParameters?.listId,
    });
  }
};
