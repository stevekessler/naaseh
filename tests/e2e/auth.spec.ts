import { expect, test } from '@playwright/test';

// Authentication responses are mocked in this file; installed workers must not
// bypass Playwright's route boundary on WebKit.
test.use({ serviceWorkers: 'block' });

test('responsive sign-in contains only the branded credential controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Na'aseh/ })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('.login-card')).toHaveCSS('width', /\d+px/);
});

test('wrong and unknown credentials receive the same generic failure', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        code: 'authentication_failed',
        detail: 'Unable to sign in with those credentials.',
      }),
    }),
  );
  await page.goto('/');
  for (const username of ['known-user', 'unknown-user']) {
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Unable to sign in. Check your credentials and try again.',
    );
  }
});
