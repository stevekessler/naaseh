import { z } from 'zod';
import { ulidSchema } from './primitives.js';
export const categorySchema = z
  .object({
    id: ulidSchema,
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    defaultAssigneeId: z.string().optional(),
    archived: z.boolean().default(false),
    lifecycle: z.enum(['active', 'archived']).optional(),
    groupId: z.string().min(1).optional(),
    archivedAt: z.string().datetime().optional(),
    archivedBy: z.string().min(1).optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    version: z.number().int().positive().default(1),
  })
  .strict();
export type CategoryRecord = z.infer<typeof categorySchema>;
export type Category = CategoryRecord;
export const archiveCategory = (
  category: CategoryRecord,
  actorId = 'system',
  now = new Date(),
): CategoryRecord => {
  if ((category.lifecycle ?? (category.archived ? 'archived' : 'active')) === 'archived')
    throw new Error('Category is already archived.');
  const timestamp = now.toISOString();
  return categorySchema.parse({
    ...category,
    archived: true,
    lifecycle: 'archived',
    archivedAt: timestamp,
    archivedBy: actorId,
    updatedAt: timestamp,
    version: category.version + 1,
  });
};

export const restoreCategory = (category: CategoryRecord, now = new Date()): CategoryRecord => {
  if ((category.lifecycle ?? (category.archived ? 'archived' : 'active')) !== 'archived')
    throw new Error('Category is not archived.');
  return categorySchema.parse({
    ...category,
    archived: false,
    lifecycle: 'active',
    archivedAt: undefined,
    archivedBy: undefined,
    updatedAt: now.toISOString(),
    version: category.version + 1,
  });
};

export const canonicalCategoryName = (name: string) =>
  name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
