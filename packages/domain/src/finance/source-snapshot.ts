import { z } from 'zod';

export const financeSourceSnapshotSchema = z
  .object({
    source: z.enum(['manual', 'csv', 'simplefin']),
    sourceId: z.string().min(1).max(300).optional(),
    capturedAt: z.string().datetime(),
    postedAt: z.string().datetime().optional(),
    transactedAt: z.string().datetime().optional(),
    amountMinor: z.number().int().safe().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    description: z.string().max(1_000).optional(),
    payee: z.string().max(500).optional(),
    pending: z.boolean().optional(),
    sourceExtra: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type FinanceSourceSnapshot = z.infer<typeof financeSourceSnapshotSchema>;

export function nextFinanceRevision(currentVersion: number, changedFields: readonly string[]) {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Finance revision version must be a nonnegative safe integer.');
  }
  const fields = [...new Set(changedFields)];
  if (fields.length === 0 || fields.some((field) => !/^[A-Za-z][A-Za-z0-9]*$/.test(field))) {
    throw new Error('Finance revision must identify valid changed fields.');
  }
  return { version: currentVersion + 1, changedFields: fields };
}
