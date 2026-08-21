import { expect, test } from '@playwright/test';
import { expandTaskDetails } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('shows overdue fallback offline and hides unavailable push configuration', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Offline reminder task');
  await expandTaskDetails(form);
  await form.getByLabel('Due').selectOption('timed');
  await form.locator('input[type="date"]').fill('2020-01-01');
  await form.getByLabel('Due time').selectOption('09:00');
  await form.getByRole('button', { name: 'Add task' }).click();
  await context.setOffline(true);
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable reminders' })).toHaveCount(0);
});
