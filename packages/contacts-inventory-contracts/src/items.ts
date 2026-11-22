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

export const baseItemFieldsSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  locationId: catalogIdSchema,
  type: z.literal('base'),
});

export const whoMedSchema = z.enum(['steve', 'heather', 'both', 'penny', 'otc']);
export const medicineStatusSchema = z.enum(['current', 'discontinued']);
export const timeTakenSchema = z.enum(['morning', 'night', 'morning-and-night', 'prn']);

export const medicineFieldsSchema = baseItemFieldsSchema.extend({
  type: z.literal('medicine'),
  whoMed: whoMedSchema,
  status: medicineStatusSchema,
  includeOnMedList: z.boolean().default(false),
  strengthNumber: z.number().optional(),
  strengthUnitId: catalogIdSchema.optional(),
  other: z.string().trim().max(500).optional(),
  dose: z.string().trim().max(300).optional(),
  timeTaken: timeTakenSchema,
  expirationDate: z.iso.date().optional(),
  prescriberId: z
    .uuid()
    .transform((id) => id.toLowerCase())
    .optional(),
});
export const itemFieldsSchema = z.discriminatedUnion('type', [
  baseItemFieldsSchema,
  medicineFieldsSchema,
]);
export type ItemFields = z.infer<typeof itemFieldsSchema>;
export type MedicineFields = z.infer<typeof medicineFieldsSchema>;

export function itemPayload(fields: ItemFields) {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  );
}

export const strengthUnitSchema = z.strictObject({
  id: catalogIdSchema,
  name: z.string().trim().min(1).max(80),
  revision: z.int().positive(),
});

export const defaultStrengthUnits = Object.entries({
  mg: 'mg',
  g: 'G',
  mcg: 'mcg',
  oz: 'oz',
  ml: 'mL',
  iu: 'IU',
  'g-per-ml': 'g/mL',
}).map(([id, name]) => ({ id, name, revision: 1 }));
