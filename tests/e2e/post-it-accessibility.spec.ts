import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('supports keyboard operation, visible focus, announcements, and WCAG checks', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Accessible note');
  await form.getByRole('button', { name: 'Add task' }).click();

  const postIts = page.getByRole('button', { name: 'Post-its' });
  await postIts.focus();
  await expect(postIts).toBeFocused();
  await page.keyboard.press('Enter');
  const complete = page.getByRole('button', { name: 'Complete Accessible note' });
  await complete.focus();
  await expect(complete).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('.postit', { hasText: 'Accessible note' })).toBeHidden();

  for (const [name, control] of [
    ['Tasks', page.getByRole('button', { name: 'Tasks' })],
    ['Post-its', page.getByRole('button', { name: 'Post-its' })],
    ['Archive', page.getByRole('button', { name: 'Archive', exact: true })],
  ]) {
    const box = await control.boundingBox();
    expect(box?.height, `${name} touch height`).toBeGreaterThanOrEqual(44);
    expect(box?.width, `${name} touch width`).toBeGreaterThanOrEqual(44);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.postit')).toHaveCount(0);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
