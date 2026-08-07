import { expect, test } from '@playwright/test';
import { addTask, createListWithItem, signIn } from './enhanced-helpers.js';

test.use({ reducedMotion: 'reduce' });
test('@enhanced-lists pointer and keyboard completion survives blocked audio with shared announcements', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked'));
  });
  await signIn(page);
  await addTask(page, 'Keyboard task');
  await page.getByRole('button', { name: 'Complete Keyboard task' }).focus();
  await Promise.all([
    expect(page.getByText('Keyboard task completed.')).toBeAttached(),
    page.keyboard.press('Enter'),
  ]);
  const list = await createListWithItem(page, 'Done today', 'Pointer item');
  await list.getByRole('button', { name: 'Complete Pointer item' }).click();
  await expect(list.getByText('Pointer item completed.')).toBeAttached();
  await page.getByLabel('Completion sounds').uncheck();
  await list.getByRole('button', { name: 'Reopen Pointer item' }).click();
  await expect(list.getByText('Pointer item reopened.')).toBeAttached();
});
