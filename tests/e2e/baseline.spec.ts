import { test, expect } from '@playwright/test';
test('minimal responsive sign-in and offline task journey', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Na'aseh/ })).toBeVisible();
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Task label').fill('Review the plan');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Review the plan', exact: true })).toHaveCount(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.online))
    .toBe('false');
  if (testInfo.project.name === 'chromium') {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Review the plan', exact: true })).toHaveCount(
      1,
    );
  } else {
    await expect(page.getByRole('heading', { name: 'Review the plan', exact: true })).toHaveCount(
      1,
    );
  }
  await context.setOffline(false);
});
