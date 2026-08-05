export type StackMembershipWorkType = 'task' | 'list';

export interface StackMembershipWorkState {
  id: string;
  ownerId: string;
  version: number;
  updatedAt: string;
  status?: string | undefined;
  lifecycle?: string | undefined;
  completionState?: string | undefined;
  projectId?: string | undefined;
  groupId?: string | undefined;
  visibility?: string | undefined;
  locked?: boolean | undefined;
}

export interface StackWorkMembershipChange {
  entity: 'work';
  kind: 'admit' | 'invalidate' | 'project_reassigned' | 'authorization_changed';
  reason: 'create' | 'restore' | 'archive' | 'delete' | 'project' | 'authorization';
  workType: StackMembershipWorkType;
  workId: string;
  ownerId: string;
  membershipEpoch: string;
  previousProjectId?: string | undefined;
  projectId?: string | undefined;
  preserveOverallPosition: boolean;
}

export interface StackAuthorizationMembershipChange {
  entity: 'authorization';
  kind: 'authorization_changed';
  userId: string;
  groupId: string;
  active: boolean;
  membershipEpoch: string;
}

export type StackMembershipLifecycleChange =
  | StackWorkMembershipChange
  | StackAuthorizationMembershipChange;

export type StackMembershipLifecycleSink = (change: StackMembershipLifecycleChange) => void;

let membershipSink: StackMembershipLifecycleSink = () => undefined;

/** Install the persistence/feed adapter at application composition time. */
export function configureStackMembershipLifecycleSink(
  sink: StackMembershipLifecycleSink,
): () => void {
  const previous = membershipSink;
  membershipSink = sink;
  return () => {
    membershipSink = previous;
  };
}

export function membershipEpochForWork(work: StackMembershipWorkState): string {
  return `${String(work.version).padStart(12, '0')}:${work.updatedAt}`;
}

function active(work: StackMembershipWorkState | undefined): boolean {
  if (work === undefined) return false;
  if (work.status === 'completed' || work.completionState === 'completed') return false;
  const lifecycle = work.lifecycle ?? work.status ?? 'active';
  return lifecycle === 'active' || lifecycle === 'open';
}

function authorizationBasis(work: StackMembershipWorkState): string {
  return [
    work.ownerId,
    work.groupId ?? '',
    work.visibility ?? '',
    work.locked === undefined ? '' : String(work.locked),
  ].join(':');
}

export function stackMembershipChangeForWork(
  workType: StackMembershipWorkType,
  previous: StackMembershipWorkState | undefined,
  next: StackMembershipWorkState | undefined,
  reason?: StackWorkMembershipChange['reason'],
): StackWorkMembershipChange | undefined {
  const wasActive = active(previous);
  const isActive = active(next);
  const work = next ?? previous;
  if (work === undefined) return undefined;

  if (!wasActive && isActive) {
    return {
      entity: 'work',
      kind: 'admit',
      reason: reason ?? (previous === undefined ? 'create' : 'restore'),
      workType,
      workId: work.id,
      ownerId: work.ownerId,
      membershipEpoch: membershipEpochForWork(work),
      ...(work.projectId ? { projectId: work.projectId } : {}),
      preserveOverallPosition: false,
    };
  }

  if (wasActive && !isActive) {
    return {
      entity: 'work',
      kind: 'invalidate',
      reason: reason ?? (next === undefined ? 'delete' : 'archive'),
      workType,
      workId: work.id,
      ownerId: work.ownerId,
      membershipEpoch: membershipEpochForWork(previous ?? work),
      ...(previous?.projectId ? { previousProjectId: previous.projectId } : {}),
      preserveOverallPosition: false,
    };
  }

  if (!isActive || previous === undefined || next === undefined) return undefined;
  if (previous.projectId !== next.projectId) {
    return {
      entity: 'work',
      kind: 'project_reassigned',
      reason: 'project',
      workType,
      workId: next.id,
      ownerId: next.ownerId,
      membershipEpoch: membershipEpochForWork(next),
      ...(previous.projectId ? { previousProjectId: previous.projectId } : {}),
      ...(next.projectId ? { projectId: next.projectId } : {}),
      preserveOverallPosition: true,
    };
  }

  if (authorizationBasis(previous) !== authorizationBasis(next)) {
    return {
      entity: 'work',
      kind: 'authorization_changed',
      reason: 'authorization',
      workType,
      workId: next.id,
      ownerId: next.ownerId,
      membershipEpoch: membershipEpochForWork(next),
      ...(next.projectId ? { projectId: next.projectId } : {}),
      preserveOverallPosition: true,
    };
  }
  return undefined;
}

export function notifyStackMembershipWorkChange(
  workType: StackMembershipWorkType,
  previous: StackMembershipWorkState | undefined,
  next: StackMembershipWorkState | undefined,
  reason?: StackWorkMembershipChange['reason'],
): void {
  const change = stackMembershipChangeForWork(workType, previous, next, reason);
  if (change !== undefined) membershipSink(change);
}

export function notifyStackAuthorizationChange(input: {
  userId: string;
  groupId: string;
  active: boolean;
  changedAt: string;
}): void {
  membershipSink({
    entity: 'authorization',
    kind: 'authorization_changed',
    userId: input.userId,
    groupId: input.groupId,
    active: input.active,
    membershipEpoch: `GROUP:${input.groupId}:${input.changedAt}`.slice(-64),
  });
}
