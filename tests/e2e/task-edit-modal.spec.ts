import { expect, test } from '@playwright/test';
import { addTask, expandTaskDetails, signIn } from './enhanced-helpers.js';

test('task editing opens in a modal and restores context', async ({ page }) => {
  await signIn(page);
  await addTask(page, 'Modal task');
  const heading = page.getByRole('heading', { name: 'Modal task' });
  const trigger = page.getByRole('button', { name: 'Modal task', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Task label')).toHaveValue('Modal task');
  await dialog.getByLabel('Task label').fill('Changed but cancelled');
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(heading).toBeVisible();
});

test('edits rich memo and five-minute due time atomically', async ({ page }) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Timed task');
  await expandTaskDetails(form);
  await form.getByLabel('Due').selectOption('timed');
  await form.getByLabel('Due date', { exact: true }).fill('2026-08-15');
  await form.getByRole('combobox', { name: 'Due time', exact: true }).selectOption('10:05');
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Timed task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog.getByRole('combobox', { name: 'Due time', exact: true })).toHaveValue(
    '10:05',
  );
  await dialog.getByRole('textbox', { name: 'Memo', exact: true }).fill('Important memo');
  await dialog.getByRole('button', { name: 'Bold' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
});
