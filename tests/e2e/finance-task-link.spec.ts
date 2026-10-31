import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  group: '01J00000000000000000000841',
  budget: '01J00000000000000000000842',
  item: '01J00000000000000000000843',
  category: '01J00000000000000000000844',
  task: '01J00000000000000000000845',
  link: '01J00000000000000000000846',
};

const budget = {
  id: ids.budget,
  groupId: ids.group,
  name: 'January household plan',
  budgetDate: '2028-01-01',
  startDate: '2028-01-01',
  endDate: '2028-01-31',
  status: 'active',
  version: 2,
  items: [
    {
      id: ids.item,
      description: 'Utility bill',
      financeCategoryId: ids.category,
      plannedAmountMinor: -10_000,
      actualAmountMinor: 0,
      varianceMinor: 10_000,
      currency: 'USD',
      currencyExponent: 2,
      applicableDate: '2028-01-15',
      relatedAccountIds: [],
      version: 1,
    },
  ],
  totals: [
    {
      currency: 'USD',
      currencyExponent: 2,
      plannedMinor: -10_000,
      actualMinor: 0,
      varianceMinor: 10_000,
    },
  ],
  totalsComplete: true,
};

async function routeFinance(page: Page) {
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
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
      body: JSON.stringify({ items: [budget], cursor: null }),
    }),
  );
  await page.route(`**/api/v1/finance/budgets/${ids.budget}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(budget),
    }),
  );
}

test('creates a task from a budget item and navigates to the ordinary task', async ({ page }) => {
  await routeFinance(page);
  await page.route(`**/api/v1/finance/budget-items/${ids.item}/tasks`, async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      label: 'Pay utility bill',
      assigneeId: 'local-steve',
      dueDate: '2028-01-15',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        taskId: ids.task,
        financialTaskLinkId: ids.link,
      }),
    });
  });
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  const item = page.getByRole('article', { name: 'Utility bill budget item' });
  await item.getByRole('button', { name: 'Create task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task from Utility bill' });
  await expect(dialog.getByLabel('Task label')).toHaveValue('Utility bill');
  await dialog.getByLabel('Task label').fill('Pay utility bill');
  await expect(dialog.getByLabel('Due date')).toHaveValue('2028-01-15');
  await expect(dialog.getByRole('note')).toContainText(/sharing stays separate/i);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  const createdLink = item.getByRole('link', { name: 'Open created task' });
  await expect(createdLink).toHaveAttribute('href', `/tasks/${ids.task}`);
  await createdLink.click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${ids.task}$`, 'u'));
});

test('keeps the form recoverable after an atomic creation failure', async ({ page }) => {
  await routeFinance(page);
  let attempts = 0;
  await page.route(`**/api/v1/finance/budget-items/${ids.item}/tasks`, async (route) => {
    attempts += 1;
    await route.fulfill(
      attempts === 1
        ? {
            status: 409,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'https://naaseh.example/problems/finance_conflict',
              title: 'Conflict',
              status: 409,
              code: 'finance_conflict',
              correlationId: 'task-link',
              detail: 'The Finance record changed.',
            }),
          }
        : {
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              taskId: ids.task,
              financialTaskLinkId: ids.link,
            }),
          },
    );
  });
  await signIn(page);
  await page.goto(`/finance/budgets/${ids.budget}`);
  const item = page.getByRole('article', { name: 'Utility bill budget item' });
  await item.getByRole('button', { name: 'Create task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task from Utility bill' });
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /task was not created/i })).toBeVisible();
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(item.getByRole('link', { name: 'Open created task' })).toBeVisible();
  expect(attempts).toBe(2);
});

test('shows no financial relationship hint when the Finance-only link is absent', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/tasks');
  await expect(page.getByRole('link', { name: /related financial item/i })).toHaveCount(0);
  await expect(
    page.getByText(/financial item unavailable|hidden finance|finance access required/i),
  ).toHaveCount(0);
});
