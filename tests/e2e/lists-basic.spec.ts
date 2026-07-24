import { expect, test } from '@playwright/test';

test('@enhanced-lists creates, completes, and retains a lightweight list item offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  await page.getByLabel('List name').fill('Groceries');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
  await page.getByLabel('Add an item').fill('Milk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('button', { name: 'Complete Milk' }).click();
  await expect(page.getByText('Milk completed.')).toBeAttached();
  await context.setOffline(true);
  await expect(page.getByText('Milk', { exact: true })).toBeVisible();
  await expect(page.getByLabel('List total')).toContainText('$0.00');
});
