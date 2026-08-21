import {
  createList,
  createListItem,
  createUlid,
  matchesUrgencySet,
  archiveList,
  finishList,
  restoreList,
  transitionListItem,
  listSchema,
  type List,
  type ListItem,
  type Urgency,
} from '@naaseh/domain';
import { db, type EncryptedEntityRecord } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

async function record(
  namespace: string,
  value: {
    id: string;
    updatedAt: string;
    listId?: string;
    parentId?: string;
    projectId?: string | undefined;
    lifecycle?: string | undefined;
    urgency?: Urgency | undefined;
  },
): Promise<EncryptedEntityRecord> {
  return {
    id: value.id,
    ...((value.listId ?? value.parentId) ? { taskId: value.listId ?? value.parentId } : {}),
    ...(value.projectId ? { projectId: value.projectId } : {}),
    ...(value.lifecycle ? { lifecycle: value.lifecycle } : {}),
    ...(value.urgency ? { urgency: value.urgency } : {}),
    updatedAt: value.updatedAt,
    value: await encryptLocalValue(namespace, value.id, value),
  };
}
async function queue(
  entityType: 'list' | 'listItem',
  entityId: string,
  operation:
    | 'create'
    | 'update'
    | 'complete'
    | 'reopen'
    | 'delete'
    | 'reorder'
    | 'resetOverrides'
    | 'lock'
    | 'unlock'
    | 'finish'
    | 'archive'
    | 'restore',
  baseVersion: number,
  payload: unknown,
  createdAt: string,
) {
  const id = createUlid();
  return {
    id,
    entityId,
    entityType,
    operation,
    baseVersion,
    payload: await encryptLocalValue('mutation', id, payload),
    createdAt,
    attempts: 0,
  };
}
export async function listLocalLists(): Promise<List[]> {
  const rows = await db.secureLists.orderBy('updatedAt').reverse().toArray();
  return Promise.all(
    rows.map(async (row) =>
      listSchema.parse(await decryptLocalValue<List>('list', row.id, row.value)),
    ),
  );
}

export async function listLocalListsByUrgency(urgencies: readonly List['urgency'][]) {
  const lists = await listLocalLists();
  return lists.filter((list) => matchesUrgencySet(list.urgency, urgencies));
}
export async function listLocalListItems(listId: string): Promise<ListItem[]> {
  const rows = await db.secureListItems.toArray();
  const values = await Promise.all(
    rows.map((row) => decryptLocalValue<ListItem>('listItem', row.id, row.value)),
  );
  return values
    .filter((item) => item.listId === listId && item.status !== 'removed')
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id));
}
export async function saveNewList(
  name: string,
  ownerId: string,
  projectId?: string,
  urgency?: Urgency,
): Promise<List> {
  const value = createList(
    {
      name,
      ...(projectId ? { projectId } : {}),
      ...(urgency ? { urgency } : {}),
    },
    ownerId,
  );
  const [stored, mutation] = await Promise.all([
    record('list', value),
    queue('list', value.id, 'create', 0, value, value.createdAt),
  ]);
  await db.transaction('rw', db.secureLists, db.outbox, async () => {
    await db.secureLists.add(stored);
    await db.outbox.add(mutation);
  });
  return value;
}
export async function updateLocalList(current: List, patch: Partial<List>): Promise<List> {
  const wantsArchive = patch.lifecycle === 'archived' || patch.status === 'archived';
  const wantsRestore = patch.lifecycle === 'active' && current.lifecycle === 'archived';
  const operation = wantsRestore
    ? 'restore'
    : wantsArchive
      ? patch.archiveReason === 'finished'
        ? 'finish'
        : 'archive'
      : patch.locked === true
        ? 'lock'
        : patch.locked === false
          ? 'unlock'
          : 'update';
  const transitioned = wantsRestore
    ? restoreList(current, current.ownerId)
    : wantsArchive
      ? patch.archiveReason === 'finished'
        ? finishList(current, current.ownerId)
        : archiveList(current, current.ownerId)
      : {
          ...current,
          updatedAt: new Date().toISOString(),
          version: current.version + 1,
        };
  const next = listSchema.parse({ ...transitioned, ...patch });
  const [stored, mutation] = await Promise.all([
    record('list', next),
    queue('list', next.id, operation, current.version, patch, next.updatedAt),
  ]);
  await db.transaction('rw', db.secureLists, db.outbox, async () => {
    await db.secureLists.put(stored);
    await db.outbox.add(mutation);
  });
  return next;
}
export async function addLocalListItem(
  listId: string,
  input: { name: string; amountMinor: number | null },
  actorId: string,
  directory?: { id: string; amountMinor: number | null; version: number },
): Promise<ListItem> {
  const items = await listLocalListItems(listId);
  const value = createListItem(
    listId,
    {
      name: input.name,
      amountMinor: input.amountMinor,
      ...(directory
        ? {
            directoryItemId: directory.id,
            amountMinor: directory.amountMinor,
            directoryVersion: directory.version,
          }
        : {}),
    },
    actorId,
    items.at(-1)?.orderKey,
  );
  const [stored, mutation] = await Promise.all([
    record('listItem', value),
    queue('listItem', value.id, 'create', 0, value, value.createdAt),
  ]);
  await db.transaction('rw', db.secureListItems, db.outbox, async () => {
    await db.secureListItems.add(stored);
    await db.outbox.add(mutation);
  });
  return value;
}
export async function updateLocalListItem(
  item: ListItem,
  patch: Partial<ListItem>,
  actorId: string,
): Promise<ListItem> {
  const now = new Date();
  const next =
    patch.status && patch.status !== item.status
      ? transitionListItem(item, patch.status, actorId, now)
      : { ...item, ...patch, updatedAt: now.toISOString(), version: item.version + 1 };
  const operation =
    patch.status === 'completed'
      ? 'complete'
      : patch.status === 'open'
        ? 'reopen'
        : patch.status === 'removed'
          ? 'delete'
          : patch.orderKey
            ? 'reorder'
            : 'resetOverrides' in patch
              ? 'resetOverrides'
              : 'update';
  const [stored, mutation] = await Promise.all([
    record('listItem', next),
    queue('listItem', item.id, operation, item.version, patch, next.updatedAt),
  ]);
  await db.transaction('rw', db.secureListItems, db.outbox, async () => {
    await db.secureListItems.put(stored);
    await db.outbox.add(mutation);
  });
  return next;
}

