import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  group: '01J00000000000000000000801',
  budget: '01J00000000000000000000802',
  account: '01J00000000000000000000803',
  category: '01J00000000000000000000804',
  reusable: '01J00000000000000000000805',
  item: '01J00000000000000000000806',
  match: '01J00000000000000000000807',
  automaticTransaction: '01J00000000000000000000808',
  ambiguousTransaction: '01J00000000000000000000809',
};

async function routes(page: Page) {
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.account,
            friendlyName: 'Shared checking',
            currency: 'USD',
            scope: { type: 'group', groupId: ids.group },
          },
        ],
      }),
    }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: ids.category, name: 'Utilities', origin: 'user', status: 'active', version: 1 },
        ],
      }),
    }),
  );
  await page.route('**/api/v1/finance/budgets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.budget,
            groupId: ids.group,
            name: 'September plan',
            budgetDate: '2027-09-01',
            startDate: '2027-09-01',
            endDate: '2027-09-30',
            status: 'active',
            items: [],
            totals: [],
            totalsComplete: true,
            version: 2,
          },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/reusable-items', async (route) =>
    route.fulfill({
      status: route.request().method() === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().method() === 'POST'
          ? {
              id: ids.reusable,
              groupId: ids.group,
              description: 'Mobile service',
              financeCategoryId: ids.category,
              plannedAmountMinor: -50_000,
              currency: 'USD',
              currencyExponent: 2,
              relatedAccountIds: [ids.account],
              applicableDate: '2027-09-15',
              status: 'active',
              creatorId: 'member-1',
              version: 1,
            }
          : { items: [] },
      ),
    }),
  );
  await page.route(`**/api/v1/finance/budgets/${ids.budget}/reusable-offers`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            reusableItemId: ids.reusable,
            occurrenceDate: '2027-09-15',
            description: 'Mobile service',
            plannedAmountMinor: -50_000,
            currency: 'USD',
            currencyExponent: 2,
          },
        ],
      }),
    }),
  );
  await page.route(
    `**/api/v1/finance/budgets/${ids.budget}/reusable-items/${ids.reusable}/copy`,
    (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: ids.item,
          budgetId: ids.budget,
          sourceReusableItemId: ids.reusable,
          description: 'Mobile service',
          financeCategoryId: ids.category,
          plannedAmountMinor: -50_000,
          currency: 'USD',
          currencyExponent: 2,
          applicableDate: '2027-09-15',
          relatedAccountIds: [ids.account],
          creatorId: 'member-1',
          status: 'active',
          version: 1,
        }),
      }),
  );
  await page.route('**/api/v1/finance/transactions/*/matches', (route) => {
    const transactionId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const exact = {
      transactionId,
      kind: 'exact',
      scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 0 },
      version: 1,
    };
    const items =
      transactionId === ids.automaticTransaction
        ? [{ ...exact, id: ids.match, budgetItemId: ids.item, status: 'accepted' }]
        : transactionId === ids.ambiguousTransaction
          ? [
              { ...exact, id: `${ids.match}1`, budgetItemId: ids.item, status: 'suggested' },
              { ...exact, id: `${ids.match}2`, budgetItemId: `${ids.item}2`, status: 'suggested' },
            ]
          : [
              {
                id: ids.match,
                transactionId,
                budgetItemId: ids.item,
                kind: 'near',
                scoreBasis: {
                  merchant: true,
                  date: true,
                  account: true,
                  amountDifferencePercent: 10,
                },
                status: 'suggested',
                version: 1,
              },
            ];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, transactionVersion: 1 }),
    });
  });
  await page.route(`**/api/v1/finance/matches/${ids.match}/decision`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: ids.match,
        transactionId: 'transaction-1',
        budgetItemId: ids.item,
        kind: 'near',
        scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 10 },
        status: 'accepted',
        decidedBy: 'member-1',
        decidedAt: '2027-09-16T00:00:00.000Z',
        version: 2,
      }),
    }),
  );
}

test('creates reusable items and copies an applicable future offer', async ({ page }) => {
  await routes(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Reusable items' }).click();
  await page.getByRole('button', { name: 'Create reusable item' }).click();
  await page.getByLabel('Group').selectOption(ids.group);
  await page.getByLabel('Reusable description').fill('Mobile service');
  await page.getByLabel('Applicable date').fill('2027-09-15');
  await page.getByLabel('Planned amount').fill('500.00');
  await page.getByRole('button', { name: 'Save reusable item' }).click();
  await expect(page.getByRole('article', { name: 'Mobile service reusable item' })).toContainText(
    '$500.00',
  );
  await page.getByRole('button', { name: 'September plan offers' }).click();
  await expect(page.getByText('Offered for September plan')).toBeVisible();
  await page.getByRole('button', { name: 'Copy Mobile service' }).click();
  await expect(page.getByText('Copied independently')).toBeVisible();
});

test('shows near provenance and keeps match decisions undoable', async ({ page }) => {
  await routes(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Reusable items' }).click();
  await page.getByLabel('Transaction for match review').fill('transaction-1');
  await page.getByRole('button', { name: 'Review matches' }).click();
  await expect(page.getByRole('article', { name: 'Near match suggestion' })).toContainText(
    '10% amount difference',
  );
  await page.getByRole('button', { name: 'Accept match' }).click();
  await expect(page.getByRole('button', { name: 'Undo match' })).toBeVisible();
});

test('distinguishes a unique automatic exact match from ambiguous exact suggestions', async ({
  page,
}) => {
  await routes(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Reusable items' }).click();
  const transaction = page.getByLabel('Transaction for match review');
  await transaction.fill(ids.automaticTransaction);
  await page.getByRole('button', { name: 'Review matches' }).click();
  await expect(page.getByRole('article', { name: 'Exact match suggestion' })).toContainText(
    'Status: accepted',
  );
  await transaction.fill(ids.ambiguousTransaction);
  await page.getByRole('button', { name: 'Review matches' }).click();
  await expect(page.getByRole('article', { name: 'Exact match suggestion' })).toHaveCount(2);
  await expect(page.getByText('Status: suggested')).toHaveCount(2);
});
