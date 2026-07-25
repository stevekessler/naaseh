export interface ContentActor {
  id: string;
  role: 'admin' | 'user';
  active: boolean;
  groupIds: string[];
}

export interface ContentPolicyInput {
  actor: ContentActor;
  ownerId: string;
  locked: boolean;
  groupId?: string;
  action?: 'read' | 'edit';
}

export interface ContentPolicyDecision {
  allowed: boolean;
  privileged: boolean;
}

export interface ContentAudienceInput {
  ownerId: string;
  locked: boolean;
  groupId?: string;
}

export function contentAudienceFor(input: ContentAudienceInput): {
  ordinary: `OWNER#${string}` | `GROUP#${string}` | 'PUBLIC';
  administrator: 'ADMIN';
} {
  return {
    ordinary: input.locked
      ? `OWNER#${input.ownerId}`
      : input.groupId
        ? `GROUP#${input.groupId}`
        : 'PUBLIC',
    administrator: 'ADMIN',
  };
}

export function authorizeContent(input: ContentPolicyInput): ContentPolicyDecision {
  const { actor } = input;
  const action = input.action ?? 'read';
  if (!actor.active) return { allowed: false, privileged: false };
  if (actor.id === input.ownerId) return { allowed: true, privileged: false };
  if (actor.role === 'admin') {
    return action === 'read'
      ? { allowed: true, privileged: true }
      : { allowed: false, privileged: false };
  }
  if (action === 'edit' || input.locked) return { allowed: false, privileged: false };
  if (input.groupId && !actor.groupIds.includes(input.groupId)) {
    return { allowed: false, privileged: false };
  }
  return { allowed: true, privileged: false };
}
