import { expect, test, type Page } from '@playwright/test';
import { signIn } from '../e2e/enhanced-helpers.js';
import { FINANCE_PERFORMANCE_PROFILE, percentile95 } from './fixtures/finance.js';

const account = {
  id: 'finance-performance-account-00',
  organizationName: 'Performance Bank',
  sourceName: 'Checking',
  friendlyName: 'Performance Bank - Checking',
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 100_000,
  scope: { type: 'owner', ownerId: 'local-steve' },
  status: 'active',
  version: 1,
};
const merchant = {
  id: 'finance-performance-merchant-000',
  name: 'Performance Merchant',
  city: 'Denver',
  region: 'CO',
  status: 'active',
  version: 1,
};
const budget = {
  id: 'finance-performance-budget',
  groupId: '01J00000000000000000000999',
  name: 'Performance budget',
  budgetDate: '2026-10-01',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  status: 'active',
  items: [],
  totals: [],
  totalsComplete: true,
  version: 1,
};

async function routeFinance(page: Page) {
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [account], cursor: null }),
    }),
  );
  await page.route(`**/api/v1/finance/accounts/${account.id}/transactions`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'finance-performance-transaction',
            accountId: account.id,
            description: 'Performance needle purchase',
            merchantId: merchant.id,
            amountMinor: -1_000,
            currency: 'USD',
            currencyExponent: 2,
            effectiveAt: '2026-10-01T12:00:00.000Z',
            status: 'active',
            allocations: [],
            version: 1,
          },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/merchants', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [merchant], cursor: null }),
    }),
  );
  await page.route('**/api/v1/finance/categories', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
  await page.route('**/api/v1/finance/review-issues', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
  await page.route('**/api/v1/finance/budgets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [budget], cursor: null }),
    }),
  );
}

test('Finance landing, merchant, budget, and search stay responsive under constrained Chromium', async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== 'chromium', 'CDP throttling is a Chromium performance gate.');
  await routeFinance(page);
  await signIn(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: 1_250_000,
    uploadThroughput: 1_250_000,
    connectionType: 'cellular4g',
  });
  await page.getByRole('button', { name: 'Finance' }).click();
  await expect(page.getByRole('heading', { name: 'Finance', exact: true })).toBeVisible();

  const samples: Record<'landing' | 'merchant' | 'budget' | 'search', number[]> = {
    landing: [],
    merchant: [],
    budget: [],
    search: [],
  };
  const refreshProgress: number[] = [];
  for (
    let iteration = 0;
    iteration < FINANCE_PERFORMANCE_PROFILE.measuredIterations;
    iteration += 1
  ) {
    let startedAt = performance.now();
    await page.getByRole('button', { name: 'Accounts', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
    samples.landing.push(performance.now() - startedAt);

    startedAt = performance.now();
    await page.getByRole('button', { name: 'Merchants', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Merchants', exact: true })).toBeVisible();
    samples.merchant.push(performance.now() - startedAt);

    startedAt = performance.now();
    await page.getByRole('button', { name: 'Budgets', exact: true }).click();
    await expect(page.getByText('Performance budget', { exact: true })).toBeVisible();
    samples.budget.push(performance.now() - startedAt);

    startedAt = performance.now();
    await page.getByRole('button', { name: 'Transactions', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Indexing transactions|transactions? found/u }),
    ).toBeVisible();
    refreshProgress.push(performance.now() - startedAt);
    const search = page.getByLabel('Search transactions');
    await search.fill('performance needle');
    await expect(
      page.getByRole('article', { name: 'Performance needle purchase transaction' }),
    ).toBeVisible();
    samples.search.push(performance.now() - startedAt);
  }

  for (const [journey, timings] of Object.entries(samples)) {
    const p95Ms = percentile95(timings);
    console.info(JSON.stringify({ metric: `finance-browser-${journey}`, p95Ms }));
    expect(p95Ms).toBeLessThan(2_000);
  }
  expect(percentile95(refreshProgress)).toBeLessThan(1_000);
}, 180_000);
