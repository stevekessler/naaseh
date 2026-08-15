import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('discovers personal settings on Profile and renders a responsive administrator table', async ({
  page,
}) => {
  await page.route('**/api/v1/admin/users*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'admin',
            username: 'steve',
            displayName: 'Steve',
            role: 'admin',
            active: true,
            sessionEpoch: 1,
            version: 1,
            tfaStatus: 'enabled',
            groupSummary: ['team'],
          },
        ],
      }),
    }),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(page.getByText('Completion sounds')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google Tasks synchronization' })).toBeVisible();
  await expect(page.getByText(/password reset/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Admin' }).click();
  const table = page.getByRole('table', { name: 'System user accounts' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row', { name: /Steve.*enabled.*team/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});

test('keeps system administration unavailable to an ordinary user', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'user',
          username: 'alex',
          displayName: 'Alex',
          role: 'user',
          active: true,
          sessionEpoch: 0,
        },
        csrfToken: 'test-csrf',
      }),
    }),
  );
  await page.goto('/admin');
  await page.getByLabel('Username').fill('alex');
  await page.getByLabel('Password').fill('local-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
});
