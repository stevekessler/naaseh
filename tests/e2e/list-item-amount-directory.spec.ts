import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('creates a list item with an initial signed amount offline and keeps directory CRUD separate', async ({
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
  await list.getByLabel('Amount').fill('6.25');
  await list.getByLabel('Credit').check();
  await list.getByRole('button', { name: 'Add item' }).click();
  await expect(list.getByText('Return bottles', { exact: true })).toBeVisible();
  await expect(list.getByLabel('List total')).toContainText('$6.25');

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Global Items' }).click();
  await expect(page).toHaveURL(/\/directory(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Global directory' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add global item' })).toBeVisible();
});
