import { z } from 'zod';
import { ulidSchema } from './primitives.js';

export const amountMinorSchema = z.number().int().safe();
export const directoryItemSchema = z
  .object({
    id: ulidSchema,
    name: z.string().trim().min(1).max(300),
    amountMinor: amountMinorSchema.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(['active', 'archived']),
    createdBy: z.string().min(1),
    updatedBy: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict();
export type GlobalDirectoryItem = z.infer<typeof directoryItemSchema>;

export const directorySnapshotSchema = z
  .object({
    name: z.string().min(1).max(300),
    amountMinor: amountMinorSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export const valueOverrideSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('amount'), amountMinor: amountMinorSchema }).strict(),
]);
export interface DirectoryLinkFields {
  directorySnapshot: z.infer<typeof directorySnapshotSchema>;
  nameOverride?: string;
  valueOverride?: z.infer<typeof valueOverrideSchema>;
}

export function effectiveDirectoryFields(
  link: DirectoryLinkFields,
  current?: Pick<GlobalDirectoryItem, 'name' | 'amountMinor'>,
) {
  return {
    name: link.nameOverride ?? current?.name ?? link.directorySnapshot.name,
    amountMinor:
      link.valueOverride?.kind === 'none'
        ? null
        : link.valueOverride?.kind === 'amount'
          ? link.valueOverride.amountMinor
          : (current?.amountMinor ?? link.directorySnapshot.amountMinor),
  };
}

export function resetDirectoryOverrides<T extends DirectoryLinkFields>(
  link: T,
): Omit<T, 'nameOverride' | 'valueOverride'> {
  const reset = { ...link };
  delete reset.nameOverride;
  delete reset.valueOverride;
  return reset;
}
