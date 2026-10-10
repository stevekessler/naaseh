import { expect, test } from '@playwright/test';
import { createListWithItem, signIn } from './enhanced-helpers.js';

test('@enhanced-lists global names can be added, overridden, and reset without money fields', async ({
  page,
}) => {
  await signIn(page);
  const list = await createListWithItem(page, 'Shopping', 'Bread');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Global Items', exact: true }).click();
  await page.getByLabel('Item name').fill('Refund');
  await page.getByRole('button', { name: 'Add global item' }).click();
  await expect(page.getByText('Refund', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cost or credit')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to list' }).press('Enter');
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  const refund = list.locator('.list-item').filter({ hasText: 'Refund' });
  await refund.getByRole('button', { name: 'Edit', exact: true }).click();
  await list.getByLabel('Item name').fill('Refund receipt');
  await list.getByRole('button', { name: 'Save item' }).click();
  await expect(refund.getByText('Refund receipt', { exact: true })).toBeVisible();
  await refund.getByRole('button', { name: 'Edit', exact: true }).click();
  await list.getByRole('button', { name: 'Reset to global item name' }).click();
  await expect(refund.getByText('Refund', { exact: true })).toBeVisible();
  await expect(list.getByLabel('List total')).toHaveCount(0);
});
