import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('web accepts native list/report data without exposing retired integration controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByText(/Lists/i).first()).toBeVisible();
  await expect(page.getByText(/Reports/i).first()).toBeVisible();
  await expect(page.getByText(/Google Tasks synchronization/i)).toHaveCount(0);
});
