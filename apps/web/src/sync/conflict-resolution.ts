import type { SyncConflict, Task } from '@naaseh/domain';
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
  reason: 'version_mismatch' | 'authorization_changed' | 'validation_failed';
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
  if (conflict.quarantined && resolution === 'keep-local') {
    throw new Error('Authorization-changed conflicts cannot be replayed');
  }
  if (resolution === 'keep-remote') {
    if (!conflict.remote) throw new Error('Remote entity is unavailable');
    return conflict.remote;
  }
  return { ...conflict.local, version: (conflict.remote?.version ?? conflict.local.version) + 1 };
}
