import { expect, test, type Page } from '@playwright/test';
import { expandTaskDetails, signIn } from './enhanced-helpers.js';

async function signInAndAddTask(page: Page) {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Cedar post-it');
  await expandTaskDetails(form);
  await form.getByRole('textbox', { name: 'Memo', exact: true }).fill('Responsive note content');
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Cedar post-it' })).toBeVisible();
}

test('preserves filtered state and preference across responsive list and post-it views', async ({
  page,
}) => {
  await signInAndAddTask(page);
  await page.getByRole('button', { name: 'Filtered tasks', exact: true }).click();
  const filters = page.getByRole('region', { name: 'Search and filters' });
  await filters.getByLabel('Search').fill('cedar');
  await filters.getByLabel('Assignee').selectOption({ label: 'Steve' });
  await expect(filters.locator('.filter-chips')).toContainText('Assignee: Steve');

  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole('button', { name: 'Post-its' }).click();
  const note = page.locator('.postit', { hasText: 'Cedar post-it' });
  await expect(note).toBeVisible();
  await expect(filters.getByLabel('Search')).toHaveValue('cedar');

  await page.setViewportSize({ width: 600, height: 900 });
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeInViewport();
  await note.getByRole('button', { name: 'Complete Cedar post-it' }).click();
  await expect(note).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Post-its' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.postit', { hasText: 'Cedar post-it' })).toBeHidden();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cedar post-it' })).toBeVisible();
});

test('uses a non-motion completion treatment when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInAndAddTask(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Post-its' }).click();
  const note = page.locator('.postit', { hasText: 'Cedar post-it' });
  await note.getByRole('button', { name: 'Complete Cedar post-it' }).click();
  await expect(note).toBeHidden();
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cedar post-it' })).toBeVisible({
    timeout: 15_000,
  });
});

test('opens note details from its title and shows the due date below it', async ({ page }) => {
  await signInAndAddTask(page);
  await page.getByRole('button', { name: 'Cedar post-it', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await dialog.getByLabel('Due').selectOption('date');
  await dialog.getByLabel('Due date', { exact: true }).fill('2026-12-31');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Post-its' }).click();
  const note = page.locator('.postit', { hasText: 'Cedar post-it' });
  const title = note.getByRole('button', { name: 'Cedar post-it', exact: true });
  const due = note.locator('.postit-due');
  await expect(due).toHaveText('2026-12-31');
  await expect(note.locator('.user-full-name')).toHaveText('Steve');
  expect((await title.boundingBox())!.y).toBeLessThan((await due.boundingBox())!.y);
  await title.click();
  await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
});
