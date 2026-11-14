import { expect, test, type Page } from '@playwright/test';
import {
  signIn,
  mockUnprotectedFinanceSecurity,
  mockFinanceSnapshotEvidence,
  financeSnapshotFixtureHeaders,
} from './enhanced-helpers.js';

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
  const records = new Map<string, Record<string, unknown>>([
    [ids.transaction, { ...transaction }],
    [
      ids.transferLeg,
      {
        ...transaction,
        id: ids.transferLeg,
        accountId: ids.otherAccount,
        amountMinor: 1000,
        description: 'Transfer from checking',
        merchantId: undefined,
        reconciliationState: 'not-applicable',
        reviewState: 'none',
      },
    ],
  ]);
  await page.route('**/api/v1/finance/transactions/*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const value = records.get(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.fulfill({
      status: value ? 200 : 404,
      headers: financeSnapshotFixtureHeaders,
      json: value ?? {},
    });
  });
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: financeSnapshotFixtureHeaders,
      body: JSON.stringify({
        items: [account, { ...account, id: ids.otherAccount, friendlyName: 'Savings' }],
        cursor: null,
      }),
    }),
  );
  await page.route('**/api/v1/finance/accounts/*/transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: financeSnapshotFixtureHeaders,
      body: JSON.stringify({
        items: [...records.values()].filter(
          (record) =>
            record.accountId === new URL(route.request().url()).pathname.split('/').at(-2),
        ),
        cursor: null,
        totalsComplete: true,
      }),
    }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: financeSnapshotFixtureHeaders,
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
      headers: financeSnapshotFixtureHeaders,
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
      headers: financeSnapshotFixtureHeaders,
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
  return records;
}

