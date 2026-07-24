import { isSupportedEntityType, type EntityType, type VectorCursor } from '@naaseh/domain';

export interface EntityChange {
  entityType: EntityType | string;
  entityId: string;
  version: number;
  operation: 'upsert' | 'tombstone';
  payload?: unknown;
}

export interface GenericPullState {
  entities: Record<string, EntityChange>;
  cursor: VectorCursor;
}

export function deduplicateEntityChanges(changes: readonly EntityChange[]): EntityChange[] {
  const latest = new Map<string, EntityChange>();
  for (const change of changes) {
    const key = `${change.entityType}:${change.entityId}`;
    const current = latest.get(key);
    if (!current || change.version >= current.version) latest.set(key, change);
  }
  return [...latest.values()];
}

export function applyGenericPullBatch(
  state: GenericPullState,
  changes: readonly EntityChange[],
  nextCursor: VectorCursor,
): GenericPullState {
  for (const change of changes) {
    if (!isSupportedEntityType(change.entityType)) {
      throw new Error(`Unsupported entity type: ${change.entityType}`);
    }
    if (!Number.isInteger(change.version) || change.version < 1) {
      throw new Error('Unsupported entity version');
    }
  }
  const entities = { ...state.entities };
  for (const change of deduplicateEntityChanges(changes)) {
    const key = `${change.entityType}:${change.entityId}`;
    if (change.operation === 'tombstone') delete entities[key];
    else entities[key] = { ...change };
  }
  const cursor = { ...state.cursor };
  for (const [audience, sequence] of Object.entries(nextCursor)) {
    cursor[audience] = Math.max(cursor[audience] ?? 0, sequence);
  }
  return { entities, cursor };
}
