import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

async function emptyFinanceRoutes(page: Page) {
  await page.route('**/api/v1/finance/**', (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/review-issues')
      ? { items: [], cursor: null }
      : { items: [], cursor: null };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
}

test('Finance v1 exposes no export action, request, route, or download', async ({ page }) => {
  const financeRequests: string[] = [];
  const downloads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/v1/finance')) financeRequests.push(path);
  });
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await emptyFinanceRoutes(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Finance' }).click();

  for (const section of ['Accounts', 'Transactions', 'Categories', 'Merchants', 'Budgets']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /export|download/iu })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /export|download/iu })).toHaveCount(0);
  }

  expect(financeRequests.some((path) => /(?:export|download)/iu.test(path))).toBe(false);
  expect(downloads).toEqual([]);
  await page.goto('/finance/export');
  await expect(page.getByRole('heading', { name: 'Finance', exact: true })).toHaveCount(0);
});
