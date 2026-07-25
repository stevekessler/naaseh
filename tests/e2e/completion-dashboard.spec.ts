import { expect, test } from '@playwright/test';
import { addTask, signIn } from './enhanced-helpers.js';

test('shows personal completion totals with period and organization filters offline', async ({
  page,
  context,
}) => {
  await signIn(page);
  await addTask(page, 'Dashboard completion');
  await page.getByRole('button', { name: 'Complete Dashboard completion' }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Completion dashboard' })).toBeVisible();
  await expect(page.getByLabel('1 completed to-dos')).toBeVisible();
  await page.getByRole('combobox', { name: 'Period', exact: true }).selectOption('week');
  await expect(page.getByLabel('Week starts')).toBeVisible();
  await page.getByLabel('Category').selectOption('unassigned');
  await page.getByLabel('Project').selectOption('unassigned');
  await expect(page.getByText(/local change.*pending sync/i)).toBeVisible();
  await expect(page.locator('.completion-chart')).toBeVisible();
  await context.setOffline(false);
});
