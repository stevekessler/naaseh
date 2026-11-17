import { expect, test } from '@playwright/test';
import { createTask, journalSyncContractVersion } from '@naaseh/domain';

test.use({ serviceWorkers: 'block' });

test('a saved admin view cannot sync under a different browser account', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'naaseh-session-view',
      JSON.stringify({
        userId: 'steve-id',
        displayName: 'Steve',
        role: 'admin',
        csrfToken: 'saved-csrf',
      }),
    );
  });
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'other-user', displayName: 'Other', role: 'user' },
        csrfToken: 'other-csrf',
      }),
    }),
  );
  let pushes = 0;
  await page.route('**/api/v1/sync/push', (route) => {
    pushes += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto('/admin/categories');

  await expect(page.getByRole('heading', { name: 'Securing your local data' })).toBeVisible();
  await expect(page.getByText(/signed in as another account/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categories and Projects' })).toHaveCount(0);
  expect(pushes).toBe(0);
});

test('after session expiry, waits for later task pages before showing the list', async ({
  page,
}) => {
  const user = { id: 'steve-id', displayName: 'Steve', role: 'user' };
  const oldTask = createTask({ label: 'Task removed on another device' }, user.id);
  const currentTask = createTask({ label: 'Current task from another device' }, user.id);
  const upsert = (task: typeof oldTask) => ({
    entityType: 'task',
    entityId: task.id,
    operation: 'upsert',
    payload: task,
  });
  let validSession = false;
  let renewed = false;
  const laterPageRequested = Promise.withResolvers<void>();
  const releaseLaterPage = Promise.withResolvers<void>();
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({ status: validSession ? 200 : 401, json: { user, csrfToken: 'csrf' } }),
  );
  await page.route('**/api/v1/auth/login', (route) => {
    validSession = true;
    return route.fulfill({ json: { user, csrfToken: 'csrf' } });
  });
  await page.route('**/api/v1/sync/bootstrap', (route) =>
    route.fulfill({
      json: {
        tasks: [renewed ? currentTask : oldTask],
        categories: [],
        projects: [],
        lists: [],
        listItems: [],
      },
    }),
  );
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON();
    if (body.journalCursor !== undefined)
      return route.fulfill({
        json: {
          version: journalSyncContractVersion,
          changes: [],
          journalCursor: body.journalCursor,
          hasMore: false,
        },
      });
    const after = body.cursor?.owner ?? 0;
    if (after === 0)
      return route.fulfill({ json: { changes: [upsert(oldTask)], cursor: { owner: 1 } } });
    if (renewed && after === 1) {
      laterPageRequested.resolve();
      await releaseLaterPage.promise;
      return route.fulfill({
        json: {
          changes: [
            { entityType: 'task', entityId: oldTask.id, operation: 'tombstone' },
            upsert(currentTask),
          ],
          cursor: { owner: 2 },
        },
      });
    }
    return route.fulfill({ json: { changes: [], cursor: { owner: after } } });
  });

  const signIn = async () => {
    await page.getByLabel('Username').fill('steve');
    await page.getByLabel('Password').fill('local');
    await page.getByRole('button', { name: 'Sign in' }).click();
  };
  const staleHeading = page.getByRole('heading', { name: oldTask.label });
  await page.goto('/');
  await signIn();
  await expect(staleHeading).toBeVisible();

  validSession = false;
  renewed = true;
  await page.reload();
  await signIn();
  try {
    await expect(page.getByRole('heading', { name: 'Syncing your tasks' })).toBeVisible();
    await laterPageRequested.promise;
    await expect(staleHeading).toHaveCount(0);
  } finally {
    releaseLaterPage.resolve();
  }
  await expect(page.getByRole('heading', { name: currentTask.label })).toBeVisible();
  await expect(staleHeading).toHaveCount(0);
});
