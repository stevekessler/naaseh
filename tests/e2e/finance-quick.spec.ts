import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test('completes the representative Finance account, CSV, split, budget, and offline journey', async ({
  context,
  page,
}) => {
  const ids = {
    account: '01J00000000000000000000901',
    transaction: '01J00000000000000000000902',
    categoryFood: '01J00000000000000000000903',
    categoryHome: '01J00000000000000000000904',
    budget: '01J00000000000000000000905',
  };
  let accounts: Array<Record<string, unknown>> = [];
  const transaction = {
    id: ids.transaction,
    accountId: ids.account,
    description: 'Household purchase',
    amountMinor: -10_000,
    currency: 'USD',
    currencyExponent: 2,
    version: 1,
    allocations: [],
    reconciliationState: 'not-applicable',
    reviewState: 'none',
    effectiveAt: '2026-10-15T12:00:00.000Z',
  };
  const budget = {
    id: ids.budget,
    groupId: '01J00000000000000000000906',
    name: 'October household plan',
    budgetDate: '2026-10-01',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'active',
    version: 2,
    accountLinks: [],
    items: [
      {
        id: 'budget-item-1',
        description: 'Groceries',
        financeCategoryId: ids.categoryFood,
        plannedAmountMinor: -12_000,
        actualAmountMinor: -10_000,
        varianceMinor: 2_000,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [ids.account],
        version: 1,
      },
    ],
    totals: [
      {
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: -12_000,
        actualMinor: -10_000,
        varianceMinor: 2_000,
      },
    ],
    categoryTotals: [
      {
        financeCategoryId: ids.categoryFood,
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: -12_000,
        actualMinor: -10_000,
        varianceMinor: 2_000,
      },
    ],
    totalsComplete: true,
    reconciliationReadiness: { ready: false, reasons: ['Refresh is still pending.'] },
    reconciliations: [],
  };

  await page.route('**/api/v1/finance/accounts', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: accounts, cursor: null }),
      });
    }
    const input = route.request().postDataJSON() as Record<string, unknown>;
    const created = {
      ...input,
      id: ids.account,
      friendlyName: `${input.organizationName} - ${input.sourceName}`,
      currencyExponent: 2,
      currentBalanceMinor: input.openingBalanceMinor,
      status: 'active',
      version: 1,
    };
    accounts = [created];
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(created),
    });
  });
  await page.route(`**/api/v1/finance/accounts/${ids.account}/transactions`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [transaction], cursor: null }),
    }),
  );
  await page.route(
    `**/api/v1/finance/transactions/${ids.transaction}/allocations`,
    async (route) => {
      const input = route.request().postDataJSON() as {
        allocations: typeof transaction.allocations;
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...transaction,
          allocations: input.allocations,
          version: 2,
        }),
      });
    },
  );
  await page.route('**/api/v1/finance/categories', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: ids.categoryFood, name: 'Food' },
          { id: ids.categoryHome, name: 'Household' },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/merchants', (route) =>
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

  await signIn(page);
  await page.getByRole('button', { name: 'Finance' }).click();
  await page.getByLabel('Organization name').fill('Fixture Bank');
  await page.getByLabel('Account name').fill('Checking');
  await page.getByLabel('Opening balance').fill('1250.00');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Fixture Bank - Checking' }),
  ).toBeVisible();

  await page.getByLabel('CSV file').setInputFiles({
    name: 'fixture.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Description,Amount\n2026-10-15,Household purchase,-100.00'),
  });
  await expect(page.getByText('Ready to review 1 rows.')).toBeVisible();
  await page.getByLabel('Date column').selectOption('Date');
  await page.getByLabel('Description column').selectOption('Description');
  await page.getByLabel('Amount column').selectOption('Amount');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Commit reviewed import' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'queued securely' })).toBeVisible();
  await context.setOffline(false);

  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByLabel('Search transactions').fill('Household purchase');
  await page.getByRole('button', { name: 'Review Household purchase' }).click();
  await page.getByRole('button', { name: 'Add split' }).click();
  await page.getByRole('button', { name: 'Add split' }).click();
  await page.getByLabel('Split 1 amount').fill('-60.00');
  await page.getByLabel('Split 1 category').selectOption(ids.categoryFood);
  await page.getByLabel('Split 2 amount').fill('-40.00');
  await page.getByLabel('Split 2 category').selectOption(ids.categoryHome);
  await page.getByRole('button', { name: 'Save splits' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Allocations saved.' })).toBeVisible();

  await page.getByRole('button', { name: 'Budgets', exact: true }).click();
  await page.getByRole('button', { name: 'Open budget' }).click();
  await expect(page.getByRole('region', { name: 'USD budget totals' })).toContainText('$20.00');
  await expect(page.getByRole('region', { name: 'Food category totals' })).toContainText('$20.00');
  await expect(page.getByText('Refresh is still pending.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconcile budget' })).toBeDisabled();
});
