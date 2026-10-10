import { expect, test } from '@playwright/test';
import { addTask, expandTaskDetails, setTaskDueDate, signIn } from './enhanced-helpers.js';

test('task editing opens in a modal and restores context', async ({ page }) => {
  await signIn(page);
  await addTask(page, 'Modal task');
  const heading = page.getByRole('heading', { name: 'Modal task' });
  const trigger = page.getByRole('button', { name: 'Modal task', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Task label')).toHaveValue('Modal task');
  const actions = dialog.locator('.task-detail-actions');
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    const complete = await actions
      .getByRole('button', { name: 'Complete and archive' })
      .boundingBox();
    const archive = await actions
      .getByRole('button', { name: 'Archive without completing' })
      .boundingBox();
    expect(complete).not.toBeNull();
    expect(archive).not.toBeNull();
    expect(archive!.y - (complete!.y + complete!.height)).toBeGreaterThanOrEqual(8);
  }
  await dialog.getByLabel('Task label').fill('Changed but cancelled');
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(heading).toBeVisible();
});

test('adds a five-minute due time while editing and saves it with a rich memo', async ({
  page,
}) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Timed task');
  await expandTaskDetails(form);
  await setTaskDueDate(form, '2026-08-15');
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Timed task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await setTaskDueDate(dialog, '2026-08-15', '10:05');
  const dueDate = dialog.getByRole('button', { name: /Change due date/ });
  const dueParts = dueDate.locator('.due-date-value > span');
  await expect(dueParts).toHaveText(['8/15/2026', '10:05 AM']);
  const dateBox = await dueParts.nth(0).boundingBox();
  const timeBox = await dueParts.nth(1).boundingBox();
  expect(timeBox!.y).toBeGreaterThan(dateBox!.y);
  const clear = dialog.getByRole('button', { name: 'Clear' });
  expect(await clear.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('textbox', { name: 'Memo', exact: true }).fill('Important memo');
  await dialog.getByRole('button', { name: 'Bold' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Timed task', exact: true }).click();
  const reopened = page.getByRole('dialog', { name: 'Edit task' });
  await expect(reopened.getByRole('button', { name: /Change due date/ })).toContainText('10:05 AM');
});

test('shows strikethrough formatting while editing a memo', async ({ page }) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Strikethrough task');
  await expandTaskDetails(form);

  const memo = form.getByRole('textbox', { name: 'Memo', exact: true });
  await memo.fill('This is a test');
  await memo.selectText();
  await form.getByRole('button', { name: 'Strikethrough' }).click();

  const formattedText = memo.locator('.memo-format-strikethrough');
  await expect(formattedText).toHaveText('This is a test');
  await expect(formattedText).toHaveCSS('text-decoration-line', 'line-through');
});
