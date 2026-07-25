import { expect, test } from '@playwright/test';
import { addTask, signIn } from './enhanced-helpers.js';

test('persists archive/report state across an offline restart and keeps deletion online-only', async ({
  page,
  context,
}) => {
  await signIn(page);
  await addTask(page, 'Offline integrated');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Complete Offline integrated' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.evaluate(() => location.reload());
  await expect(page.getByRole('heading', { name: 'Offline integrated' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByLabel('1 completed to-dos')).toBeVisible();
  await context.setOffline(false);
});
