import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block', timezoneId: 'America/Denver' });

const ids = {
  group: '01J00000000000000000000941',
  account: '01J00000000000000000000942',
  budget: '01J00000000000000000000943',
  expense: '01J00000000000000000000944',
  task: '01J00000000000000000000945',
  link: '01J00000000000000000000946',
};
const desktopOnly = (testInfo: TestInfo) =>
  test.skip(['iphone', 'ipad'].includes(testInfo.project.name), 'Phase 11 requires Chromium/WebKit.');

async function prepareUpcoming(page: Page) {
  let taskCreates = 0;
  const expense = {
    id: ids.expense, groupId: ids.group, accountId: ids.account, budgetId: ids.budget,
    description: 'Protected annual insurance', expectedAmountMinor: 10_000, currency: 'USD',
    currencyExponent: 2, dueDate: '2027-01-20',
    entryContext: { enteredAt: '2026-11-15T15:00:00.000Z', localDate: '2026-11-15',
      timeZone: 'America/Denver' },
    dateChangeHistory: [], lifecycle: 'active', creatorId: 'local-steve',
    acceptedAt: '2026-11-15T15:00:00.000Z', createdAt: '2026-11-15T15:00:00.000Z',
    updatedAt: '2026-11-15T15:00:00.000Z', version: 1,
  };
  const view = { expense, fulfillments: [], claimVersions: {}, fulfilledAmountMinor: 0,
    remainingAmountMinor: 10_000, overpaidAmountMinor: 0, state: 'upcoming' };
  await page.route('**/api/v1/groups', (route) => route.fulfill({ json: { items: [{
    id: ids.group, name: 'Household', ownerId: 'local-steve', status: 'active', joined: true,
    role: 'member', version: 1,
  }] } }));
  await page.route('**/api/v1/finance/accounts**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders,
    json: { items: [{ id: ids.account, scope: { type: 'owner', ownerId: 'local-steve' },
      friendlyName: 'Checking', sourceName: 'Checking', organizationName: 'Bank', currency: 'USD',
      currencyExponent: 2, currentBalanceMinor: 100_000, status: 'active', version: 1 }], cursor: null },
  }));
  await page.route('**/api/v1/finance/budgets**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders,
    json: { items: [{ id: ids.budget, groupId: ids.group, name: 'Plan', status: 'active',
      activity: 'active', version: 1 }], cursor: null },
  }));
  await page.route('**/api/v1/finance/upcoming-expenses**', (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith(`/upcoming-expenses/${ids.expense}/tasks`)) {
      taskCreates++;
      return route.fulfill({ status: 201, json: { taskId: ids.task, financialTaskLinkId: ids.link } });
    }
    if (request.method() === 'GET' && request.url().endsWith(`/upcoming-expenses/${ids.expense}/tasks`))
      return route.fulfill({ json: { tasks: [] } });
    return route.fulfill({ headers: financeSnapshotFixtureHeaders,
      json: request.url().endsWith(ids.expense) ? view : { items: [view], cursor: null } });
  });
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await page.route('**/api/v1/sync/pull', (route) => {
    const body = route.request().postDataJSON() as { financeCacheOnly?: boolean; financeCursor?: unknown };
    if (!body.financeCacheOnly) return route.fallback();
    return route.fulfill({ json: { changes: [], financeChanges: [], cursor: {},
      financeCursor: body.financeCursor,
      financeCache: { status: 'current', proof: financeSnapshotFixtureHeaders['x-finance-cache-proof'] } } });
  });
  await signIn(page);
  return () => taskCreates;
}

test('uses the normal task form for Add Task and cancel creates nothing', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const taskCreates = await prepareUpcoming(page);
  await page.goto(`/finance/upcoming-expenses/${ids.expense}`);
  await page.getByRole('button', { name: 'Create task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task from Review upcoming expense' });
  await expect(dialog.getByLabel('Task label')).toHaveValue('Review upcoming expense');
  await expect(dialog).not.toContainText('Protected annual insurance');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(taskCreates()).toBe(0);

  await page.getByRole('button', { name: 'Create task' }).click();
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: 'Open created task' })).toHaveAttribute(
    'href', `/tasks/${ids.task}`,
  );
  expect(taskCreates()).toBe(1);
});

test('keeps Upcoming Expenses task and post-it displays off until the user opts in', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await mockUnprotectedFinanceSecurity(page);
  await signIn(page);
  await page.goto('/tasks');
  await page.getByText('Columns', { exact: true }).click();
  const column = page.getByLabel('Show Upcoming Expenses column');
  await expect(column).not.toBeChecked();
  await column.check();
  await expect(column).toBeChecked();
  await page.getByRole('button', { name: 'Post-its' }).click();
  await page.getByText('Fields', { exact: true }).click();
  const field = page.getByLabel('Show Upcoming Expenses on post-its');
  await expect(field).not.toBeChecked();
  await field.check();
  await expect(field).toBeChecked();
});
