import { addMinorUnits } from './money.js';

export interface BalanceSnapshot {
  id: string;
  accountId: string;
  balanceMinor: number;
  availableBalanceMinor?: number;
  currency: string;
  currencyExponent: number;
  effectiveAt: string;
  recordedAt: string;
  source: 'simplefin' | 'manual';
  importJobId?: string;
}

export interface BalanceContribution {
  status?: 'active' | 'archived' | 'tombstone';
  amountMinor: number;
  effectiveAt: string;
}

const order = (a: BalanceSnapshot, b: BalanceSnapshot) =>
  a.effectiveAt.localeCompare(b.effectiveAt) || a.recordedAt.localeCompare(b.recordedAt);

export function deriveCurrentBalance(
  snapshots: readonly BalanceSnapshot[],
  transactions: readonly BalanceContribution[],
): number {
  if (!snapshots.length) throw new Error('A balance baseline is required.');
  const baseline = [...snapshots].sort(order).at(-1)!;
  return addMinorUnits([
    baseline.balanceMinor,
    ...transactions
      .filter(
        (item) =>
          (!item.status || item.status === 'active') && item.effectiveAt > baseline.effectiveAt,
      )
      .map((item) => item.amountMinor),
  ]);
}

export function insertBalanceSnapshot(
  snapshots: readonly BalanceSnapshot[],
  candidate: BalanceSnapshot,
): { snapshots: readonly BalanceSnapshot[]; inserted: boolean } {
  const duplicate = snapshots.some(
    (item) =>
      item.accountId === candidate.accountId &&
      item.effectiveAt === candidate.effectiveAt &&
      item.balanceMinor === candidate.balanceMinor &&
      item.availableBalanceMinor === candidate.availableBalanceMinor &&
      item.currency === candidate.currency &&
      item.currencyExponent === candidate.currencyExponent,
  );
  return duplicate
    ? { snapshots, inserted: false }
    : { snapshots: [...snapshots, candidate], inserted: true };
}
