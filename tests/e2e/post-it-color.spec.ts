import { expect, test } from '@playwright/test';
import { addTask, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('chooses and persists a labeled post-it color through the shared edit modal', async ({
  page,
}) => {
  await signIn(page);
  await addTask(page, 'Color card');
  await page.getByRole('button', { name: 'Post-its' }).click();
  const note = page.locator('.postit', { hasText: 'Color card' });
  await note.getByRole('button', { name: 'Edit Color card' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  const purple = dialog.getByLabel('Purple');
  await purple.focus();
  await purple.press('Space');
  await expect(purple).toBeChecked();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(note).toHaveAttribute('data-post-it-color', 'purple');
  await expect(note).toHaveCSS('background-color', 'rgb(221, 209, 245)');
});
