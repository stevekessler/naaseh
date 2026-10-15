import { expect, test } from '@playwright/test';
import { createListWithItem, openNamedList, signIn } from './enhanced-helpers.js';

test('@enhanced-lists global names can be added, overridden, and reset without money fields', async ({
  page,
}) => {
  await signIn(page);
  await createListWithItem(page, 'Shopping', 'Bread');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Global Items', exact: true }).click();
  await page.getByLabel('Item name').fill('Refund');
  await page.getByRole('button', { name: 'Add global item' }).click();
  await expect(page.getByText('Refund', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cost or credit')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to list' }).press('Enter');
  const reopenedList = await openNamedList(page, 'Shopping');
  const refund = reopenedList.locator('.list-item').filter({ hasText: 'Refund' });
  await refund.getByRole('button', { name: 'Edit', exact: true }).click();
  await reopenedList.getByLabel('Item name').fill('Refund receipt');
  await reopenedList.getByRole('button', { name: 'Save item' }).click();
  await expect(refund.getByText('Refund receipt', { exact: true })).toBeVisible();
  await refund.getByRole('button', { name: 'Edit', exact: true }).click();
  await reopenedList.getByRole('button', { name: 'Reset to global item name' }).click();
  await expect(refund.getByText('Refund', { exact: true })).toBeVisible();
  await expect(reopenedList.getByLabel('List total')).toHaveCount(0);
});
