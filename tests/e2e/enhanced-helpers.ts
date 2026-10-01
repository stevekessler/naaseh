import { expect, type Locator, type Page } from '@playwright/test';

export async function expandTaskDetails(form: Locator) {
  const details = form.locator('.task-form-details');
  if ((await details.getAttribute('open')) === null)
    await details.getByText('Task details', { exact: true }).click();
  await expect(details).toHaveAttribute('open', '');
}

export async function setTaskDueDate(form: Locator, date: string, time?: string) {
  await form.getByRole('button', { name: /Add due date|Change due date/ }).click();
  const dialog = form.page().getByRole('dialog', { name: 'Set due date' });
  await dialog.getByLabel('Due date', { exact: true }).fill(date);
  if (time) {
    await dialog.getByLabel('Add a time').check();
    const [hourText = '10', minute = '00'] = time.split(':');
    const hour24 = Number(hourText);
    await dialog.getByLabel('Due time hour').selectOption(String(hour24 % 12 || 12));
    await dialog.getByLabel('Due time minute').selectOption(minute);
    await dialog.getByLabel('Due time AM or PM').selectOption(hour24 >= 12 ? 'PM' : 'AM');
  }
  await dialog.getByRole('button', { name: 'Set due date' }).click();
}

export async function signIn(page: Page) {
  await page.route('**/api/v1/sync/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tasks: [],
        categories: [],
        projects: [],
        lists: [],
        listItems: [],
        cursor: { public: 0, owner: 0 },
      }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  const bootstrapResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/sync/bootstrap',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  await bootstrapResponse;
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
  await page.getByLabel('List name').press('Enter');
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
  await openTaskSection(page, 'Completed Tasks');
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Completed Tasks', exact: true })).toBeVisible();
}

export async function openTaskSection(
  page: Page,
  section: 'My Tasks' | 'Personal Stack' | 'Completed Tasks' | 'Archive',
) {
  const trigger = page.getByRole('button', { name: 'Tasks', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const link = page
    .locator('#tasks-navigation-links')
    .getByRole('button', { name: section, exact: true });
  await link.focus();
  await link.press('Enter');
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
