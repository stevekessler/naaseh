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
  await expect(
    page.getByRole('checkbox', { name: 'Remember this browser for 30 days' }),
  ).toBeChecked();
});

test('offers a 30-day browser choice only after the TFA code is verified', async ({ page }) => {
  let challengeBody: unknown;
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ next: 'tfa_challenge', expiresAt: '2026-09-20T18:05:00.000Z' }),
    }),
  );
  await page.route('**/api/v1/auth/tfa/challenge', (route) => {
    challengeBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'admin', displayName: 'Admin', role: 'admin' },
        csrfToken: 'test-csrf',
      }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Authentication code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
  expect(challengeBody).toMatchObject({ method: 'totp', code: '123456', rememberDevice: true });
});
