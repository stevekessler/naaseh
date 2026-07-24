import { expect, test } from '@playwright/test';
import { openLists, signIn } from './enhanced-helpers.js';

test('@enhanced-lists offline creation survives restart and reports pending work without silent loss', async ({
  page,
  context,
}) => {
  await signIn(page);
  await openLists(page);
  await context.setOffline(true);
  await page.getByLabel('List name').fill('Offline supplies');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('heading', { name: 'Offline supplies' })).toBeVisible();
  await expect(page.getByText(/pending/i).first()).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await openLists(page);
  await expect(page.getByRole('heading', { name: 'Offline supplies' })).toBeVisible();
});
