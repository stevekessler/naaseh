import { z } from 'zod';
import { catalogIdSchema } from './contacts.js';

export const locationFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  details: z.string().max(12_000).optional(),
});

export const locationSchema = locationFieldsSchema.extend({
  id: catalogIdSchema,
  revision: z.int().positive(),
});
export type InventoryLocation = z.infer<typeof locationSchema>;

export const itemFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  locationId: catalogIdSchema,
  type: z.literal('base'),
});
export type ItemFields = z.infer<typeof itemFieldsSchema>;