export async function editLocalListItem(
  item: ListItem,
  input: { name: string; amountMinor: number | null },
  actorId: string,
): Promise<ListItem> {
  return updateLocalListItem(
    item,
    item.directoryItemId
      ? {
          nameOverride: input.name,
          valueOverride:
            input.amountMinor === null
              ? { kind: 'none' as const }
              : { kind: 'amount' as const, amountMinor: input.amountMinor },
        }
      : {
          directorySnapshot: {
            ...item.directorySnapshot,
            name: input.name,
            amountMinor: input.amountMinor,
          },
        },
    actorId,
  );
}

export async function resetLocalListItemOverrides(item: ListItem): Promise<ListItem> {
  const now = new Date().toISOString();
  const next: ListItem = {
    ...item,
    nameOverride: undefined,
    valueOverride: undefined,
    updatedAt: now,
    version: item.version + 1,
  };
  const [stored, mutation] = await Promise.all([
    record('listItem', next),
    queue('listItem', item.id, 'resetOverrides', item.version, {}, now),
  ]);
  await db.transaction('rw', db.secureListItems, db.outbox, async () => {
    await db.secureListItems.put(stored);
    await db.outbox.add(mutation);
  });
  return next;
}

export async function linkLocalListItemToDirectory(
  item: ListItem,
  directory: { id: string; name: string; amountMinor: number | null; version: number },
  actorId: string,
): Promise<ListItem> {
  return updateLocalListItem(
    item,
    {
      directoryItemId: directory.id,
      directorySnapshot: {
        name: directory.name,
        amountMinor: directory.amountMinor,
        version: directory.version,
      },
      nameOverride: undefined,
      valueOverride: undefined,
    },
    actorId,
  );
}

export async function reorderLocalListItems(items: readonly ListItem[]): Promise<void> {
  const now = new Date().toISOString();
  const changes = await Promise.all(
    items.map(async (item, index) => {
      const orderKey = String((index + 1) * 10).padStart(12, '0');
      if (orderKey === item.orderKey) return undefined;
      const next = { ...item, orderKey, updatedAt: now, version: item.version + 1 };
      return {
        stored: await record('listItem', next),
        mutation: await queue('listItem', item.id, 'reorder', item.version, { orderKey }, now),
      };
    }),
  );
  await db.transaction('rw', db.secureListItems, db.outbox, async () => {
    for (const change of changes) {
      if (!change) continue;
      await db.secureListItems.put(change.stored);
      await db.outbox.add(change.mutation);
    }
  });
}
