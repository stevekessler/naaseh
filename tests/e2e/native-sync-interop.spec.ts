import { createTask } from '@naaseh/domain';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('shows a native-created record and safely replays a web offline mutation', async ({
  page,
  context,
}) => {
  const nativeTask = createTask(
    { label: 'Created on iPhone', visibility: 'private' },
    'user-1',
    new Date('2026-10-07T12:00:00Z'),
  );
  const pushed: Array<{ id: string }> = [];
  await page.route('**/api/v1/sync/bootstrap', (route) =>
    route.fulfill({
      json: {
        tasks: [nativeTask],
        categories: [],
        projects: [],
        lists: [],
        listItems: [],
        cursor: { public: 0, owner: 1 },
      },
    }),
  );
  await page.route('**/api/v1/sync/push', async (route) => {
    const body = route.request().postDataJSON() as { mutations: Array<{ id: string }> };
    pushed.push(...body.mutations);
    await route.fulfill({
      json: {
        results: body.mutations.map((mutation) => ({
          mutationId: mutation.id,
          status: 'applied',
          version: 1,
        })),
      },
    });
  });
  await page.route('**/api/v1/sync/pull', (route) =>
    route.fulfill({ json: { changes: [], cursor: { public: 0, owner: 1 } } }),
  );

  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Created on iPhone' })).toBeVisible();

  await context.setOffline(true);
  await page.getByLabel('Task label').fill('Created offline on web');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Created offline on web' })).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
  expect(pushed).toHaveLength(1);
  await expect(page.getByRole('heading', { name: 'Created on iPhone' })).toBeVisible();
});
