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
  return listItemAudienceTransitionChanges(parent, parent, item, payload);
}

export function listItemAudienceTransitionChanges(
  previousParent: List,
  nextParent: List,
  item: { id: string; version: number; updatedAt: string; status: string },
  payload: unknown,
): Omit<SyncChange, 'sequence'>[] {
  const audiencesFor = (parent: List) =>
    contentAudiences({
      entityId: parent.id,
      ownerId: parent.ownerId,
      locked: parent.locked,
      ...(parent.groupId ? { groupId: parent.groupId } : {}),
    });
  const before = audiencesFor(previousParent);
  const after = audiencesFor(nextParent);
  return [
    ...before
      .filter((audience) => !after.includes(audience))
      .map((audience) => ({
        audience,
        entityType: 'listItem' as const,
        entityId: item.id,
        version: item.version,
        operation: 'tombstone' as const,
        changedAt: item.updatedAt,
      })),
    ...after.map((audience) => ({
      audience,
      entityType: 'listItem' as const,
      entityId: item.id,
      version: item.version,
      operation: item.status === 'removed' ? ('tombstone' as const) : ('upsert' as const),
      ...(item.status === 'removed' ? {} : { payload }),
      changedAt: item.updatedAt,
    })),
  ];
}

export function completeListAudienceTransitionChanges(
  previous: List,
  next: List,
  items: readonly (Parameters<typeof listItemAudienceTransitionChanges>[2] & object)[],
): Omit<SyncChange, 'sequence'>[] {
  const parentChanges = listAudienceChanges(previous, next);
  const beforeAudience = contentAudiences({
    entityId: previous.id,
    ownerId: previous.ownerId,
    locked: previous.locked,
    ...(previous.groupId ? { groupId: previous.groupId } : {}),
  }).sort();
  const afterAudience = contentAudiences({
    entityId: next.id,
    ownerId: next.ownerId,
    locked: next.locked,
    ...(next.groupId ? { groupId: next.groupId } : {}),
  }).sort();
  if (beforeAudience.join('|') === afterAudience.join('|')) return parentChanges;
  return [
    ...parentChanges,
    ...items
      .filter((item) => item.status !== 'removed')
      .flatMap((item) => movedListItemAudienceChanges(previous, next, item, item)),
  ];
}

/** Changes only the audiences that differ, leaving the unchanged admin feed untouched. */
export function movedListItemAudienceChanges(
  previousParent: List,
  nextParent: List,
  item: { id: string; version: number; updatedAt: string; status: string },
  payload: unknown,
): Omit<SyncChange, 'sequence'>[] {
  const audiencesFor = (parent: List) =>
    contentAudiences({
      entityId: parent.id,
      ownerId: parent.ownerId,
      locked: parent.locked,
      ...(parent.groupId ? { groupId: parent.groupId } : {}),
    });
  const before = audiencesFor(previousParent);
  const after = audiencesFor(nextParent);
  return [
    ...before
      .filter((audience) => !after.includes(audience))
      .map((audience) => ({
        audience,
        entityType: 'listItem' as const,
        entityId: item.id,
        version: item.version,
        operation: 'tombstone' as const,
        changedAt: item.updatedAt,
      })),
    ...after
      .filter((audience) => !before.includes(audience))
      .map((audience) => ({
        audience,
        entityType: 'listItem' as const,
        entityId: item.id,
        version: item.version,
        operation: item.status === 'removed' ? ('tombstone' as const) : ('upsert' as const),
        ...(item.status === 'removed' ? {} : { payload }),
        changedAt: item.updatedAt,
      })),
  ];
}
