import { expect, test } from '@playwright/test';
import { addTask, openTaskSection, signIn } from './enhanced-helpers.js';

test('connects completion archive, workload, reporting, and organization lifecycle', async ({
  page,
}) => {
  await signIn(page);
  await addTask(page, 'Integrated completion');
  await page.getByRole('button', { name: 'Complete Integrated completion' }).click();
  await expect(page.getByRole('heading', { name: 'Integrated completion' })).toBeHidden();
  await openTaskSection(page, 'Archive');
  await expect(page.getByRole('heading', { name: 'Integrated completion' })).toBeVisible();
  await openTaskSection(page, 'Completed Tasks');
  await expect(page.getByLabel('1 completed to-dos')).toBeVisible();
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});
