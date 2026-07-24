import { authorizeContent, type List } from '@naaseh/domain';
export function authorizeList(
  list: List | undefined,
  actor: { id: string; role: 'admin' | 'user'; active: boolean; groupIds: string[] },
  action: 'read' | 'edit' = 'read',
) {
  if (!list) return { allowed: false, privileged: false };
  return authorizeContent({
    actor,
    ownerId: list.ownerId,
    locked: list.locked,
    ...(list.groupId ? { groupId: list.groupId } : {}),
    action,
  });
}
