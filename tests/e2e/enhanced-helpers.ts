import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

export async function mockSuccessfulSync(page: Page) {
  await page.route('**/api/v1/sync/push', async (route) => {
    const body = route.request().postDataJSON() as {
      mutations?: Array<{ id: string; baseVersion?: number }>;
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: (body.mutations ?? []).map((mutation) => ({
          mutationId: mutation.id,
          operationId: mutation.id,
          status: 'applied',
          version: (mutation.baseVersion ?? 0) + 1,
        })),
      }),
    });
  });
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as { cursor?: Record<string, number> };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ changes: [], cursor: body.cursor ?? {} }),
    });
  });
}

export async function openLists(page: Page) {
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lists', exact: true })).toBeVisible();
}

export async function createListWithItem(page: Page, listName: string, itemName: string) {
  await openLists(page);
  await page.getByLabel('List name').fill(listName);
  await page.getByRole('button', { name: 'Create list' }).click();
  const list = page.locator('.named-list').filter({ hasText: listName });
  await list.getByLabel('Add an item').fill(itemName);
  await list.getByRole('button', { name: 'Add item' }).click();
  await expect(list.getByText(itemName, { exact: true })).toBeVisible();
  return list;
}

export async function addTask(page: Page, label: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: label })).toBeVisible();
}

export async function openCompletedTasks(page: Page) {
  await page.getByRole('button', { name: 'Completed Tasks', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Completed Tasks', exact: true })).toBeVisible();
}

export async function setOffline(page: Page, offline = true) {
  await page.context().setOffline(offline);
  await page.evaluate((isOffline) => {
    window.dispatchEvent(new Event(isOffline ? 'offline' : 'online'));
  }, offline);
}

export async function resizePreservingValue(
  page: Page,
  fieldLabel: string,
  value: string,
  width: number,
  height: number,
) {
  const field = page.getByLabel(fieldLabel);
  await field.fill(value);
  await page.setViewportSize({ width, height });
  await expect(field).toHaveValue(value);
}
