import { expect, test } from '@playwright/test';
import { createListWithItem, signIn } from './enhanced-helpers.js';

test('@enhanced-lists global values can be signed, overridden, reset, and totaled', async ({
  page,
}) => {
  await signIn(page);
  const list = await createListWithItem(page, 'Shopping', 'Bread');
  await page.getByLabel('Item name').fill('Refund');
  await page.getByLabel('Cost or credit').fill('+5.00');
  await page.getByRole('button', { name: 'Add global item' }).click();
  await expect(page.getByText('Refund $5.00')).toBeVisible();
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(list.getByLabel('List total')).toContainText('$5.00');
  const refund = list.locator('.list-item').filter({ hasText: 'Refund' });
  await refund.getByRole('button', { name: 'Edit', exact: true }).click();
  await refund.getByRole('textbox', { name: 'Amount' }).fill('2');
  await refund.getByLabel('Positive credit').uncheck();
  await refund.getByRole('button', { name: 'Save amount' }).click();
  await refund.getByRole('button', { name: 'Save item' }).click();
  await expect(list.getByLabel('List total')).toContainText('-$2.00');
  await refund.getByRole('button', { name: 'Edit', exact: true }).click();
  await refund.getByLabel('Reset name and amount to global values').click();
  await expect(list.getByLabel('List total')).toContainText('$5.00');
});
