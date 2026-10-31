import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  group: '01J00000000000000000000501',
  budget: '01J00000000000000000000502',
  groupAccount: '01J00000000000000000000503',
  privateAccount: '01J00000000000000000000504',
  category: '01J00000000000000000000505',
  item: '01J00000000000000000000506',
};

const budgetDetail = {
  id: ids.budget,
  groupId: ids.group,
  name: 'April household plan',
  budgetDate: '2026-04-01',
  startDate: '2026-04-01',
  endDate: '2026-04-30',
  status: 'active',
  version: 3,
  accountLinks: [{ id: 'link-group', accountId: ids.groupAccount, status: 'active', version: 1 }],
  items: [
    {
      id: ids.item,
      description: 'Groceries',
      financeCategoryId: ids.category,
      plannedAmountMinor: -10_000,
      actualAmountMinor: -8_000,
      varianceMinor: 2_000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [ids.groupAccount],
      version: 1,
    },
  ],
  totals: [
    {
      currency: 'EUR',
      currencyExponent: 2,
      plannedMinor: -5_000,
      actualMinor: -4_000,
      varianceMinor: 1_000,
    },
    {
      currency: 'USD',
      currencyExponent: 2,
      plannedMinor: -10_000,
      actualMinor: -8_000,
      varianceMinor: 2_000,
    },
  ],
  totalsComplete: true,
};

async function routeBudgetData(page: Page) {
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.groupAccount,
            friendlyName: 'Shared checking',
            currency: 'USD',
            scope: { type: 'group', groupId: ids.group },
          },
          {
            id: ids.privateAccount,
            friendlyName: 'My private checking',
            currency: 'USD',
            scope: { type: 'owner', ownerId: 'local-steve' },
          },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: ids.category, name: 'Groceries', origin: 'user', status: 'active', version: 1 },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/budgets', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(budgetDetail),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [budgetDetail], cursor: null }),
    });
  });
  await page.route(`**/api/v1/finance/budgets/${ids.budget}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(budgetDetail),
    }),
  );
}

test('creates a bounded budget and manages group/private accounts and signed items', async ({
  page,
}) => {
  await routeBudgetData(page);
  await signIn(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Budgets' }).click();
  await page.getByRole('button', { name: 'Create budget' }).click();
  await page.getByLabel('Budget name').fill('April household plan');
  await page.getByLabel('Group').selectOption(ids.group);
  await page.getByLabel('Budget date').fill('2026-04-01');
  await page.getByLabel('Start date').fill('2026-04-01');
  await page.getByLabel('End date').fill('2026-04-30');
  await page.getByLabel('Shared checking').check();
  await page.getByLabel('My private checking').check();
  await expect(page.getByRole('note')).toContainText(/private account.*incomplete/i);
  await page.getByRole('button', { name: 'Save budget' }).click();
  await expect(page.getByRole('heading', { name: 'April household plan' })).toBeVisible();

  await page.getByRole('button', { name: 'Add budget item' }).click();
  await page.getByLabel('Description').fill('Groceries');
  await page.getByLabel('Category', { exact: true }).selectOption(ids.category);
  await page.getByLabel('Type').selectOption('debit');
  await page.getByLabel('Planned amount').fill('100.00');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('article', { name: 'Groceries budget item' }).last()).toContainText(
    '$100.00',
  );
});

test('shows exact item/category variance and separate currency totals without a grand total', async ({
  page,
}) => {
  await routeBudgetData(page);
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  await expect(page.getByRole('region', { name: 'USD budget totals' })).toContainText(
    /planned.*\$100\.00/i,
  );
  await expect(page.getByRole('region', { name: 'USD budget totals' })).toContainText(
    /actual.*\$80\.00/i,
  );
  await expect(page.getByRole('region', { name: 'USD budget totals' })).toContainText(
    /variance.*\$20\.00/i,
  );
  await expect(page.getByRole('region', { name: 'EUR budget totals' })).toContainText('€50.00');
  await expect(page.getByRole('region', { name: 'Groceries category totals' })).toContainText(
    '$20.00',
  );
  await expect(page.getByText(/grand total/i)).toHaveCount(0);
});

test('warns about incomplete totals without identifying a hidden account or amount', async ({
  page,
}) => {
  await routeBudgetData(page);
  await page.route(`**/api/v1/finance/budgets/${ids.budget}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...budgetDetail,
        accountLinks: budgetDetail.accountLinks,
        items: [],
        totals: [],
        totalsComplete: false,
      }),
    }),
  );
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  await expect(page.getByRole('alert').filter({ hasText: /totals are incomplete/i })).toContainText(
    /totals are incomplete/i,
  );
  await expect(page.getByText(/hidden account|private bank|hidden amount/i)).toHaveCount(0);
});

test('keeps budget creation usable on a narrow touch layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeBudgetData(page);
  await signIn(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Budgets' }).click();
  await page.getByRole('button', { name: 'Create budget' }).click();
  await page.getByLabel('Budget name').fill('Mobile open-ended plan');
  await expect(page.getByLabel('Budget name')).toHaveValue('Mobile open-ended plan');
  await expect(page.getByRole('dialog', { name: 'Create budget' })).toBeInViewport();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
