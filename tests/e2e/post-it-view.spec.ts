import { expect, test, type Page } from '@playwright/test';

async function signInAndAddTask(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Cedar post-it');
  await form.getByLabel('Memo').fill('Responsive note content');
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Cedar post-it' })).toBeVisible();
}

test('preserves filtered state and preference across responsive list and post-it views', async ({
  page,
}) => {
  await signInAndAddTask(page);
  const filters = page.getByRole('region', { name: 'Search and filters' });
  await filters.getByLabel('Search').fill('cedar');

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
  await page.getByRole('button', { name: 'Post-its' }).click();
  const note = page.locator('.postit', { hasText: 'Cedar post-it' });
  await note.getByRole('button', { name: 'Complete Cedar post-it' }).click();
  await expect(note).toBeHidden();
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cedar post-it' })).toBeVisible();
});
