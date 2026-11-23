import { expect, test } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockSuccessfulSync,
  mockUnprotectedFinanceSecurity,
  seedFinanceSearch,
  signIn,
} from './enhanced-helpers.js';

const account = '01J00000000000000000000601';
const category = '01J00000000000000000000602';
const now = '2026-11-15T12:00:00.000Z';

test.use({ serviceWorkers: 'block' });

test('opens Spend, combines report filters and automatically settles pending totals', async ({
  page,
}) => {
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockSuccessfulSync(page);
  await mockFinanceSnapshotEvidence(page, { allowProoflessPull: true });
  await page.route(
    /\/api\/v1\/finance\/(accounts|budgets|merchants|categories)(?:\?|$)/u,
    (route) => {
      const kind = new URL(route.request().url()).pathname.split('/').at(-1);
      const items =
        kind === 'accounts'
          ? [{ id: account, friendlyName: 'Household' }]
          : kind === 'categories'
            ? [{ id: category, name: 'Food' }]
            : [];
      return route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items } });
    },
  );
  const queryId = '01J00000000000000000000603';
  const transaction = '01J00000000000000000000604';
  const row = {
    id: transaction,
    accountId: account,
    effectiveAt: now,
    description: 'Lunch',
    currency: 'USD',
    currencyExponent: 2,
    amountMinor: -1200,
    slices: [
      {
        transactionId: transaction,
        accountId: account,
        effectiveAt: now,
        currency: 'USD',
        currencyExponent: 2,
        amountMinor: 1200,
        categoryId: category,
      },
    ],
  };
  const pending = {
    items: [row],
    asOf: now,
    projectionRevision: 'report',
    queryId,
    complete: false,
    rowsState: 'ready',
    aggregateState: 'pending',
    coverage: { examined: 1, scopeComplete: false },
  };
  await page.route('**/api/v1/finance/queries/' + queryId + '/rows', (route) =>
    route.fulfill({
      json: {
        ...pending,
        complete: true,
        aggregateState: 'exact',
        coverage: { examined: 1, scopeComplete: true },
        totalCount: 1,
        totalsByCurrency: [{ currency: 'USD', currencyExponent: 2, amountMinor: 1200 }],
      },
    }),
  );
  await page.route(/\/api\/v1\/finance\/reports\/spend\?/u, (route) =>
    route.fulfill({ json: pending }),
  );
  await page.route(/\/api\/v1\/finance\/(review-issues|connections)(\?|$)/u, (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [] } }),
  );
  await page.route(/\/api\/v1\/finance\/transactions(?:\?|$)/u, (route) =>
    route.fulfill({ json: { items: [row], rowsState: 'ready', aggregateState: 'exact' } }),
  );
  await page.route(
    new RegExp('/api/v1/finance/transactions/' + transaction + '(?:[?]browse=1)?$'),
    (route) =>
      route.fulfill({
        headers: financeSnapshotFixtureHeaders,
        json: {
          ...row,
          version: 1,
          allocations: [],
          reconciliationState: 'not-applicable',
          reviewState: 'none',
        },
      }),
  );
  await signIn(page);
  await page.goto('/finance/reports');
  await page.getByRole('link', { name: 'Spend report' }).click();
  await page.getByRole('listbox', { name: 'Accounts', exact: true }).selectOption(account);
  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/finance/reports/spend' &&
      url.searchParams.get('accountIds') === account &&
      url.searchParams.get('categoryIds') === category
    );
  });
  await page.getByRole('listbox', { name: 'Categories', exact: true }).selectOption(category);
  await filteredRequest;
  await expect(page.getByText('1 matching transaction', { exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: 'Lunch' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Transaction details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(link).toBeFocused();
  await expect(page.getByRole('listbox', { name: 'Categories', exact: true })).toHaveValues([
    category,
  ]);
});

test('uses the encrypted offline report and labels cached coverage', async ({ page }) => {
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockSuccessfulSync(page);
  await mockFinanceSnapshotEvidence(page, { allowProoflessPull: true });
  await page.route(
    /\/api\/v1\/finance\/(accounts|budgets|merchants|categories)(?:\?|$)/u,
    (route) => route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [] } }),
  );
  await page.route(/\/api\/v1\/finance\/reports\/spend\?/u, (route) =>
    route.fulfill({
      json: {
        items: [],
        asOf: now,
        projectionRevision: 'fixture',
        complete: true,
        rowsState: 'confirmed-empty',
        aggregateState: 'exact',
        totalCount: 0,
        coverage: { examined: 0, scopeComplete: true },
        totalsByCurrency: [],
      },
    }),
  );
  await signIn(page);
  await page.goto('/finance/reports/spend');
  await expect(page.getByText('No matching transactions.', { exact: true })).toBeVisible();
  const id = '01J00000000000000000000609';
  await seedFinanceSearch(page, [
    {
      id: account,
      entityType: 'financeAccount',
      scopeKey: 'OWNER#local-steve',
      value: { id: account, friendlyName: 'Household', status: 'active' },
    },
    {
      id,
      entityType: 'financeTransaction',
      scopeKey: 'OWNER#local-steve',
      accountId: account,
      value: {
        id,
        accountId: account,
        status: 'active',
        amountMinor: -1250,
        currency: 'USD',
        currencyExponent: 2,
        effectiveAt: now,
        description: 'Saved expense',
        postedAt: now,
        reviewState: 'none',
        pending: false,
        reconciliationState: 'not-applicable',
        allocations: [],
      },
    },
  ]);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  await page.getByLabel('Transaction date', { exact: true }).fill('2026-11-15');
  await expect(page.getByText(/Partial coverage from 1 saved transaction/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved expense' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Partial cached net spending' })).toContainText(
    '12.50',
  );
  await page.getByLabel('Transaction date', { exact: true }).fill('2026-11-14');
  await expect(page.getByText('No matching transactions in saved data.')).toBeVisible();
  await expect(page.getByText('No matching transactions.', { exact: true })).toHaveCount(0);
});
