import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

test.describe('mocked group API', () => {
  // A previously installed WebKit worker can otherwise own the request before
  // page.route sees it. The separate offline-reload test keeps workers enabled.
  test.use({ serviceWorkers: 'block' });

  test('creates and caches groups while presenting generic PIN throttling failures', async ({
    page,
    context,
  }) => {
    let joinAttempts = 0;
    await page.route('**/api/v1/groups', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'family',
                name: 'Family',
                ownerId: 'alex',
                status: 'active',
                hasJoinPin: true,
                joined: false,
                version: 1,
              },
            ],
          }),
        });
      const body = route.request().postDataJSON() as { name: string; joinPin?: string };
      expect(body).toEqual({ name: 'Work', joinPin: '654321' });
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'work',
          name: 'Work',
          ownerId: 'local-steve',
          status: 'active',
          hasJoinPin: true,
          joined: true,
          role: 'owner',
          version: 1,
        }),
      });
    });
    await page.route('**/api/v1/groups/family/join', async (route) => {
      joinAttempts += 1;
      return route.fulfill({
        status: joinAttempts === 1 ? 403 : 429,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'group_join_failed', message: 'Unable to join group.' }),
      });
    });

    await signIn(page);
    await page.getByRole('button', { name: 'Groups' }).click();
    await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
    await page.getByRole('button', { name: 'Join' }).click();
    await page.getByLabel('Group PIN').fill('111111');
    await page.getByRole('button', { name: 'Join group' }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to update group.');
    await page.getByLabel('Group PIN').fill('123456');
    await page.getByRole('button', { name: 'Join group' }).click();
    await expect(page.getByRole('alert')).toHaveText('Too many attempts. Try again later.');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Create group' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create group' });
    await createDialog.getByLabel('Group name').fill('Work');
    await createDialog.getByLabel('Optional group PIN').fill('654321');
    await createDialog.getByRole('button', { name: 'Create group' }).click();
    await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
    await expect(page.getByText('Active owner')).toBeVisible();

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Tasks' }).click();
    await page.getByRole('button', { name: 'Groups' }).click();
    await expect(page.getByText(/Offline: showing saved group status/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create group' })).toBeDisabled();
    await context.setOffline(false);
  });
});

test('preserves an owner private-task transition while offline and after reload', async ({
  page,
  context,
}, testInfo) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Owner offline private task');
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('heading', { name: 'Owner offline private task' }).click();
  const detail = page.getByLabel('Task details');
  await context.setOffline(true);
  await detail.getByLabel('Private task').check();
  await detail.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTitle('Private')).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await page.reload();
    await expect(page.getByLabel('Task details').getByLabel('Private task')).toBeChecked();
  }
  await context.setOffline(false);
});
