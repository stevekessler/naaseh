import { describe, expect, it } from 'vitest';
import { deriveCurrentBalance, insertBalanceSnapshot, type BalanceSnapshot } from './balance.js';

const snapshots: BalanceSnapshot[] = [
  {
    id: 'snap-1',
    accountId: 'account-1',
    balanceMinor: 1_000,
    currency: 'USD',
    currencyExponent: 2,
    effectiveAt: '2026-01-10T12:00:00.000Z',
    recordedAt: '2026-01-10T13:00:00.000Z',
    source: 'manual' as const,
  },
];

describe('balance history', () => {
  it('uses the latest baseline and only strictly later transactions', () => {
    expect(
      deriveCurrentBalance(snapshots, [
        { amountMinor: -100, effectiveAt: '2026-01-10T12:00:00.000Z' },
        { amountMinor: -250, effectiveAt: '2026-01-10T12:00:00.001Z' },
      ]),
    ).toBe(750);
  });

  it('replaces the baseline when a later snapshot arrives without deleting history', () => {
    const later = {
      ...snapshots[0]!,
      id: 'snap-2',
      balanceMinor: 2_000,
      effectiveAt: '2026-01-12T00:00:00.000Z',
      recordedAt: '2026-01-12T01:00:00.000Z',
    };
    expect(
      deriveCurrentBalance(
        [...snapshots, later],
        [
          { amountMinor: -250, effectiveAt: '2026-01-11T00:00:00.000Z' },
          { amountMinor: 300, effectiveAt: '2026-01-13T00:00:00.000Z' },
        ],
      ),
    ).toBe(2_300);
  });

  it('suppresses an idempotent balance snapshot', () => {
    expect(insertBalanceSnapshot(snapshots, { ...snapshots[0]!, id: 'different-id' })).toEqual({
      snapshots,
      inserted: false,
    });
  });
});
