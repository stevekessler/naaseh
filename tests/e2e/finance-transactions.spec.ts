import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  account: '01J00000000000000000000601',
  otherAccount: '01J00000000000000000000602',
  transaction: '01J00000000000000000000611',
  transferLeg: '01J00000000000000000000612',
  candidate: '01J00000000000000000000613',
  merchant: '01J00000000000000000000621',
  category: '01J00000000000000000000631',
  review: '01J00000000000000000000641',
};

const account = {
  id: ids.account,
  scope: { type: 'owner', ownerId: 'local-steve' },
  connectionId: 'connection-a',
  organizationName: 'Fixture Bank',
  sourceName: 'Checking',
  friendlyName: 'Fixture Bank - Checking',
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 10_000,
  balanceAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  version: 1,
};

const transaction = {
  id: ids.transaction,
  accountId: ids.account,
  origin: 'manual',
  amountMinor: -1_000,
  currency: 'USD',
  currencyExponent: 2,
  transactedAt: '2026-01-05T12:00:00.000Z',
  effectiveAt: '2026-01-05T12:00:00.000Z',
  description: 'Fixture Cafe',
  pending: false,
  merchantId: ids.merchant,
  entrySnapshot: {
    amountMinor: -1_000,
    currency: 'USD',
    transactedAt: '2026-01-05T12:00:00.000Z',
    description: 'Fixture Cafe',
    pending: false,
  },
  allocations: [],
  reconciliationState: 'review-required',
  reviewState: 'reconciliation-review',
  status: 'active',
  version: 1,
};

async function routeTransactionData(page: Page) {
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [account], cursor: null }),
    }),
  );
  await page.route('**/api/v1/finance/accounts/*/transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          transaction,
          {
            ...transaction,
            id: ids.transferLeg,
            accountId: ids.otherAccount,
            amountMinor: 1_000,
            description: 'Transfer from checking',
            merchantId: undefined,
            reconciliationState: 'not-applicable',
            reviewState: 'none',
          },
        ],
        cursor: null,
        totalsComplete: true,
      }),
    }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.category,
            name: 'Dining',
            origin: 'user',
            creatorId: 'local-steve',
            status: 'active',
            version: 1,
          },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/merchants**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.merchant,
            name: 'Fixture Cafe',
            source: 'manual',
            creatorId: 'local-steve',
            status: 'active',
            version: 1,
          },
        ],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/review-issues**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
}

test('reviews, searches, splits, and confirms a transfer without losing the source total', async ({
  page,
}) => {
  await routeTransactionData(page);
  await page.route(
    `**/api/v1/finance/transactions/${ids.transaction}/allocations`,
    async (route) => {
      const input = route.request().postDataJSON() as { allocations: unknown[] };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...transaction,
          allocations: input.allocations,
          reviewState: 'none',
          version: 2,
        }),
      });
    },
  );
  await page.route('**/api/v1/finance/transfers', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '01J00000000000000000000651',
        transactionIds: [ids.transaction, ids.transferLeg],
        status: 'confirmed',
        version: 1,
      }),
    }),
  );

  await signIn(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Transactions' }).click();
  await page.getByLabel('Search transactions').fill('fixture cafe');
  await page.getByLabel('Account scope').selectOption(ids.account);
  await expect(page.getByRole('article', { name: 'Fixture Cafe transaction' })).toBeVisible();
  await page.getByRole('button', { name: 'Review Fixture Cafe' }).click();

  await expect(page.getByText('Original total: -$10.00')).toBeVisible();
  await page.getByRole('button', { name: 'Add split' }).click();
  await page.getByLabel('Split 1 amount').fill('-6.00');
  await page.getByLabel('Split 1 category').selectOption(ids.category);
  await page.getByRole('button', { name: 'Add split' }).click();
  await page.getByLabel('Split 2 amount').fill('-4.00');
  await page.getByLabel('Split 2 category').selectOption(ids.category);
  await expect(page.getByText('Remaining: $0.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save splits' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Allocations saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Mark as transfer' }).click();
  await page.getByLabel('Other transfer side').selectOption(ids.transferLeg);
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Transfer confirmed' })).toBeVisible();
});

test('shows a global merchant with only authorized activity and supports all-account search', async ({
  page,
}) => {
  await routeTransactionData(page);
  await page.route(`**/api/v1/finance/merchants/${ids.merchant}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        merchant: {
          id: ids.merchant,
          name: 'Fixture Cafe',
          source: 'manual',
          creatorId: 'local-steve',
          status: 'active',
          version: 1,
        },
        transactions: [transaction],
        totalsComplete: true,
        cursor: null,
      }),
    }),
  );

  await signIn(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Transactions' }).click();
  await page.getByLabel('Account scope').selectOption('all');
  await page.getByLabel('Search transactions').fill('fixture');
  await expect(page.getByText('1 transaction found')).toBeVisible();
  await page.getByRole('link', { name: 'Fixture Cafe' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Fixture Cafe' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Authorized merchant activity' }).getByText('Fixture Cafe'),
  ).toBeVisible();
  await expect(page.getByText(/hidden|inaccessible/i)).toHaveCount(0);
});

test('compares ambiguous reconciliation candidates and handles a stale conflict safely', async ({
  page,
}) => {
  await routeTransactionData(page);
  await page.route(
    `**/api/v1/finance/transactions/${ids.transaction}/provider-reconciliation`,
    (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 409,
          code: 'FINANCE_VERSION_CONFLICT',
          title: 'The reconciliation changed. Refresh and review it again.',
        }),
      }),
  );
  await page.route('**/api/v1/finance/review-issues**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.review,
            accountId: ids.account,
            kind: 'provisional-reconciliation',
            candidateIds: [ids.transaction, ids.candidate],
            status: 'open',
            version: 1,
            provisional: transaction,
            candidate: {
              ...transaction,
              id: ids.candidate,
              origin: 'simplefin',
              providerConnectionId: 'connection-a',
              providerAccountId: 'provider-a',
              sourceTransactionId: 'source-a',
              entrySnapshot: undefined,
              providerSnapshot: { ...transaction.entrySnapshot, description: 'FIXTURE CAFE' },
            },
          },
        ],
        cursor: null,
      }),
    }),
  );

  await signIn(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Transactions' }).click();
  await page.getByRole('button', { name: 'Review reconciliation' }).click();
  await expect(page.getByRole('region', { name: 'Entry and provider comparison' })).toContainText(
    'Fixture Cafe',
  );
  await page.getByRole('button', { name: 'Reconcile transactions' }).click();
  await expect(page.getByRole('alert')).toContainText('Refresh and review it again');
  await expect(page.getByRole('button', { name: 'Refresh reconciliation' })).toBeVisible();
});
