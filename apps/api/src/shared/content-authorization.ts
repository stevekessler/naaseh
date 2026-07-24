import { authorizeContent, type ContentActor, type ContentPolicyDecision } from '@naaseh/domain';

export interface CanonicalParent {
  id: string;
  ownerId: string;
  locked: boolean;
  groupId?: string;
}

export interface AuthorizationLoaders {
  loadParent(id: string): Promise<CanonicalParent | undefined>;
  loadActor(id: string): Promise<Omit<ContentActor, 'groupIds'> | undefined>;
  loadActiveGroupIds(id: string): Promise<string[]>;
}

export async function authorizeCanonicalParent(
  loaders: AuthorizationLoaders,
  actorId: string,
  parentId: string,
  action: 'read' | 'edit',
): Promise<ContentPolicyDecision> {
  const [parent, actor, groupIds] = await Promise.all([
    loaders.loadParent(parentId),
    loaders.loadActor(actorId),
    loaders.loadActiveGroupIds(actorId),
  ]);
  if (!parent || !actor) return { allowed: false, privileged: false };
  return authorizeContent({
    actor: { ...actor, groupIds },
    ownerId: parent.ownerId,
    ...(parent.groupId ? { groupId: parent.groupId } : {}),
    locked: parent.locked,
    action,
  });
}
