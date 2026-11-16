import { expect, test } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceTransactionBrowsing,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('edits payment, category hierarchy, merchant and an explicit partial refund link', async ({
  page,
}, testInfo) => {
  test.skip(!['chromium', 'webkit'].includes(testInfo.project.name), 'Desktop contract journey.');
  const ids = {
    account: '01J00000000000000000000801',
    original: '01J00000000000000000000802',
    refund: '01J00000000000000000000803',
    food: '01J00000000000000000000804',
    eatingOut: '01J00000000000000000000805',
    merchant: '01J00000000000000000000806',
    allocationFood: '01J00000000000000000000807',
    allocationOther: '01J00000000000000000000808',
  };
  const account = {
    id: ids.account,
    scope: { type: 'owner', ownerId: 'local-steve' },
    organizationName: 'Fixture Bank',
    sourceName: 'Checking',
    friendlyName: 'Fixture Bank - Checking',
    currency: 'USD',
    currencyExponent: 2,
    currentBalanceMinor: 10_000,
    balanceAt: '2026-10-01T00:00:00.000Z',
    status: 'active',
    version: 1,
  };
  const records = new Map<string, Record<string, unknown>>([
    [
      ids.original,
      {
        id: ids.original,
        accountId: ids.account,
        origin: 'manual',
        amountMinor: -10_000,
        currency: 'USD',
        currencyExponent: 2,
        postedAt: '2026-09-30T18:00:00.000Z',
        effectiveAt: '2026-09-30T18:00:00.000Z',
        description: 'Original dinner purchase',
        pending: false,
        allocations: [
          { id: ids.allocationFood, amountMinor: -6_000, financeCategoryId: ids.food },
          { id: ids.allocationOther, amountMinor: -4_000, financeCategoryId: ids.food },
        ],
        reconciliationState: 'not-applicable',
        reviewState: 'none',
        status: 'active',
        version: 1,
      },
    ],
    [
      ids.refund,
      {
        id: ids.refund,
        accountId: ids.account,
        origin: 'manual',
        amountMinor: 2_500,
        currency: 'USD',
        currencyExponent: 2,
        postedAt: '2026-10-02T18:00:00.000Z',
        effectiveAt: '2026-10-02T18:00:00.000Z',
        description: 'Dinner refund received',
        pending: false,
        allocations: [],
        reconciliationState: 'not-applicable',
        reviewState: 'none',
        status: 'active',
        version: 1,
      },
    ],
  ]);
  let categories = [
    {
      id: ids.food,
      name: 'Food',
      origin: 'user',
      creatorId: 'local-steve',
      status: 'active',
      version: 1,
    },
  ];
  let merchant = {
    id: ids.merchant,
    name: 'Fixture Cafe',
    city: 'Denver',
    region: 'CO',
    source: 'manual' as const,
    creatorId: 'local-steve',
    status: 'active' as const,
    version: 1,
  };
  let refundEnvelope: Record<string, unknown> | undefined;

  await mockFinanceTransactionBrowsing(page, () => records.values());
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [account], cursor: null },
    }),
  );
  await page.route('**/api/v1/finance/accounts/*/transactions**', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [...records.values()], cursor: null, totalsComplete: true },
    }),
  );
  await page.route('**/api/v1/finance/review-issues**', (route) =>
    route.fulfill({ status: 200, headers: financeSnapshotFixtureHeaders, json: { items: [] } }),
  );
  await page.route('**/api/v1/finance/categories**', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as { name: string; parentId?: string };
      categories = [
        ...categories,
        {
          id: ids.eatingOut,
          name: input.name,
          parentId: input.parentId,
          origin: 'user',
          creatorId: 'local-steve',
          status: 'active',
          version: 1,
        },
      ];
      return route.fulfill({ status: 201, json: categories.at(-1) });
    }
    return route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: categories },
    });
  });
  await page.route(`**/api/v1/finance/merchants/${ids.merchant}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      merchant = { ...merchant, ...input, version: 2 } as typeof merchant;
      return route.fulfill({ status: 200, json: merchant });
    }
    return route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { merchant, transactions: [], totalsComplete: true },
    });
  });
  await page.route('**/api/v1/finance/merchants**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith(`/${ids.merchant}`))
      return route.fallback();
    return route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [merchant], cursor: null },
    });
  });
  await page.route(
    `**/api/v1/finance/transactions/${ids.refund}/refund-relationship`,
    async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({ status: refundEnvelope ? 200 : 404, json: refundEnvelope ?? {} });
      if (route.request().method() === 'DELETE') {
        refundEnvelope = undefined;
        return route.fulfill({ status: 200, json: { relationship: { status: 'removed' } } });
      }
      const input = route.request().postDataJSON() as Record<string, unknown>;
      expect(input).toMatchObject({
        originalExpenseTransactionId: ids.original,
        linkedAmountMinor: 2_500,
        confirmedPartialAllocations: true,
        refundedAllocations: [{ originalAllocationId: ids.allocationFood, amountMinor: 2_500 }],
      });
      refundEnvelope = {
        relationship: {
          version: 1,
          originalExpenseTransactionId: ids.original,
          linkedAmountMinor: 2_500,
          status: 'active',
          calculationState: 'valid',
          refundedAllocations: input.refundedAllocations,
        },
        creditCapacityVersion: 1,
        allocationCapacityVersions: { [ids.allocationFood]: 1 },
      };
      return route.fulfill({ status: 200, json: refundEnvelope });
    },
  );
  await page.route(
    new RegExp('/api/v1/finance/transactions/' + ids.refund + '(?:[?]browse=1)?$'),
    async (route) => {
      if (route.request().method() === 'PATCH') {
        const input = route.request().postDataJSON() as Record<string, unknown>;
        const updated = { ...records.get(ids.refund)!, ...input, version: 2 };
        delete updated.expectedVersion;
        records.set(ids.refund, updated);
        return route.fulfill({ status: 200, json: updated });
      }
      return route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
        json: records.get(ids.refund),
      });
    },
  );
  await page.route(`**/api/v1/finance/transactions/${ids.original}`, (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: records.get(ids.original),
    }),
  );

  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);

  await page.getByRole('button', { name: 'Finance', exact: true }).click();
  const financeSections = page.getByRole('navigation', { name: 'Finance sections' });
  await financeSections.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.getByLabel('Category name').fill('Eating Out');
  await page.getByLabel('Parent category').selectOption(ids.food);
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByText('Food → Eating Out', { exact: true })).toBeVisible();

  await financeSections.getByRole('button', { name: 'Merchants', exact: true }).click();
  await page.getByRole('button', { name: 'Fixture Cafe', exact: true }).click();
  await page.getByRole('button', { name: 'Edit merchant' }).click();
  const editMerchant = page.getByRole('region', { name: 'Edit merchant' });
  await editMerchant.getByLabel('Merchant name').fill('Fixture Coffee');
  await editMerchant.getByLabel('Default category').selectOption(ids.food);
  await editMerchant.getByRole('button', { name: 'Save merchant' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture Coffee' })).toBeVisible();

  await financeSections.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByLabel('Search transactions').fill('Dinner refund received');
  await page.getByRole('link', { name: 'Review Dinner refund received' }).click();
  await page.getByLabel('Payment type').selectOption('check');
  await page
    .getByRole('region', { name: 'Payment details' })
    .getByLabel('Check number', { exact: true })
    .fill('000123');
  await page.getByRole('button', { name: 'Save payment details' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Payment details saved.' }),
  ).toBeVisible();
  await expect(page.getByText(/Unlinked credits do not reduce spending/u)).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Transaction details' }).getByText(/10\/2\/2026/u),
  ).toBeVisible();
  await page.getByLabel('Original expense').selectOption(ids.original);
  await page.getByLabel(`Refunded amount for allocation ${ids.allocationFood}`).fill('25.00');
  await page.getByLabel(`Refunded amount for allocation ${ids.allocationOther}`).fill('0');
  await page.getByLabel('I confirm these original allocation amounts').check();
  await page.getByRole('button', { name: 'Link refund to original expense' }).click();
  await expect(page.getByText('Current state: valid')).toBeVisible();
  await page.getByRole('button', { name: 'Correct refund link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Refund link saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove refund link' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'no longer offsets spending' }),
  ).toBeVisible();
});
