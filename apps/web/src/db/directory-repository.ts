import type { GlobalDirectoryItem } from '@naaseh/domain';
import { createUlid, directoryItemSchema } from '@naaseh/domain';
import { db } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';
export async function listLocalDirectoryItems(): Promise<GlobalDirectoryItem[]> {
  const rows = await db.secureDirectoryItems.orderBy('updatedAt').reverse().toArray();
  return Promise.all(
    rows.map((row) => decryptLocalValue<GlobalDirectoryItem>('directoryItem', row.id, row.value)),
  );
}
export async function saveDirectoryItem(
  input: {
    name: string;
    amountMinor: number | null;
    currency?: string;
    status?: 'active' | 'archived';
  },
  actorId: string,
  current?: GlobalDirectoryItem,
) {
  const now = new Date().toISOString();
  const item = directoryItemSchema.parse(
    current
      ? { ...current, ...input, updatedBy: actorId, updatedAt: now, version: current.version + 1 }
      : {
          id: createUlid(),
          ...input,
          currency: input.currency ?? 'USD',
          status: input.status ?? 'active',
          createdBy: actorId,
          updatedBy: actorId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        },
  );
  const mutationId = createUlid();
  const [value, payload] = await Promise.all([
    encryptLocalValue('directoryItem', item.id, item),
    encryptLocalValue('mutation', mutationId, item),
  ]);
  await db.transaction('rw', db.secureDirectoryItems, db.outbox, async () => {
    await db.secureDirectoryItems.put({ id: item.id, updatedAt: item.updatedAt, value });
    await db.outbox.add({
      id: mutationId,
      entityId: item.id,
      entityType: 'directoryItem',
      operation: current ? 'update' : 'create',
      baseVersion: current?.version ?? 0,
      payload,
      createdAt: item.updatedAt,
      attempts: 0,
    });
  });
  return item;
}
