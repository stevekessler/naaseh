import type { List, SyncChange } from '@naaseh/domain';
import { contentAudiences } from '../sync/change-feed-repository.js';
export function listAudienceChanges(
  previous: List | undefined,
  next: List,
): Omit<SyncChange, 'sequence'>[] {
  const before = previous
    ? contentAudiences({
        entityId: previous.id,
        ownerId: previous.ownerId,
        locked: previous.locked,
        ...(previous.groupId ? { groupId: previous.groupId } : {}),
      })
    : [];
  const after = contentAudiences({
    entityId: next.id,
    ownerId: next.ownerId,
    locked: next.locked,
    ...(next.groupId ? { groupId: next.groupId } : {}),
  });
  return [
    ...before
      .filter((audience) => !after.includes(audience))
      .map((audience) => ({
        audience,
        entityType: 'list' as const,
        entityId: next.id,
        version: next.version,
        operation: 'tombstone' as const,
        changedAt: next.updatedAt,
      })),
    ...after.map((audience) => ({
      audience,
      entityType: 'list' as const,
      entityId: next.id,
      version: next.version,
      operation: 'upsert' as const,
      payload: next,
      changedAt: next.updatedAt,
    })),
  ];
}
export function listItemAudienceChanges(
  parent: List,
  item: { id: string; version: number; updatedAt: string; status: string },
  payload: unknown,
): Omit<SyncChange, 'sequence'>[] {
  return contentAudiences({
    entityId: parent.id,
    ownerId: parent.ownerId,
    locked: parent.locked,
    ...(parent.groupId ? { groupId: parent.groupId } : {}),
  }).map((audience) => ({
    audience,
    entityType: 'listItem',
    entityId: item.id,
    version: item.version,
    operation: item.status === 'removed' ? 'tombstone' : 'upsert',
    ...(item.status === 'removed' ? {} : { payload }),
    changedAt: item.updatedAt,
  }));
}