test('reviews, searches, splits, and confirms a transfer without losing the source total', async ({
  page,
}) => {
  const records = await routeTransactionData(page);
  let allocationRequests = 0;
  await page.route(
    `**/api/v1/finance/transactions/${ids.transaction}/allocations`,
    async (route) => {
      allocationRequests++;
      const input = route.request().postDataJSON() as { allocations: unknown[] };
      const updated = {
        ...transaction,
        allocations: input.allocations,
        reviewState: 'none',
        version: 2,
      };
      records.set(ids.transaction, updated);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...updated, description: 'Unverified allocation response' }),
      });
    },
  );
  await page.route('**/api/v1/finance/transfers', (route) => {
    const input = route.request().postDataJSON() as { id: string };
    expect(input).toMatchObject({
      transactionIds: [ids.transaction, ids.transferLeg],
      expectedVersions: [2, 1],
    });
    for (const id of [ids.transaction, ids.transferLeg]) {
      const leg = records.get(id)!;
      records.set(id, { ...leg, transferId: input.id, version: Number(leg.version) + 1 });
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: input.id,
        transactionIds: [ids.transaction, ids.transferLeg],
        status: 'confirmed',
        version: 1,
      }),
    });
  });

  await page.route(
    `**/api/v1/finance/records/transaction/${ids.transaction}/deletion-preview`,
    (route) =>
      route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
        json: { outcome: 'archive', preservedRecordTypes: ['category'] },
      }),
  );
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  const snapshotEvidence = await mockFinanceSnapshotEvidence(page);
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
  await expect(page.getByText('Unverified allocation response')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark as transfer' }).click();
  await page.getByLabel('Other transfer side').selectOption(ids.transferLeg);
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Transfer confirmed' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview transaction removal' }).click();
  await expect(page.getByRole('region', { name: 'Transaction removal impact' })).toContainText(
    'Preserved: category',
  );
  let releaseVerification!: () => void;
  const heldVerification = new Promise<void>((resolve) => {
    releaseVerification = resolve;
  });
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as { financeCacheOnly?: boolean } | null;
    if (body?.financeCacheOnly) await heldVerification;
    await route.fallback();
  });
  try {
    await page.getByRole('button', { name: 'Save splits' }).click();
  } finally {
    snapshotEvidence.revoke();
    releaseVerification();
  }
  await expect(page.getByRole('button', { name: 'Refresh Finance security' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Fixture Cafe transaction' })).toHaveCount(0);
  await expect(page.getByText('0 transactions found')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Transaction removal impact' })).toHaveCount(0);
  expect(allocationRequests).toBe(1);
});

test('shows a global merchant with only authorized activity and supports all-account search', async ({
  page,
}) => {
  await routeTransactionData(page);
  await page.route(`**/api/v1/finance/merchants/${ids.merchant}**`, (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
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

  await page.route(
    `**/api/v1/finance/records/merchant/${ids.merchant}/deletion-preview`,
    (route) => {
      expect(route.request().headers()['x-finance-cache-protocol']).toBe('1');
      return route.fulfill({
        headers: financeSnapshotFixtureHeaders,
        json: {
          recordId: ids.merchant,
          recordType: 'merchant',
          expectedVersion: 1,
          outcome: 'archive',
          confirmationToken: 'synthetic-preview',
        },
      });
    },
  );
  let deletionRequests = 0;
  await page.route(`**/api/v1/finance/records/merchant/${ids.merchant}/deletion`, (route) => {
    deletionRequests++;
    return route.fulfill({ status: 204 });
  });
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  const merchantSnapshotEvidence = await mockFinanceSnapshotEvidence(page);
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
  await page.getByRole('button', { name: 'Review merchant removal' }).click();
  const confirm = page.getByRole('button', { name: 'Archive merchant' });
  await expect(confirm).toBeVisible();
  merchantSnapshotEvidence.revoke();
  await confirm.click();
  await expect(page.getByRole('button', { name: 'Refresh Finance security' })).toBeVisible();
  expect(deletionRequests).toBe(0);
  await expect(page.getByRole('region', { name: 'Authorized merchant activity' })).toHaveCount(0);
  await expect(page.getByText('No activity is available in your accessible accounts.')).toHaveCount(
    0,
  );
});

test('compares ambiguous reconciliation candidates and handles a stale conflict safely', async ({
  page,
}) => {
  const records = await routeTransactionData(page);
  let attempts = 0;
  let resolved = false;
  await page.route(
    `**/api/v1/finance/transactions/${ids.transaction}/provider-reconciliation`,
    (route) => {
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: {
            status: 409,
            code: 'FINANCE_VERSION_CONFLICT',
            title: 'The reconciliation changed. Refresh and review it again.',
          },
        });
      resolved = true;
      records.set(ids.transaction, { ...transaction, version: 2, reviewState: 'none' });
      return route.fulfill({
        json: { ...transaction, description: 'Unverified reconciliation response' },
      });
    },
  );
  await page.route('**/api/v1/finance/review-issues**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: financeSnapshotFixtureHeaders,
      body: JSON.stringify({
        items: resolved
          ? []
          : [
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

  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  const evidence = await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Transactions' }).click();
  await page.getByRole('button', { name: 'Review reconciliation' }).click();
  await expect(page.getByRole('region', { name: 'Entry and provider comparison' })).toContainText(
    'Fixture Cafe',
  );
  await page.getByRole('button', { name: 'Reconcile transactions' }).click();
  const reconciliationReview = page.getByRole('region', {
    name: 'Entry and provider comparison',
  });
  await expect(reconciliationReview.getByRole('alert')).toContainText(
    'Refresh and review it again',
  );
  await expect(page.getByRole('button', { name: 'Refresh reconciliation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconcile transactions' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Keep separate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh reconciliation' }).click();
  await page.getByRole('button', { name: 'Close transaction' }).click();
  await page.getByRole('button', { name: 'Review reconciliation' }).click();
  await page.getByRole('button', { name: 'Keep separate' }).click();
  await expect(page.getByText('Transactions kept separate.')).toBeVisible();
  await expect(page.getByText('Unverified reconciliation response')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Entry and provider comparison' })).toHaveCount(0);

  resolved = false;
  records.set(ids.transaction, { ...transaction });
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Transactions' }).click();
  await page.getByRole('button', { name: 'Review reconciliation' }).click();
  const decision = page.getByRole('button', { name: 'Keep separate' });
  await expect(decision).toBeEnabled();
  let releaseVerification!: () => void;
  const heldVerification = new Promise<void>((resolve) => {
    releaseVerification = resolve;
  });
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as { financeCacheOnly?: boolean } | null;
    if (body?.financeCacheOnly) await heldVerification;
    await route.fallback();
  });
  try {
    await decision.click();
  } finally {
    evidence.revoke();
    releaseVerification();
  }
  await expect(page.getByRole('button', { name: 'Refresh Finance security' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Entry and provider comparison' })).toHaveCount(0);
  expect(attempts).toBe(2);
});
