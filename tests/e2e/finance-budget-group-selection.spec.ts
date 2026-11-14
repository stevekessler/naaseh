import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  group: '01J00000000000000000000601',
  budget: '01J00000000000000000000602',
  item: '01J00000000000000000000603',
  category: '01J00000000000000000000604',
};

const desktopOnly = (testInfo: TestInfo) =>
  test.skip(['iphone', 'ipad'].includes(testInfo.project.name), 'T058 requires Chromium/WebKit.');

const group = {
  id: ids.group,
  name: 'Empty-account household',
  ownerId: 'local-steve',
  status: 'active',
  hasJoinPin: false,
  joined: true,
  role: 'member',
  version: 1,
};

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: ids.budget,
  groupId: ids.group,
  name: 'December household plan',
  budgetDate: '2026-12-01',
  startDate: '2026-12-01',
  endDate: null,
  status: 'active',
  activity: 'active',
  activityChangedAt: '2026-11-14T00:00:00.000Z',
  activityChangedBy: 'local-steve',
  items: [
    {
      id: ids.item,
      description: 'Existing linked rent',
      financeCategoryId: ids.category,
      plannedAmountMinor: -120_000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [],
      status: 'active',
      version: 1,
    },
  ],
  totals: [],
  totalsComplete: true,
  version: 1,
  ...overrides,
});

async function routeBudgetGroups(page: Page, options: { eligible: boolean; legacy?: boolean }) {
  let budget = options.legacy
    ? detail({ status: 'draft', activity: 'inactive', name: 'Imported draft' })
    : undefined;
  let createBody: Record<string, unknown> | undefined;

  await page.route('**/api/v1/groups', (route) =>
    route.fulfill({ status: 200, json: { items: options.eligible ? [group] : [] } }),
  );
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [], cursor: null },
    }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: [{ id: ids.category, name: 'Housing' }], cursor: null },
    }),
  );
  await page.route('**/api/v1/finance/budgets**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/finance/budgets')) {
      createBody = request.postDataJSON() as Record<string, unknown>;
      budget = detail({ ...createBody, version: 1 });
      return route.fulfill({ status: 201, json: budget });
    }
    if (request.method() === 'PATCH') {
      const input = request.postDataJSON() as { expectedVersion: number; status?: string };
      budget = {
        ...budget!,
        status: input.status ?? budget!.status,
        activity: 'active',
        version: 2,
      };
      return route.fulfill({ status: 200, json: budget });
    }
    const action = path.match(/\/(deactivate|reactivate|close|reopen)$/u)?.[1];
    if (request.method() === 'POST' && action) {
      budget = {
        ...budget!,
        activity:
          action === 'deactivate'
            ? 'inactive'
            : action === 'reactivate'
              ? 'active'
              : budget!.activity,
        ...(action === 'close'
          ? { closedAt: '2026-11-15T00:00:00.000Z', closedBy: 'local-steve' }
          : {}),
        version: Number(budget!.version) + 1,
      };
      return route.fulfill({ status: 200, json: budget });
    }
    if (path.endsWith(`/finance/budgets/${ids.budget}`))
      return route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
        json: budget,
      });
    return route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: { items: budget ? [budget] : [], cursor: null },
    });
  });
  return {
    createBody: () => createBody,
    budget: () => budget,
  };
}

test('saves an active no-account group budget and reverses activity without losing links', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const state = await routeBudgetGroups(page, { eligible: true });
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Create budget' }).click();
  await expect(page.getByLabel('Group')).toContainText('Empty-account household');
  await expect(page.getByText(/No accounts are required/u)).toBeVisible();
  await page.getByLabel('Budget name').fill('December household plan');
  await page.getByLabel('Group').selectOption(ids.group);
  await page.getByLabel('Budget date').fill('2026-12-01');
  await page.getByLabel('Start date').fill('2026-12-01');
  await page.getByRole('button', { name: 'Save budget' }).click();

  await expect(page.getByText('Budget activity: Active')).toBeVisible();
  expect(state.createBody()).toMatchObject({ groupId: ids.group, status: 'active' });
  await expect(
    page.getByRole('article', { name: 'Existing linked rent budget item' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('Budget activity: Inactive')).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Existing linked rent budget item' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await expect(page.getByText('Budget activity: Active')).toBeVisible();
  expect(state.budget()?.items).toHaveLength(1);
});

test('offers explicit activation for a migrated legacy draft', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await routeBudgetGroups(page, { eligible: true, legacy: true });
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  await expect(page.getByText('Legacy draft')).toBeVisible();
  await page.getByRole('button', { name: 'Save as active' }).click();
  await expect(page.getByText('Budget activity: Active')).toBeVisible();
});

test('shows an actionable state when no eligible membership exists', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await routeBudgetGroups(page, { eligible: false });
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Create budget' }).click();
  await expect(
    page.getByText(/not currently an active member of an eligible group/i),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage groups' }).click();
  await expect(page).toHaveURL(/\/groups$/u);
});
