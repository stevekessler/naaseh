import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('creates a detailed list item offline without money and keeps directory CRUD separate', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  await page.getByLabel('List name').fill('Errands');
  await page.getByLabel('List name').press('Enter');

  const list = page.locator('.named-list').filter({ hasText: 'Errands' });
  await expect(list.getByText('Global item directory')).toHaveCount(0);
  await context.setOffline(true);
  await list.getByLabel('Add an item').fill('Return bottles');
  await list.getByText('Optional details').click();
  await expect(list.getByLabel('Amount')).toHaveCount(0);
  await list.getByRole('button', { name: 'Add item' }).click();
  await expect(list.getByText('Return bottles', { exact: true })).toBeVisible();
  await expect(list.getByLabel('List total')).toHaveCount(0);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Global Items', exact: true }).click();
  await expect(page).toHaveURL(/\/directory(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Global directory' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add global item' })).toBeVisible();
});
