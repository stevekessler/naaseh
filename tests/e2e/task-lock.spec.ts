import { expect, test } from '@playwright/test';
import { addTask, signIn } from './enhanced-helpers.js';

test('@enhanced-lists task lock icon updates privacy and removes the item from another local search view', async ({
  page,
}) => {
  await signIn(page);
  await addTask(page, 'Private errand');
  await page.getByRole('button', { name: 'Private errand', exact: true }).click();
  await page.getByLabel('Lock to-do item').click();
  await expect(page.getByLabel('Unlock to-do item')).toBeVisible();
  await expect(page.getByText('Only you can see this to-do item.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
