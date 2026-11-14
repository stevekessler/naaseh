import { expect, test } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const accountId = '01J00000000000000000000161';

test('uses the dedicated New Account route with retained validation and readable detail', async ({
  page,
}, testInfo) => {
  let accounts: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/finance/accounts', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
        json: { items: accounts, cursor: null },
      });
    const input = route.request().postDataJSON() as Record<string, unknown>;
    const account = {
      ...input,
      id: accountId,
      friendlyName: `${input.organizationName} - ${input.sourceName}`,
      currencyExponent: 2,
      currentBalanceMinor: input.openingBalanceMinor,
      status: 'active',
      version: 1,
      freshness: { lastUpdatedAt: '2026-11-13T12:00:00.000Z', stale: false },
    };
    accounts = [account];
    return route.fulfill({ status: 201, json: account });
  });
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);

  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' });
  expect(
    await mainNavigation
      .locator(':scope > button, :scope > div > button.navigation-primary')
      .allTextContents(),
  ).toEqual(['Tasks', 'Lists', 'Finance', 'Journal', 'Search']);
  await expect(page.getByRole('button', { name: /Signed in as/u })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  const disclosure = page.getByRole('button', { name: 'Show Finance menu' });
  await disclosure.focus();
  await disclosure.press('Enter');
  await expect(page.getByRole('button', { name: /Signed in as/u })).toBeVisible();
  const newAccount = page.getByRole('button', { name: 'New Account' });
  if (testInfo.project.name === 'iphone' || testInfo.project.name === 'ipad') await newAccount.tap();
  else {
    await newAccount.focus();
    await newAccount.press('Enter');
  }
  await expect(page).toHaveURL(/\/finance\/accounts\/new$/u);
  await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible();

  await page.getByLabel('Organization name').fill('Fixture Bank');
  await page.getByLabel('Opening balance').fill('1,000');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByText('Enter an account name.')).toBeVisible();
  await expect(page.getByText(/at most 2 decimal places/u)).toBeVisible();
  await expect(page.getByLabel('Organization name')).toHaveValue('Fixture Bank');
  await expect(page.getByLabel('Opening balance')).toHaveValue('1,000');

  await page.getByLabel('Account name').fill('Checking');
  await page.getByLabel('Opening balance').fill('1250.00');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page).toHaveURL(new RegExp(`/finance/accounts/${accountId}$`, 'u'));
  await expect(
    page.getByRole('heading', { level: 2, name: 'Fixture Bank - Checking' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Account summary' })).toContainText(
    'Organization',
  );
  await expect(page.getByRole('region', { name: 'Balance and freshness' })).toContainText(
    '$1,250.00',
  );
  await expect(page.getByRole('region', { name: 'Account settings' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Account transactions and imports' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Destructive account actions' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth })),
  ).toEqual({ page: 375, viewport: 375 });

  await page.goBack();
  await expect(page).toHaveURL(/\/finance\/accounts\/new$/u);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/finance/accounts/${accountId}$`, 'u'));
});
