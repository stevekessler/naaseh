import type { FinanceScope } from '@naaseh/domain';

export type FinanceGroupRole = 'owner' | 'manager' | 'member';
export interface FinanceActor {
  id: string;
  role: 'admin' | 'user';
  active: boolean;
  groupMemberships: ReadonlyArray<{ groupId: string; role: FinanceGroupRole }>;
}
export type FinanceAction = 'read' | 'edit' | 'connect' | 'reassign' | 'delete';

export interface FinanceAuthorizationDecision {
  allowed: boolean;
  audience?: `OWNER#${string}` | `GROUP#${string}`;
}

export function authorizeFinanceScope(
  actor: FinanceActor,
  scope: FinanceScope,
  action: FinanceAction,
): FinanceAuthorizationDecision {
  // Application roles do not replace ownership or group membership checks.
  if (!actor.active) return { allowed: false };
  if (scope.type === 'owner') {
    return actor.id === scope.ownerId
      ? { allowed: true, audience: `OWNER#${scope.ownerId}` }
      : { allowed: false };
  }
  const membership = actor.groupMemberships.find(({ groupId }) => groupId === scope.groupId);
  if (!membership) return { allowed: false };
  const elevated = membership.role === 'owner' || membership.role === 'manager';
  if ((action === 'connect' || action === 'reassign' || action === 'delete') && !elevated) {
    return { allowed: false };
  }
  return { allowed: true, audience: `GROUP#${scope.groupId}` };
}

export function financeNotFound(correlationId: string) {
  return {
    status: 404 as const,
    code: 'FINANCE_NOT_FOUND' as const,
    message: 'Finance record not found.',
    correlationId,
  };
}
