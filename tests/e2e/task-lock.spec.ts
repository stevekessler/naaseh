import { expect, test } from '@playwright/test';
import { addTask, signIn } from './enhanced-helpers.js';

test('@enhanced-lists task lock icon updates privacy and removes the item from another local search view', async ({
  page,
}) => {
  await signIn(page);
  await addTask(page, 'Private errand');
  await page.getByRole('button', { name: 'Private errand', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await dialog.getByLabel('Private task').check();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTitle('Private')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
