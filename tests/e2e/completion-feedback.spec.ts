import { expect, test } from '@playwright/test';
import { addTask, createListWithItem, openNamedList, signIn } from './enhanced-helpers.js';

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
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.locator('summary').filter({ hasText: 'Reminders and sounds' }).click();
  await page.getByLabel('Completion sounds').uncheck();
  const reopenedList = await openNamedList(page, 'Done today');
  await reopenedList.getByRole('button', { name: 'Reopen Pointer item' }).click();
  await expect(reopenedList.getByText('Pointer item reopened.')).toBeAttached();
});
