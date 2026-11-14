import { z } from 'zod';
import { sumSpendByCurrency } from '@naaseh/domain';
import type { FinanceQueryFilters } from '@naaseh/contracts';
import type { FinanceFact } from './query-contract.js';

/** Private aggregate input only: never a replacement for a delivered transaction. */
export const financeAccountReadSummarySchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    accountId: z.string().min(1),
    effectiveAt: z.iso.datetime({ offset: true }),
    sourceVersion: z.number().int().positive().safe(),
    active: z.boolean(),
    hasSpend: z.boolean(),
    totals: z.array(
      z
        .object({
          currency: z.string().regex(/^[A-Z]{3}$/),
          currencyExponent: z.number().int().min(0).max(4),
          amountMinor: z.number().int().safe(),
        })
        .strict(),
    ),
    originalSourceAccountIds: z.array(z.string().min(1)),
    budgetIds: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (value) =>
      value.hasSpend === Boolean(value.totals.length) &&
      new Set(value.totals.map((total) => total.currency)).size === value.totals.length,
    'Finance aggregate spend invariant failed.',
  );
export type FinanceAccountReadSummary = z.infer<typeof financeAccountReadSummarySchema>;

export function createFinanceAccountReadSummary(fact: FinanceFact): FinanceAccountReadSummary {
  return financeAccountReadSummarySchema.parse({
    version: 1,
    id: fact.id,
    accountId: fact.accountId,
    effectiveAt: fact.effectiveAt,
    sourceVersion: fact.sourceVersion,
    active: !fact.sourceStatus || fact.sourceStatus === 'active',
    hasSpend: fact.slices.length > 0,
    totals: sumSpendByCurrency(fact.slices),
    originalSourceAccountIds: [...new Set(fact.originalSourceAccountIds ?? [])].sort(),
    budgetIds: [
      ...new Set(fact.slices.flatMap((slice) => (slice.budgetId ? [slice.budgetId] : []))),
    ].sort(),
  });
}

/** Account/name selection is already resolved by the coordinator. Other filters need facts. */
export function supportsFinanceAccountSummary(filters: FinanceQueryFilters) {
  const allowed = new Set(['accountIds', 'accountName', 'postedSpendOnly', 'timeZone']);
  return Object.keys(filters).every((key) => allowed.has(key));
}
