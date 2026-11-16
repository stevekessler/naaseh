import { expect, test, type Page } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceTransactionBrowsing,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  manual: '01J00000000000000000000901',
  connected: '01J00000000000000000000902',
  transaction: '01J00000000000000000000911',
  merchant: '01J00000000000000000000912',
  category: '01J00000000000000000000913',
};
const accounts = [
  {
    id: ids.manual,
    scope: { type: 'owner', ownerId: 'local-steve' },
    organizationName: 'Fixture Bank',
    sourceName: 'Cash account',
    friendlyName: 'Household cash',
    accountType: 'other',
    currency: 'USD',
    currencyExponent: 2,
    currentBalanceMinor: 10_000,
    balanceAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    version: 1,
  },
  {
    id: ids.connected,
    scope: { type: 'owner', ownerId: 'local-steve' },
    connectionId: 'connection-a',
    organizationName: 'Fixture Bank',
    sourceName: 'Checking',
    friendlyName: 'Connected checking',
    accountType: 'checking',
    currency: 'USD',
    currencyExponent: 2,
    currentBalanceMinor: 20_000,
    balanceAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    version: 1,
  },
];

async function routeManualEntry(page: Page) {
  const transactions: Array<Record<string, unknown>> = [];
  let posts = 0;
  await mockFinanceTransactionBrowsing(page, () => transactions);
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: accounts, cursor: null },
    }),
  );
  await page.route('**/api/v1/finance/accounts/*/transactions', async (route) => {
    const accountId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    if (route.request().method() === 'GET')
      return route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
        json: {
          items: transactions.filter((item) => item.accountId === accountId),
          cursor: null,
          totalsComplete: true,
        },
      });
    posts++;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const connected = accountId === ids.connected;
    const transaction = {
      ...body,
      id: ids.transaction,
      accountId,
      origin: 'manual',
      currency: 'USD',
      currencyExponent: 2,
      effectiveAt: body.transactedAt,
      pending: false,
      entrySnapshot: { ...body, currency: 'USD', pending: false },
      allocations: body.allocations ?? [],
      reconciliationState: connected ? 'provisional' : 'not-applicable',
      reviewState: 'none',
      status: 'active',
      version: 1,
    };
    transactions.push(transaction);
    return route.fulfill({ status: 201, json: transaction });
  });
  await page.route(
    new RegExp('/api/v1/finance/transactions/' + ids.transaction + '(?:[?]browse=1)?$'),
    (route) =>
      route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
        json: transactions.at(-1),
      }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [{ id: ids.category, name: 'Groceries', status: 'active', version: 1 }] },
    }),
  );
  await page.route('**/api/v1/finance/merchants**', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [{ id: ids.merchant, name: 'Fixture Market', status: 'active' }] },
    }),
  );
  await page.route('**/api/v1/finance/review-issues**', (route) =>
    route.fulfill({ status: 200, headers: financeSnapshotFixtureHeaders, json: { items: [] } }),
  );
  return { transactions, posts: () => posts };
}

async function setup(page: Page) {
  const routed = await routeManualEntry(page);
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  return routed;
}

async function completeForm(page: Page, description = 'Manual lunch') {
  await page.getByLabel('Transaction date').fill('2026-01-05');
  await page.getByLabel('Amount', { exact: true }).fill('12.50');
  await page.getByLabel('Direction').selectOption('debit');
  await page.getByLabel('Description').fill(description);
  await page.getByLabel('Payment type').selectOption('card');
}

test('adds a transaction from account context and labels connected entry provisional', async ({
  page,
}) => {
  const routed = await setup(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Open account' }).nth(1).click();
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue(ids.connected);
  await expect(page.getByLabel('Account', { exact: true })).toBeDisabled();
  await completeForm(page);
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'saved as provisional' })).toBeVisible();
  expect(routed.posts()).toBe(1);
  expect(routed.transactions[0]).toMatchObject({
    accountId: ids.connected,
    amountMinor: -1250,
    paymentType: 'card',
  });
});

test('global Add Transaction retains invalid input and saves to the selected account', async ({
  page,
}) => {
  const routed = await setup(page);
  await page.goto('/finance/transactions');
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await page.getByLabel('Account', { exact: true }).selectOption(ids.manual);
  await page.getByLabel('Transaction date').fill('2026-01-05');
  await page.getByLabel('Amount', { exact: true }).fill('25.00');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Description is required' }),
  ).toBeVisible();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('25.00');
  await page.getByLabel('Description').fill('Groceries');
  await page.getByLabel('Merchant').selectOption(ids.merchant);
  await page.getByLabel('Category allocation').selectOption(ids.category);
  await page.getByLabel('Allocation note').fill('Weekly shop');
  await page.getByLabel('Payment type').selectOption('check');
  await page.locator('form').getByLabel('Check number', { exact: true }).fill('000321');
  await page.getByLabel('Memo').fill('Household groceries');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Transaction saved' })).toBeVisible();
  expect(routed.posts()).toBe(1);
  expect(routed.transactions[0]).toMatchObject({
    merchantId: ids.merchant,
    paymentType: 'check',
    checkNumber: '000321',
    memo: 'Household groceries',
    allocations: [
      {
        amountMinor: -2500,
        financeCategoryId: ids.category,
        note: 'Weekly shop',
      },
    ],
  });
});

test('queues manual entry offline without presenting it as posted', async ({ page, context }) => {
  const routed = await setup(page);
  await page.goto('/finance/transactions');
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await page.getByLabel('Account', { exact: true }).selectOption(ids.connected);
  await completeForm(page, 'Offline connected purchase');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'queued securely' })).toBeVisible();
  await expect(page.getByText('Posted', { exact: true })).toHaveCount(0);
  expect(routed.posts()).toBe(0);
});
