import {
  categorySchema,
  canonicalCategoryName,
  createUlid,
  type CategoryRecord,
} from '@naaseh/domain';
import { createCategoryRecord, getCategory, updateCategoryRecord } from './category-repository.js';

export const canonicalManagedCategoryName = canonicalCategoryName;

export async function createManagedCategory(input: { name: string; color: string }) {
  const now = new Date().toISOString();
  const value = categorySchema.parse({
    id: createUlid(),
    ...input,
    archived: false,
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  await createCategoryRecord(value);
  return value;
}

export async function editManagedCategory(
  id: string,
  patch: Partial<Pick<CategoryRecord, 'name' | 'color' | 'defaultAssigneeId'>>,
  expectedVersion: number,
) {
  const current = await getCategory(id);
  if (!current) throw new Error('Category not found.');
  if (current.version !== expectedVersion) throw new Error('Category version changed.');
  const next = categorySchema.parse({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
  });
  await updateCategoryRecord(current, next);
  return next;
}
