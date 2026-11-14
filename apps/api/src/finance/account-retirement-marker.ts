import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ulidSchema } from '@naaseh/domain';
import { isFinanceScopePartition } from './publication-change-journal.js';
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schema = z
  .object({
    PK: z.string(),
    SK: z.literal('CURRENT'),
    format: z.literal('finance-account-retirement-v1'),
    state: z.literal('retired'),
    accountId: ulidSchema,
    deletionPublicationId: z.string().regex(/^[a-f0-9]{64}$/),
    scopePK: z.string().refine(isFinanceScopePartition),
    scopeRevision: revision,
    revision,
    coverageSourceCount: z.literal(0),
    certificate: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const financeAccountRetirementCertificate = (value: {
  accountId: string;
  deletionPublicationId: string;
  scopePK: string;
  scopeRevision: number;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        value.accountId,
        value.deletionPublicationId,
        value.scopePK,
        value.scopeRevision,
      ]),
    )
    .digest('hex');
export function isFinanceAccountRetired(value: unknown, accountId: string): boolean {
  const parsed = schema.safeParse(value);
  return (
    parsed.success &&
    parsed.data.PK === `FINANCE#PROJECTION_ACCOUNT#${accountId}` &&
    parsed.data.accountId === accountId &&
    parsed.data.certificate === financeAccountRetirementCertificate(parsed.data)
  );
}
/** Only the missing canonical account branch may choose the private retirement worker. */
export class FinancePublicationAccountMissing extends Error {}
