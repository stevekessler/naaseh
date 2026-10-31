import { describe, expect, it } from 'vitest';
import {
  buildExperienceFixture,
  experienceId,
} from '../../../../tests/fixtures/finance/experience.js';
import { createExpenseRefundRelationship } from './refund.js';
import { buildSpendSlices, filterSpendSlices, sumSpendByCurrency } from './spend.js';
import { calculateDashboardBudgetTotals } from './budget-totals.js';

function fixture() {
  const f = buildExperienceFixture();
  const original = f.transactions[0]!;
  const refunds = f.refunds.map((r, index) =>
    createExpenseRefundRelationship({
      id: r.id,
      original,
      refund: f.transactions[index + 1]!,
      linkedAmountMinor: r.linkedAmountMinor,
      refundedAllocations: r.allocations,
      confirmedPartialAllocations: true,
      existing: [],
      budgetItems: f.budgetItems,
      actorId: f.actors.owner.id,
      now: new Date('2026-10-31T18:00:00Z'),
    }),
  );
  const slices = f.transactions.flatMap((transaction) =>
    buildSpendSlices(transaction, {
      budgetItems: f.budgetItems,
      refund: refunds.find((r) => r.refundTransactionId === transaction.id),
      original,
    }),
  );
  return { ...f, slices, refunds };
}

describe('authoritative expense and linked refund contribution slices', () => {
  it('counts expense magnitudes once and refunds negatively on their received local date', () => {
    const f = fixture();
    const september = filterSpendSlices(f.slices, {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      timeZone: 'America/Denver',
    });
    const october = filterSpendSlices(f.slices, {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      timeZone: 'America/Denver',
    });
    expect(sumSpendByCurrency(september)).toEqual([
      { currency: 'USD', currencyExponent: 2, amountMinor: 10_800 },
    ]);
    expect(sumSpendByCurrency(october)).toEqual([
      { currency: 'EUR', currencyExponent: 2, amountMinor: 1_000 },
      { currency: 'USD', currencyExponent: 2, amountMinor: -2_000 },
    ]);
    const input = {
      items: f.budgetItems.map((item) => ({
        ...item,
        plannedAmountMinor: -Math.abs(item.plannedAmountMinor),
      })),
      transactions: f.transactions,
      refunds: f.refunds,
      visibleAccountIds: f.accounts.map((a) => a.id),
    };
    expect(calculateDashboardBudgetTotals({ ...input, budgetId: experienceId(200) })).toEqual([
      {
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: 10_000,
        spentMinor: 6_000,
        remainingMinor: 4_000,
        percentUsed: 60,
      },
    ]);
    expect(
      calculateDashboardBudgetTotals({ ...input, budgetId: experienceId(205) })[0],
    ).toMatchObject({
      plannedMinor: 1_000,
      spentMinor: 2_000,
      remainingMinor: -1_000,
      percentUsed: 200,
    });
    expect(
      calculateDashboardBudgetTotals({
        ...input,
        items: input.items.map((item) => ({ ...item, plannedAmountMinor: 0 })),
        budgetId: experienceId(200),
      })[0]!.percentUsed,
    ).toBeNull();
  });

  it('excludes unlinked income, transfers, pending, provisional and unposted transactions', () => {
    const f = fixture();
    for (const transaction of f.transactions.slice(3, 9).filter((t) => t.id !== experienceId(304)))
      expect(buildSpendSlices(transaction, {})).toEqual([]);
    const unposted = { ...f.transactions[4]! };
    delete unposted.postedAt;
    expect(buildSpendSlices(unposted, {})).toEqual([]);
  });

  it('excludes refund contributions awaiting posting, removed or needing review', () => {
    const f = fixture();
    const transaction = f.transactions[1]!;
    for (const refund of [
      { ...f.refunds[0]!, calculationState: 'awaiting-posting' as const },
      { ...f.refunds[0]!, calculationState: 'needs-review' as const },
      { ...f.refunds[0]!, status: 'removed' as const },
    ])
      expect(buildSpendSlices(transaction, { refund, original: f.transactions[0]! })).toEqual([]);
  });

  it('matches budget and category in the same allocation, with OR within a dimension', () => {
    const f = fixture();
    const slices = f.slices.filter((s) => s.transactionId === experienceId(300));
    expect(
      sumSpendByCurrency(
        filterSpendSlices(slices, {
          budgetIds: [experienceId(200)],
          categoryIds: [experienceId(500)],
        }),
      )[0]!.amountMinor,
    ).toBe(6_000);
    expect(
      filterSpendSlices(slices, {
        budgetItemIds: [experienceId(600)],
        categoryIds: [experienceId(501)],
      }),
    ).toEqual([]);
    expect(
      sumSpendByCurrency(
        filterSpendSlices(slices, { categoryIds: [experienceId(500), experienceId(501)] }),
      )[0]!.amountMinor,
    ).toBe(10_000);
  });

  it('keeps refund account/merchant identity while using immutable original classification snapshots', () => {
    const f = fixture();
    const refundTransaction = {
      ...f.transactions[1]!,
      accountId: experienceId(100),
      merchantId: experienceId(551),
    };
    const original = structuredClone(f.transactions[0]!);
    original.allocations[0]!.financeCategoryId = experienceId(599);
    const slices = buildSpendSlices(refundTransaction, { refund: f.refunds[0]!, original });
    expect(slices[0]).toMatchObject({
      accountId: experienceId(100),
      merchantId: experienceId(551),
      categoryId: experienceId(500),
      amountMinor: -2_500,
    });
    expect(filterSpendSlices(slices, { accountIds: [experienceId(101)] })).toEqual([]);
  });

  it('uses an explicit unallocated slice without inventing budget or category associations', () => {
    const f = fixture();
    const transaction = f.transactions[10]!;
    const slices = buildSpendSlices(transaction, {});
    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ amountMinor: 800 });
    expect(slices[0]!.categoryId).toBeUndefined();
    expect(filterSpendSlices(slices, { categoryIds: [experienceId(500)] })).toEqual([]);
  });

  it('rejects currency exponent mismatches and integer overflow rather than rounding', () => {
    const f = fixture();
    const sample = f.slices[0]!;
    expect(() =>
      sumSpendByCurrency([
        { ...sample, amountMinor: Number.MAX_SAFE_INTEGER },
        { ...sample, amountMinor: 1 },
      ]),
    ).toThrow(/safe|range|overflow/i);
    expect(() => sumSpendByCurrency([sample, { ...sample, currencyExponent: 3 }])).toThrow(
      /currency|exponent/i,
    );
    expect(() =>
      buildSpendSlices({ ...f.transactions[0]!, amountMinor: -Number.MAX_VALUE }, {}),
    ).toThrow();
  });

  it('rejects reversed ranges, invalid zones and stale original principal without yielding exact totals', () => {
    const f = fixture();
    expect(() =>
      filterSpendSlices(f.slices, { dateFrom: '2026-11-01', dateTo: '2026-10-01' }),
    ).toThrow();
    expect(() => filterSpendSlices(f.slices, { timeZone: 'Not/AZone' })).toThrow();
    expect(
      buildSpendSlices(f.transactions[1]!, {
        refund: f.refunds[0]!,
        original: { ...f.transactions[0]!, amountMinor: -1_000 },
      }),
    ).toEqual([]);
  });
});
