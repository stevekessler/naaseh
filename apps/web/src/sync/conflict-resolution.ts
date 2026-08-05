import type { SyncConflict, Task } from '@naaseh/domain';
import {
  listLocalStackConflicts,
  resolveLocalStackConflict,
  type LocalStackConflict,
} from '../db/personal-stack-repository.js';
export type Resolution = 'keep-local' | 'keep-remote';
export const resolveConflict = (conflict: SyncConflict, resolution: Resolution): Task =>
  resolution === 'keep-local'
    ? {
        ...conflict.local,
        version: conflict.remote.version + 1,
        updatedAt: new Date().toISOString(),
      }
    : conflict.remote;

export interface PersistedEntityConflict<T = unknown> {
  id: string;
  entityType: string;
  entityId: string;
  local: T;
  remote?: T;
  reason:
    | 'version_mismatch'
    | 'authorization_changed'
    | 'validation_failed'
    | 'lifecycle_changed'
    | 'project_unavailable'
    | 'hard_deleted';
  quarantined: boolean;
  createdAt: string;
}

export const quarantineAuthorizationConflict = <T>(
  conflict: Omit<PersistedEntityConflict<T>, 'quarantined'>,
): PersistedEntityConflict<T> => ({ ...conflict, quarantined: true });

export function resolveEntityConflict<T extends { version: number }>(
  conflict: PersistedEntityConflict<T>,
  resolution: Resolution,
): T {
  if ((conflict.quarantined || conflict.reason === 'hard_deleted') && resolution === 'keep-local') {
    throw new Error('Authorization-changed conflicts cannot be replayed');
  }
  if (resolution === 'keep-remote') {
    if (!conflict.remote) throw new Error('Remote entity is unavailable');
    return conflict.remote;
  }
  return { ...conflict.local, version: (conflict.remote?.version ?? conflict.local.version) + 1 };
}

export type PersonalStackConflictResolution = 'reapply' | 'discard';

export const canReapplyPersonalStackConflict = (conflict: LocalStackConflict) =>
  !['authorization_changed', 'lifecycle_changed', 'project_changed', 'hard_deleted'].includes(
    conflict.reason,
  );

export async function listPersonalStackConflicts(ownerId: string) {
  const conflicts = await listLocalStackConflicts(ownerId);
  return conflicts.map((conflict) => ({
    ...conflict,
    canReapply: canReapplyPersonalStackConflict(conflict),
  }));
}

export async function resolvePersonalStackConflict(
  conflict: LocalStackConflict,
  resolution: PersonalStackConflictResolution,
) {
  if (resolution === 'reapply' && !canReapplyPersonalStackConflict(conflict)) {
    throw new Error('This stack conflict can only be discarded after refreshing authorized work.');
  }
  return resolveLocalStackConflict(conflict.id, resolution);
}
