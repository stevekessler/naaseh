import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

async function addTask(
  page: Page,
  task: { label: string; memo: string; dueAt: string; assignee: string },
) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(task.label);
  await form.getByLabel('Memo').fill(task.memo);
  await form.getByLabel('Due date and time').fill(task.dueAt);
  await form.getByLabel('Assignee').fill(task.assignee);
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: task.label })).toBeVisible();
}

test('searches and combines filters without putting memo queries in navigation state', async ({
  page,
  context,
}) => {
  await signIn(page);
  await addTask(page, {
    label: 'Project Cedar',
    memo: 'Request the roof estimate',
    dueAt: '2030-01-15T09:00',
    assignee: 'steve',
  });
  await addTask(page, {
    label: 'Grocery list',
    memo: 'Apples and oranges',
    dueAt: '2030-02-20T17:00',
    assignee: 'alex',
  });

  const filters = page.getByRole('region', { name: 'Search and filters' });
  await filters.getByLabel('Search').fill('estim');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();
  await expect(page).not.toHaveURL(/estim|roof/i);

  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await filters.getByRole('textbox', { name: 'From' }).fill('2030-01-01');
  await filters.getByRole('textbox', { name: 'To', exact: true }).fill('2030-01-31');
  await filters.getByLabel('Assignee').fill('steve');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();
  await expect(page).toHaveURL(/from=2030-01-01/);
  await expect(page).toHaveURL(/assigneeId=steve/);

  await context.setOffline(true);
  await filters.getByLabel('Search').fill('ced');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page).not.toHaveURL(/ced/i);
  await context.setOffline(false);
});
