export type FinanceMetricOperation =
  | 'account-mutation'
  | 'csv-import'
  | 'simplefin-claim'
  | 'simplefin-refresh';
export type FinanceMetricOutcome = 'success' | 'partial' | 'failed' | 'conflict' | 'cooldown';

export function financeMetric(
  operation: FinanceMetricOperation,
  outcome: FinanceMetricOutcome,
  durationMs: number,
  itemCount?: number,
) {
  if (!Number.isFinite(durationMs) || durationMs < 0)
    throw new Error('Invalid Finance metric duration.');
  if (itemCount !== undefined && (!Number.isSafeInteger(itemCount) || itemCount < 0))
    throw new Error('Invalid Finance metric count.');
  return { operation, outcome, durationMs, ...(itemCount === undefined ? {} : { itemCount }) };
}
