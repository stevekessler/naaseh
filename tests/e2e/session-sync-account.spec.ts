import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('a saved admin view cannot sync under a different browser account', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'naaseh-session-view',
      JSON.stringify({
        userId: 'steve-id',
        displayName: 'Steve',
        role: 'admin',
        csrfToken: 'saved-csrf',
      }),
    );
  });
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'other-user', displayName: 'Other', role: 'user' },
        csrfToken: 'other-csrf',
      }),
    }),
  );
  let pushes = 0;
  await page.route('**/api/v1/sync/push', (route) => {
    pushes += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto('/admin/categories');

  await expect(page.getByRole('heading', { name: 'Securing your local data' })).toBeVisible();
  await expect(page.getByText(/signed in as another account/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categories and Projects' })).toHaveCount(0);
  expect(pushes).toBe(0);
});
