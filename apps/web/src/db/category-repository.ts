import {
  archiveCategory,
  categorySchema,
  createUlid,
  restoreCategory,
  type CategoryRecord,
} from '@naaseh/domain';
import { db } from './database.js';
import { atomicEncryptedEntityAndMutation } from './outbox.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

const record = async (category: CategoryRecord) => ({
  id: category.id,
  lifecycle: category.lifecycle ?? (category.archived ? 'archived' : 'active'),
  updatedAt: category.updatedAt ?? String(category.version),
  value: await encryptLocalValue('category', category.id, category),
});

export async function listLocalCategories() {
  return Promise.all(
    (await db.secureCategories.toArray()).map((item) =>
      decryptLocalValue<CategoryRecord>('category', item.id, item.value),
    ),
  );
}

export async function saveNewLocalCategory(input: { name: string; color: string }) {
  const now = new Date().toISOString();
  const category = categorySchema.parse({
    id: createUlid(),
    ...input,
    archived: false,
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  const id = createUlid();
  await atomicEncryptedEntityAndMutation(await record(category), {
    id,
    entityId: category.id,
    entityType: 'category',
    operation: 'create',
    baseVersion: 0,
    payload: await encryptLocalValue('mutation', id, category),
    createdAt: now,
    attempts: 0,
  });
  return category;
}

export async function updateLocalCategory(current: CategoryRecord, patch: Partial<CategoryRecord>) {
  const now = new Date().toISOString();
  const category = categorySchema.parse({
    ...current,
    ...patch,
    updatedAt: now,
    version: current.version + 1,
  });
  const id = createUlid();
  await atomicEncryptedEntityAndMutation(await record(category), {
    id,
    entityId: category.id,
    entityType: 'category',
    operation: 'update',
    baseVersion: current.version,
    payload: await encryptLocalValue('mutation', id, patch),
    createdAt: now,
    attempts: 0,
  });
  return category;
}

export async function changeLocalCategoryLifecycle(
  current: CategoryRecord,
  action: 'archive' | 'restore',
  actorId: string,
) {
  const category =
    action === 'archive' ? archiveCategory(current, actorId) : restoreCategory(current);
  const id = createUlid();
  await atomicEncryptedEntityAndMutation(await record(category), {
    id,
    entityId: category.id,
    entityType: 'category',
    operation: action === 'archive' ? 'archiveOrganization' : 'restoreOrganization',
    baseVersion: current.version,
    payload: await encryptLocalValue('mutation', id, { action }),
    createdAt: category.updatedAt ?? new Date().toISOString(),
    attempts: 0,
  });
  return category;
}

export async function purgeLocalCategory(id: string) {
  await db.transaction('rw', db.secureCategories, db.outbox, db.secureConflicts, async () => {
    await db.secureCategories.delete(id);
    await db.outbox.where('entityId').equals(id).delete();
    await db.secureConflicts.where('id').equals(id).delete();
  });
}
