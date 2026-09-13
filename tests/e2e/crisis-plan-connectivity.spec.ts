import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test('shared Crisis Plans deny offline access and disclose the online requirement', async ({
  context,
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Journal PIN', { exact: true }).fill('246810');
  await page.getByLabel('Confirm Journal PIN', { exact: true }).fill('246810');
  await page.getByRole('button', { name: 'Create Journal' }).click();
  await page.getByRole('button', { name: 'Crisis Plans' }).click();
  await page
    .getByRole('textbox', { name: 'Crisis Plan', exact: true })
    .fill('Owner-only offline plan.');
  await page.getByRole('button', { name: 'Save Crisis Plan' }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Shared with me' }).click();
  await expect(page.getByText('Shared Crisis Plans require an internet connection.')).toBeVisible();
  await expect(page.getByText('Owner-only offline plan.')).not.toBeVisible();
});
