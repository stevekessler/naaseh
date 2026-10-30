import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listUserMemberships } from '../groups/group-repository.js';
import type { FinanceActor } from './authorization.js';
export async function financeActorFor(event: APIGatewayProxyEventV2): Promise<FinanceActor> {
  const auth = (
    event.requestContext as { authorizer?: { lambda?: { userId?: string; role?: string } } }
  ).authorizer?.lambda;
  const memberships = auth?.userId ? await listUserMemberships(auth.userId, true) : [];
  return {
    id: auth?.userId ?? '',
    role: auth?.role === 'admin' ? 'admin' : 'user',
    active: Boolean(auth?.userId),
    groupMemberships: memberships
      .filter((item) => item.status === 'active')
      .map(({ groupId, role }) => ({ groupId, role })),
  };
}
