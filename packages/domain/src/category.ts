import { z } from 'zod';
import { ulidSchema } from './primitives.js';
export const categorySchema = z
  .object({
    id: ulidSchema,
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    defaultAssigneeId: z.string().optional(),
    archived: z.boolean().default(false),
    version: z.number().int().positive().default(1),
  })
  .strict();
export type CategoryRecord = z.infer<typeof categorySchema>;
export type Category = CategoryRecord;
export const archiveCategory = (category: CategoryRecord): CategoryRecord =>
  categorySchema.parse({ ...category, archived: true, version: category.version + 1 });
