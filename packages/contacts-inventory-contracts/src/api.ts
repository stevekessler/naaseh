import { z } from 'zod';

export const syncCursorSchema = z.object({
  generation: z.int().positive(),
  sequence: z.int().nonnegative(),
});
export type SyncCursor = z.infer<typeof syncCursorSchema>;

export const recordKindSchema = z.enum(['contact', 'item']);
export const recordIdentitySchema = z.object({
  kind: recordKindSchema,
  id: z.uuid(),
  revision: z.int().positive(),
  lastChangeSequence: z.int().positive(),
});
export const tombstoneSchema = recordIdentitySchema.extend({
  deleted: z.literal(true),
});
export type Tombstone = z.infer<typeof tombstoneSchema>;

export const mutationPreconditionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create'), generation: z.int().positive(), mutationId: z.uuid() }),
  z.object({
    mode: z.literal('update'),
    generation: z.int().positive(),
    mutationId: z.uuid(),
    revision: z.int().positive(),
  }),
]);

export function featureApiPrefix(releaseId: string) {
  return `/api/v1/contacts-inventory/releases/${releaseId}/`;
}
