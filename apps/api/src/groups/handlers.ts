import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { createUlid, publicGroup, publicMembership } from '@naaseh/domain';
import { groupCreateSchema, groupJoinSchema } from '@naaseh/contracts';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { loadPepper } from '../auth/password.js';
import {
  clearDurableFailures,
  durableCanAttempt,
  registerDurableFailure,
} from '../auth/rate-limit.js';
import { putRecord } from '../shared/store.js';
import { createGroup, GroupPolicyError, joinGroup, removeGroupMember } from './group-service.js';
import {
  getGroup,
  getMembership,
  listActiveGroups,
  listMemberships,
  listUserMemberships,
} from './group-repository.js';

type AuthContext = { authorizer?: { lambda?: { userId?: string; csrfToken?: string } } };

const audit = (event: string, actorId: string, fields: Record<string, string>) =>
  putRecord({
    PK: `AUDIT#${createUlid()}`,
    SK: 'EVENT',
    event,
    actorId,
    ...fields,
    at: new Date().toISOString(),
  });

async function handleGroupRequest(
  event: Parameters<APIGatewayProxyHandlerV2>[0],
  correlationId: string,
  actorId: string,
): Promise<APIGatewayProxyResultV2> {
  const context = event.requestContext as typeof event.requestContext & AuthContext;
  const groupId = event.pathParameters?.groupId;
  const method = event.requestContext.http.method;

  if (method === 'GET' && !groupId) {
    const [groups, memberships] = await Promise.all([
      listActiveGroups(),
      listUserMemberships(actorId),
    ]);
    const byGroup = new Map(memberships.map((membership) => [membership.groupId, membership]));
    return json(200, { items: groups.map((group) => publicGroup(group, byGroup.get(group.id))) });
  }

  if (method === 'GET' && groupId) {
    const [group, membership] = await Promise.all([
      getGroup(groupId),
      getMembership(groupId, actorId),
    ]);
    if (!group || group.status !== 'active')
      return problem(404, 'not_found', 'Group not found.', correlationId);
    const members =
      membership?.status === 'active'
        ? (await listMemberships(groupId))
            .filter((item) => item.status === 'active')
            .map(publicMembership)
        : [];
    return json(200, { group: publicGroup(group, membership), members });
  }

  requireMutationSecurity(
    event.headers.origin,
    context.authorizer?.lambda?.csrfToken ?? '',
    event.headers['x-csrf-token'],
  );

  if (method === 'POST' && !groupId) {
    const input = groupCreateSchema.parse(JSON.parse(event.body ?? '{}'));
    const pepper = (await loadPepper()).value;
    const { group, owner } = await createGroup(input.name, actorId, input.joinPin, pepper);
    await audit('group.created', actorId, { groupId: group.id });
    return json(201, publicGroup(group, owner));
  }

  const group = groupId ? await getGroup(groupId) : undefined;
  if (!group) return problem(404, 'not_found', 'Group not found.', correlationId);

  if (method === 'POST' && event.rawPath.endsWith('/join')) {
    const rateKey = `group:${group.id}:user:${actorId}`;
    if (!(await durableCanAttempt(rateKey)))
      return problem(429, 'rate_limited', 'Try again later.', correlationId, {
        'retry-after': '60',
      });
    const input = groupJoinSchema.parse(JSON.parse(event.body ?? '{}'));
    try {
      const membership = await joinGroup(
        group,
        actorId,
        input.pin,
        async () => (await loadPepper()).value,
      );
      await clearDurableFailures(rateKey);
      await audit('group.joined', actorId, { groupId: group.id, outcome: 'success' });
      return json(200, publicMembership(membership));
    } catch (error) {
      if (!(error instanceof GroupPolicyError)) throw error;
      await registerDurableFailure(rateKey);
      await audit('group.join_failed', actorId, { groupId: group.id, outcome: 'rejected' });
      return problem(403, 'group_join_failed', 'Unable to join group.', correlationId);
    }
  }

  const memberId = event.pathParameters?.userId;
  if (method === 'DELETE' && memberId) {
    try {
      await removeGroupMember(group, actorId, memberId);
    } catch (error) {
      if (!(error instanceof GroupPolicyError)) throw error;
      return problem(403, 'forbidden', 'Unable to revoke group membership.', correlationId);
    }
    await audit('group.member_revoked', actorId, { groupId: group.id, memberId });
    return json(204, undefined);
  }
  return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const correlationId = event.requestContext.requestId || randomUUID();
  const context = event.requestContext as typeof event.requestContext & AuthContext;
  const actorId = context.authorizer?.lambda?.userId;
  if (!actorId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  try {
    return await handleGroupRequest(event, correlationId, actorId);
  } catch (error) {
    return errorResponse(error, {
      correlationId,
      operation: 'groups.request',
      actorId,
      resourceId: event.pathParameters?.groupId,
    });
  }
};

export const createGroupHandler = handler;
