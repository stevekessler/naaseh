import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  group: '01J00000000000000000000941',
  budget: '01J00000000000000000000942',
  account: '01J00000000000000000000943',
  category: '01J00000000000000000000944',
  reconciliation: '01J00000000000000000000945',
};
const prior = {
  id: ids.reconciliation,
  budgetId: ids.budget,
  reconciledAt: '2027-09-30T23:00:00.000Z',
  reconciledBy: 'member-1',
  budgetVersion: 3,
  sourceVersionDigest: 'a'.repeat(64),
  totalsByCurrency: [
    {
      currency: 'USD',
      currencyExponent: 2,
      plannedMinor: -5_000,
      actualMinor: -4_500,
      varianceMinor: 500,
    },
  ],
  totalsByCategory: [],
};

const budget = (overrides: Record<string, unknown> = {}) => ({
  id: ids.budget,
  groupId: ids.group,
  name: 'September plan',
  budgetDate: '2027-09-01',
  startDate: '2027-09-01',
  endDate: '2027-09-30',
  status: 'active',
  items: [],
  totals: [
    {
      currency: 'USD',
      currencyExponent: 2,
      plannedMinor: -5_000,
      actualMinor: -4_500,
      varianceMinor: 500,
    },
  ],
  categoryTotals: [],
  totalsComplete: true,
  reconciliationReadiness: { canReconcile: true, reasons: [] },
  reconciliations: [],
  version: 3,
  ...overrides,
});

async function routes(page: Page, detail: Record<string, unknown>, reconcileStatus = 201) {
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
      body: JSON.stringify({ items: [{ id: ids.category, name: 'Utilities' }] }),
    }),
  );
  await page.route('**/api/v1/finance/budgets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [detail], cursor: null }),
    }),
  );
  await page.route(`**/api/v1/finance/budgets/${ids.budget}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }),
  );
  await page.route(`**/api/v1/finance/budgets/${ids.budget}/reconcile`, (route) =>
    route.fulfill({
      status: reconcileStatus,
      contentType: reconcileStatus === 201 ? 'application/json' : 'application/problem+json',
      body: JSON.stringify(
        reconcileStatus === 201
          ? prior
          : {
              status: 409,
              code: 'finance_conflict',
              title: 'Finance record changed',
              correlationId: 'safe-correlation',
            },
      ),
    }),
  );
}

test('confirms reconciliation and displays immutable actor/time history', async ({ page }) => {
  await routes(page, budget());
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  await expect(page.getByText('Not reconciled')).toBeVisible();
  await page.getByRole('button', { name: 'Reconcile budget' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm budget reconciliation' });
  await expect(dialog).toContainText('complete authorized totals');
  await dialog.getByRole('button', { name: 'Confirm reconciliation' }).click();
  await expect(page.getByText('Reconciled by member-1')).toBeVisible();
  await expect(page.getByText(/Sep 30, 2027/u)).toBeVisible();
});

test('explains incomplete and offline prerequisites without allowing completion', async ({
  page,
  context,
}) => {
  await routes(
    page,
    budget({
      totalsComplete: false,
      reconciliationReadiness: {
        canReconcile: false,
        reasons: ['Complete access to every linked account is required.'],
      },
    }),
  );
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  await expect(page.getByRole('button', { name: 'Reconcile budget' })).toBeDisabled();
  await expect(
    page.getByText('Complete access to every linked account is required.'),
  ).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Connect to the internet to reconcile this budget.')).toBeVisible();
});

test('retains prior history through later changes and failed retries', async ({ page }) => {
  await routes(
    page,
    budget({
      status: 'changed-since-reconciliation',
      lastReconciledAt: prior.reconciledAt,
      reconciliations: [prior],
    }),
    409,
  );
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  await expect(page.getByText('Changed since reconciliation')).toBeVisible();
  await expect(page.getByText('Reconciled by member-1')).toBeVisible();
  await page.getByRole('button', { name: 'Reconcile budget' }).click();
  await page
    .getByRole('dialog', { name: 'Confirm budget reconciliation' })
    .getByRole('button', { name: 'Confirm reconciliation' })
    .click();
  await expect(
    page.getByText(
      'Reconciliation could not be completed. Nothing was changed; refresh and review the budget.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Reconciled by member-1')).toBeVisible();
});
