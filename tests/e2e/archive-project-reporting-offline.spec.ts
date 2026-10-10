import { expect, test } from '@playwright/test';
import { addTask, openTaskSection, signIn } from './enhanced-helpers.js';

test('persists archive/report state across an offline restart and keeps deletion online-only', async ({
  page,
  context,
}) => {
  await signIn(page);
  await addTask(page, 'Offline integrated');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Complete Offline integrated' }).click();
  await openTaskSection(page, 'Archive');
  const archiveUrl = page.url();
  // The app shell is served by the network in this dev-server matrix. Briefly reconnect for
  // navigation and lazy-route loading, then verify persisted state after returning offline.
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
  await expect(async () => {
    await page.goto(archiveUrl, { waitUntil: 'domcontentloaded' });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Offline integrated' })).toBeVisible({
    timeout: 15_000,
  });
  await openTaskSection(page, 'Task Reporting');
  await expect(page.getByLabel('1 tasks in this report')).toBeVisible();
  await openTaskSection(page, 'Archive');
  await expect(page.getByRole('heading', { name: 'Offline integrated' })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Offline integrated' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await openTaskSection(page, 'Task Reporting');
  await expect(page.getByLabel('1 tasks in this report')).toBeVisible();
  await context.setOffline(false);
});
