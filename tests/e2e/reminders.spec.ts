import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('shows overdue fallback offline and explains unavailable push configuration', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Offline reminder task');
  await form.getByLabel('Due date and time').fill('2020-01-01T09:00');
  await form.getByRole('button', { name: 'Add task' }).click();
  await context.setOffline(true);
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enable reminders' }).click();
  await expect(
    page.getByText('Push reminders are not configured for this deployment.'),
  ).toBeVisible();
});
