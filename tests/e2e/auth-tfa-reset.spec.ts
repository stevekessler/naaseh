import { expect, test } from '@playwright/test';

test('TFA challenge and PIN reset remain generic and usable', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ next: 'tfa_challenge', expiresAt: '2026-08-14T18:05:00.000Z' }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /two-factor/i })).toBeVisible();
  await expect(page.getByLabel(/authentication code/i)).toBeVisible();
});
