import type { Task } from '@naaseh/domain';
import { expect, test, type Page } from '@playwright/test';
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}
test('preserves offline work in the live tab and across a validated Chromium app-shell reload', async ({
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
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await context.setOffline(false);
    await page.evaluate(() => scrollTo(0, 0));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Written offline' })).toBeVisible();
  }
  await context.setOffline(false);
});
test.describe('app update recovery', () => {
  test.use({ serviceWorkers: 'block' });
  test('updates with pending offline work and preserves it through an activation retry', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await context.setOffline(true);
    await page.getByLabel('Task label').fill('Keep during update');
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByRole('heading', { name: 'Keep during update' })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 220 });
      window.dispatchEvent(new Event('scroll'));
      let attempts = 0;
      window.dispatchEvent(
        new CustomEvent('naaseh:update-ready', {
          detail: {
            apply: async () => {
              attempts += 1;
              if (attempts === 1) throw new Error('Activation failed');
              document.documentElement.dataset.updateApplied = 'true';
            },
          },
        }),
      );
    });
    await expect(page.locator('.topbar')).toHaveClass(/topbar-collapsed/);
    const prompt = page.getByRole('status', { name: 'App update' });
    await prompt.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(prompt).toContainText('The update could not be applied. Your saved work is safe.');
    expect(
      await page.evaluate(() => document.documentElement.dataset.updateApplied),
    ).toBeUndefined();
    await expect(page.getByRole('heading', { name: 'Keep during update' })).toBeVisible();
    await prompt.getByRole('button', { name: 'Retry update' }).click();
    await expect(prompt).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.updateApplied)).toBe('true');
    await expect(page.getByRole('heading', { name: 'Keep during update' })).toBeVisible();
  });
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
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reconnect safely' })).toBeVisible();
  });
  test('reviews and resolves conflicts while preserving failed and offline choices', async ({
    page,
    context,
  }) => {
    let serverTask: Task;
    let lastMutationId = '';
    let reapply = false;
    let pushedBase: number | undefined;
    await page.route('**/api/v1/sync/push', async (route) => {
      const { mutations } = route.request().postDataJSON();
      const item = mutations[0];
      if (item.operation === 'create') {
        serverTask = {
          ...item.payload,
          label: 'Server task',
          memo: 'Server memo contents',
          memoDocument: undefined,
          version: 7,
        };
      } else if (reapply) {
        expect(item.id).not.toBe(lastMutationId);
        pushedBase = item.baseVersion;
        serverTask = { ...serverTask, ...item.payload.patch, version: 9 };
      }
      lastMutationId = item.id;
      await route.fulfill({
        json: {
          results: [
            {
              mutationId: item.id,
              status: reapply ? 'applied' : 'conflict',
              version: serverTask.version,
            },
          ],
        },
      });
    });
    await page.route('**/api/v1/tasks/*', (route) => route.fulfill({ json: serverTask }));
    await page.route('**/api/v1/sync/pull', (route) =>
      route.fulfill({
        json: {
          changes: reapply
            ? [
                {
                  entityType: 'task',
                  entityId: serverTask.id,
                  operation: 'upsert',
                  payload: serverTask,
                },
              ]
            : [],
          cursor: { public: 0, owner: 0 },
        },
      }),
    );
    await signIn(page);
    await context.setOffline(true);
    await page.getByLabel('Task label').fill('Conflicting offline edit');
    await page.getByText('Task details', { exact: true }).click();
    await page.getByLabel('Memo', { exact: true }).fill('My saved memo contents');
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByRole('heading', { name: 'Conflicting offline edit' })).toBeVisible();
    await context.setOffline(false);
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.getByRole('button', { name: 'Review conflicts (1)' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Review conflicts (1)' }).click();
    const review = page.getByRole('dialog', { name: 'Resolve sync conflicts' });
    await expect(review).toContainText('Conflicting offline edit');
    await expect(review).toContainText('Server task');
    await expect(review).toContainText('My saved memo contents');
    await expect(review).toContainText('Server memo contents');
    await expect(review).not.toContainText('Memo contents stay protected');
    await expect(review).not.toContainText('Change:');
    await expect(review).not.toContainText('Reference:');
    // A concurrent server edit must be reviewed before the local copy is replaced.
    serverTask = { ...serverTask!, label: 'New server task', version: 8 };
    await review.getByRole('button', { name: 'Keep Server Version' }).click();
    await expect(review.getByRole('alert')).toContainText('server version changed');
    await review.getByRole('button', { name: 'Refresh comparison' }).click();
    await expect(review).toContainText('New server task');
    await review.getByRole('button', { name: 'Keep Server Version' }).click();
    await expect(review).toContainText('All conflicts resolved');
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New server task' })).toBeVisible();
    // Now review an update and reapply it against the reviewed server version.
    await page.getByRole('button', { name: 'New server task', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit task' });
    await edit.getByLabel('Task label').fill('My revised task');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(edit).toBeHidden();
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByRole('button', { name: 'Review conflicts (1)' }).click();
    await expect(review).toContainText('My revised task');
    await expect(review.getByRole('button', { name: 'Keep My Version' })).toBeEnabled();
    await context.setOffline(true);
    await review.getByRole('button', { name: 'Keep My Version' }).click();
    await expect(review.getByRole('alert')).toContainText('Connect to review');
    await context.setOffline(false);
    reapply = true;
    await review.getByRole('button', { name: 'Keep My Version' }).click();
    await expect(review).toContainText('All conflicts resolved');
    await expect.poll(() => pushedBase).toBe(8);
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My revised task' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Review conflicts/ })).toHaveCount(0);
  });
});
