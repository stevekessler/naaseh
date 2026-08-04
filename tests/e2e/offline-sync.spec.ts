import { expect, test, type Page } from '@playwright/test';
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}
test('preserves offline work in the live tab and across a Chromium app-shell reload', async ({
  page,
  context,
}, testInfo) => {
  await signIn(page);
  if (testInfo.project.name === 'chromium')
    await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByLabel('Task label').fill('Written offline');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Written offline' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Written offline' })).toBeVisible();
  }
  await context.setOffline(false);
});
test('defers an app update while offline work is pending', async ({ page, context }) => {
  await signIn(page);
  await context.setOffline(true);
  await page.getByLabel('Task label').fill('Keep during update');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('naaseh:update-ready', {
        detail: {
          apply: () => {
            document.documentElement.dataset.updateApplied = 'true';
          },
        },
      }),
    ),
  );
  await expect(
    page.getByText('An update is ready. Saved offline work will be preserved.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.updateApplied)).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Keep during update' })).toBeVisible();
  await context.setOffline(false);
});
test.describe('mocked reconnect protocol', () => {
  test.use({ serviceWorkers: 'block' });
  test('drains an offline mutation once after reconnect', async ({ page, context }) => {
    await page.route('**/api/v1/sync/push', async (route) => {
      const body = route.request().postDataJSON() as { mutations: Array<{ id: string }> };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: body.mutations.map((item) => ({ mutationId: item.id, status: 'applied' })),
        }),
      });
    });
    await page.route('**/api/v1/sync/pull', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ changes: [], cursor: { public: 0, owner: 0 } }),
      }),
    );
    await signIn(page);
    await context.setOffline(true);
    await page.getByLabel('Task label').fill('Reconnect safely');
    await page.getByRole('button', { name: 'Add task' }).click();
    // The task and its outbox mutation commit atomically. Waiting for the task
    // proves the offline write completed before the browser reconnects.
    await expect(page.getByRole('heading', { name: 'Reconnect safely' })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reconnect safely' })).toBeVisible();
  });
  test('surfaces a same-field conflict without discarding the local task', async ({
    page,
    context,
  }) => {
    await page.route('**/api/v1/sync/push', async (route) => {
      const body = route.request().postDataJSON() as { mutations: Array<{ id: string }> };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: body.mutations.map((item) => ({ mutationId: item.id, status: 'conflict' })),
        }),
      });
    });
    await page.route('**/api/v1/sync/pull', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ changes: [], cursor: { public: 0, owner: 0 } }),
      }),
    );
    await signIn(page);
    await context.setOffline(true);
    await page.getByLabel('Task label').fill('Conflicting offline edit');
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByRole('heading', { name: 'Conflicting offline edit' })).toBeVisible();
    await context.setOffline(false);
    // Conflict capture encrypts an additional record; allow headroom when all
    // browser projects run concurrently on a small CI runner.
    await expect(page.getByRole('status').filter({ hasText: '1 conflict' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Conflicting offline edit' })).toBeVisible();
  });
});
