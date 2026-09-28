import { expect, test } from '@playwright/test';
import { addTask, createListWithItem, openTaskSection, signIn } from './enhanced-helpers.js';

test('completed work moves to the archive and can be restored after an offline restart', async ({
  page,
  context,
}) => {
  await signIn(page);
  await addTask(page, 'Archive journey');
  await page.getByRole('button', { name: 'Complete Archive journey' }).click();
  await expect(page.getByRole('heading', { name: 'Archive journey' })).toBeHidden();
  await openTaskSection(page, 'Archive');
  await expect(page.getByRole('heading', { name: 'Archive journey' })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => location.reload());
  await expect(page.getByRole('heading', { name: 'Archive journey' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('heading', { name: 'Archive journey' })).toBeHidden();
});

test('finishing a list archives the parent and retains nested items', async ({ page }) => {
  await signIn(page);
  const list = await createListWithItem(page, 'Archived list', 'Retained item');
  await list.getByRole('button', { name: 'Finish and archive list' }).click();
  await openTaskSection(page, 'Archive');
  await expect(page.getByRole('heading', { name: 'Archived list' })).toBeVisible();
  await expect(page.getByText('Retained item', { exact: true })).toBeVisible();
});
