import { expect, test } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  seedFinanceSearch,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const account = '01J00000000000000000000601';
const transactionId = '01J00000000000000000000611';
const budget = '01J00000000000000000000691';
const transaction = {
  id: transactionId,
  accountId: account,
  effectiveAt: '2026-01-05T19:00:00.000Z',
  description: 'Fixture Market',
  amountMinor: -1250,
  currency: 'USD',
  currencyExponent: 2,
  checkNumber: '000123',
  paymentType: 'check',
  allocations: [],
  reconciliationState: 'not-applicable',
  reviewState: 'none',
  version: 1,
  budgetLinks: [{ id: budget, name: 'Household budget' }],
};

test.beforeEach(async ({ page }) => {
  const accounts = [
    {
      id: account,
      friendlyName: 'Household cash',
      sourceName: 'Cash',
      organizationName: 'Fixture bank',
      scope: { type: 'owner', ownerId: 'local-steve' },
      currency: 'USD',
      currencyExponent: 2,
      status: 'active',
      version: 1,
      currentBalanceMinor: 5000,
    },
  ];
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: accounts } }),
  );
  await page.route(/\/api\/v1\/finance\/(?:accounts\/[^/]+\/)?transactions\?/u, (route) => {
    const url = new URL(route.request().url());
    const filter = url.searchParams;
    const items =
      (!filter.get('text') || filter.get('text') === 'market') &&
      (!filter.get('checkNumber') || filter.get('checkNumber') === '000123') &&
      (!filter.get('amount') || filter.get('amount') === '-1250') &&
      (!filter.get('date') || filter.get('date') === '2026-01-05') &&
      (!filter.get('accountName') || filter.get('accountName') === 'Household')
        ? [transaction]
        : [];
    return route.fulfill({
      json: {
        items,
        asOf: transaction.effectiveAt,
        projectionRevision: 'fixture',
        complete: true,
        rowsState: items.length ? 'ready' : 'confirmed-empty',
        aggregateState: 'exact',
        totalCount: items.length,
        totalsByCurrency: [],
        coverage: { examined: 1, scopeComplete: true },
      },
    });
  });
  const transactionPath = '/api/v1/finance/transactions/' + transactionId;
  await page.route(new RegExp(transactionPath + '(?:[?].*)?$'), (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: transaction }),
  );
  await page.route(new RegExp(transactionPath + '/receipts(?:[?].*)?$'), (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route(
    /\/api\/v1\/finance\/(categories|merchants|review-issues|connections)(\?|$)/,
    (route) => route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [] } }),
  );
  await signIn(page);
});

test('opens a direct transaction over Transactions and follows a budget as a page', async ({
  page,
}) => {
  await page.goto('/finance/transactions/' + transactionId);
  const dialog = page.getByRole('dialog', { name: 'Transaction details' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: 'Household budget' }).click();
  await expect(page).toHaveURL(new RegExp('/finance/budgets/' + budget + '$'));
  await expect(dialog).toHaveCount(0);
});

test('combines and resets filters and restores the source link through history', async ({
  page,
}) => {
  await page.goto('/finance/accounts/' + account);
  await page.getByLabel('Search transactions').fill('market');
  await page.getByLabel('Check number', { exact: true }).fill('000123');
  await page.getByLabel('Account name', { exact: true }).fill('Household');
  await page.getByLabel('Exact date').fill('2026-01-05');
  await page.getByLabel('Exact signed amount (minor units)').fill('-1250');
  const link = page.getByRole('link', { name: 'Review Fixture Market' });
  await expect(link).toBeVisible();
  await link.focus();
  const originalScroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Transaction details' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Search transactions')).toHaveValue('market');
  await expect(link).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(originalScroll);
  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(link).toBeFocused();
  await page.getByLabel('Check number', { exact: true }).fill('123');
  await expect(page.getByText('No matching transactions')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(link).toBeVisible();
});

test('filters encrypted cached rows offline, labels their coverage, and restores connected results', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 680 });
  await page.goto('/finance/transactions');
  const link = page.getByRole('link', { name: 'Review Fixture Market' });
  await expect(link).toBeVisible();
  await seedFinanceSearch(page, [
    {
      id: account,
      entityType: 'financeAccount',
      scopeKey: 'OWNER#local-steve',
      value: { id: account, friendlyName: 'Household cash', status: 'active' },
    },
    {
      id: transactionId,
      entityType: 'financeTransaction',
      scopeKey: 'OWNER#local-steve',
      accountId: account,
      value: { ...transaction, status: 'active' },
    },
  ]);
  // Keep the prebuilt app shell and worker available while simulating a disconnected API.
  // WebKit service workers can bypass the page-level API fixtures on this preview origin.
  let disconnected = true;
  await page.route('**/api/v1/**', (route) =>
    disconnected ? route.abort('internetdisconnected') : route.fallback(),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  const search = page.getByLabel('Search transactions');
  await search.fill('market');
  await expect(page.getByText(/1 match among 1 cached transaction/)).toBeVisible();
  await expect(page.getByText(/Last cached change/)).toBeVisible();
  await expect(link).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await search.fill('missing');
  await expect(page.getByText(/0 matches among 1 cached transaction/)).toBeVisible();
  await expect(page.getByText('No matching transactions')).toHaveCount(0);
  await search.fill('market');
  disconnected = false;
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'onLine');
    window.dispatchEvent(new Event('online'));
  });
  await expect(search).toHaveValue('market');
  await expect(page.getByText('1 transaction found')).toBeVisible();
});
