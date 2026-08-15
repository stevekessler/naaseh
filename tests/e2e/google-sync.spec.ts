import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('shows responsive Google settings, preview, date disclosure, status, and conflict choices', async ({
  page,
}) => {
  await page.route('**/api/v1/integrations/google/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: 'preview',
        connectionId: 'connection',
        defaultLocalTime: '09:00',
        defaultTimeZone: 'America/Denver',
        version: 2,
        pendingCount: 0,
        conflictCount: 1,
        quarantineCount: 0,
        skippedUndatedCount: 1,
      }),
    }),
  );
  await page.route('**/api/v1/integrations/google/task-lists', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'list', title: 'Naaseh' }]),
    }),
  );
  await page.route('**/api/v1/integrations/google/conflicts', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/integrations/google/preview', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        publishCount: 3,
        importCount: 2,
        skippedPrivateCount: 1,
        skippedUndatedCount: 1,
        conflictRiskCount: 0,
      }),
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Google Tasks synchronization' })).toBeVisible();
  await expect(page.locator('.google-sync-page [role="status"]')).toContainText('preview');
  await page.getByRole('button', { name: 'Preview Naaseh' }).click();
  await expect(
    page.getByRole('heading', { name: 'Initial synchronization preview' }),
  ).toBeVisible();
  await expect(page.getByText(/stores a due date but not a due time/)).toBeVisible();
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
});

test('keeps Google settings readable offline and disables a new connection', async ({
  page,
  context,
}) => {
  await page.route('**/api/v1/integrations/google/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: 'disconnected',
        pendingCount: 0,
        conflictCount: 0,
        quarantineCount: 0,
        skippedUndatedCount: 0,
      }),
    }),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Google Tasks synchronization' })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(
    page.getByText(
      'Offline. Last-known Google status remains available; synchronization will wait.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Google' })).toBeDisabled();
});

test('keeps encrypted conflict choices available offline and resolves an edited value after reconnecting', async ({
  page,
  context,
}) => {
  const conflict = {
    id: '01J00000000000000000000993',
    connectionId: '01J00000000000000000000981',
    userId: 'steve',
    taskId: '01J00000000000000000000991',
    field: 'title',
    baseValue: 'Old title',
    localValue: 'Naaseh title',
    remoteValue: 'Google title',
    detectedLocalVersion: 2,
    detectedLinkVersion: 1,
    state: 'open',
    version: 1,
    createdAt: '2026-07-25T12:00:00.000Z',
    updatedAt: '2026-07-25T12:00:00.000Z',
  };
  await page.route('**/api/v1/integrations/google/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: 'active',
        connectionId: conflict.connectionId,
        selectedTaskListTitle: 'Naaseh',
        defaultLocalTime: '09:00',
        defaultTimeZone: 'America/Denver',
        version: 2,
        pendingCount: 0,
        conflictCount: 1,
        quarantineCount: 0,
        skippedUndatedCount: 0,
      }),
    }),
  );
  await page.route('**/api/v1/integrations/google/task-lists', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[{"id":"list","title":"Naaseh"}]',
    }),
  );
  await page.route('**/api/v1/integrations/google/conflicts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([conflict]),
    }),
  );
  await page.route('**/api/v1/integrations/google/conflicts/*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"resolved":true}' }),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByText('Naaseh title')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Google title')).toBeVisible();
  await page.getByLabel('Edit value').fill('Combined title');
  await expect(page.getByRole('button', { name: 'Use edited value' })).toBeEnabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('button', { name: 'Use edited value' }).click();
  await expect(page.getByText('Naaseh title')).toBeVisible();
});
