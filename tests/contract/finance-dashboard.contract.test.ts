import {
  financeDashboardBudgetResponseSchema,
  financeDashboardFlagUpdateSchema,
  financeDashboardPreferencesResponseSchema,
  financeDashboardSettingsUpdateSchema,
  financeQueryEnvelopeSchema,
  financeSpendTrendRequestSchema,
} from '@naaseh/contracts';
import { expect, it } from 'vitest';
import { experienceId } from '../fixtures/finance/experience.js';

it('keeps dashboard preferences caller-scoped and validates the versioned upcoming count', () => {
  const flag = { targetKind: 'account', targetId: experienceId(1), included: true, version: 1 };
  const settings = { upcomingCount: 20, version: 1 };
  expect(financeDashboardPreferencesResponseSchema.parse({ flags: [flag], settings })).toEqual({
    flags: [flag],
    settings,
  });
  expect(
    financeDashboardFlagUpdateSchema.safeParse({ included: true, ownerId: 'other' }).success,
  ).toBe(false);
  expect(
    financeDashboardSettingsUpdateSchema.safeParse({ upcomingCount: 12, expectedVersion: 0 })
      .success,
  ).toBe(false);
  expect(
    financeDashboardPreferencesResponseSchema.safeParse({
      flags: [{ ...flag, ownerId: 'other' }],
      settings,
    }).success,
  ).toBe(false);
});

it('keeps a partial open-budget projection distinct from an absent budget', () => {
  const budget = {
    id: experienceId(2),
    name: 'Visible budget',
    startDate: '2026-11-01',
    items: [
      { id: experienceId(3), currency: 'USD', currencyExponent: 2, plannedAmountMinor: -450 },
    ],
    accountIds: [experienceId(1)],
    complete: false,
  };
  expect(financeDashboardBudgetResponseSchema.parse(budget)).toEqual(budget);
  expect(financeDashboardBudgetResponseSchema.parse(null)).toBeNull();
  expect(
    financeDashboardBudgetResponseSchema.safeParse({ ...budget, hiddenAccountCount: 2 }).success,
  ).toBe(false);
});

it('separates usable activity from exact refund-aware totals', () => {
  const response = {
    items: [{ id: experienceId(4), amountMinor: 125 }],
    asOf: '2026-11-22T12:00:00.000Z',
    projectionRevision: 'revision-one',
    rowsState: 'ready',
    aggregateState: 'pending',
    complete: false,
    coverage: { examined: 1, scopeComplete: false },
  };
  const totalsByCurrency = [{ currency: 'USD', currencyExponent: 2, amountMinor: -125 }];
  expect(financeQueryEnvelopeSchema.parse(response).rowsState).toBe('ready');
  expect(financeQueryEnvelopeSchema.safeParse({ ...response, totalsByCurrency }).success).toBe(
    false,
  );
  expect(
    financeQueryEnvelopeSchema.safeParse({
      ...response,
      complete: true,
      aggregateState: 'exact',
      totalsByCurrency,
    }).success,
  ).toBe(false);
  expect(
    financeQueryEnvelopeSchema.parse({
      ...response,
      complete: true,
      coverage: { examined: 1, scopeComplete: true },
      aggregateState: 'exact',
      totalCount: 1,
      totalsByCurrency,
    }).totalsByCurrency,
  ).toEqual(totalsByCurrency);
  expect(
    financeSpendTrendRequestSchema.safeParse({
      mode: 'month',
      period: 0,
      timeZone: 'invalid-zone',
      accountIds: [experienceId(1)],
    }).success,
  ).toBe(false);
});
