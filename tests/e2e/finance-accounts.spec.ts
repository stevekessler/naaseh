import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

const accountId = '01J00000000000000000000001';

test('creates a named manual account and records a later balance', async ({ page }) => {
  let accounts: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/finance/accounts', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: accounts, cursor: null }),
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
    };
    accounts = [account];
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(account),
    });
  });
  await page.route(`**/api/v1/finance/accounts/${accountId}/balances`, async (route) => {
    const input = route.request().postDataJSON() as { balanceMinor: number; effectiveAt: string };
    accounts[0] = {
      ...accounts[0],
      currentBalanceMinor: input.balanceMinor,
      balanceAt: input.effectiveAt,
      version: 2,
    };
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ account: accounts[0], snapshot: {} }),
    });
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Finance' }).click();
  await page.getByLabel('Organization name').fill('Fixture Bank');
  await page.getByLabel('Account name').fill('Checking');
  await page.getByLabel('Opening balance').fill('1250.00');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Fixture Bank - Checking' }),
  ).toBeVisible();
  await expect(page.getByText('$1,250.00')).toBeVisible();
  await page.getByLabel('New balance').fill('1300.25');
  await page.getByRole('button', { name: 'Record balance' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Balance recorded.' })).toBeVisible();
});

test('walks each CSV duplicate and queues encrypted rows while offline', async ({
  page,
  context,
}) => {
  const account = {
    id: accountId,
    scope: { type: 'owner', ownerId: 'local-steve' },
    organizationName: 'Fixture Bank',
    sourceName: 'Checking',
    friendlyName: 'Fixture Bank - Checking',
    currency: 'USD',
    currencyExponent: 2,
    currentBalanceMinor: 0,
    balanceAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    version: 1,
    duplicateCandidates: [
      { ordinal: 1, date: '2026-01-02', amountMinor: -425, description: 'Coffee' },
      { ordinal: 2, date: '2026-01-03', amountMinor: -500, description: 'Lunch' },
    ],
  };
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [account], cursor: null }),
    }),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Finance' }).click();
  await page.getByRole('button', { name: 'Open account' }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'fixture.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Description,Amount\n2026-01-02,Coffee,-4.25\n2026-01-03,Lunch,-5.00'),
  });
  await expect(page.getByText('Ready to review 2 rows.')).toBeVisible();
  await page.getByLabel('Date column').selectOption('Date');
  await page.getByLabel('Description column').selectOption('Description');
  await page.getByLabel('Amount column').selectOption('Amount');
  await page.getByRole('button', { name: 'Include' }).press('Enter');
  await expect(page.getByText(/Possible duplicate 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Exclude' }).press('Enter');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Commit reviewed import' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'queued securely' })).toBeVisible();
});

test('shows protected SimpleFIN status and remains touch-friendly on a narrow screen', async ({
  page,
}) => {
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
  await page.route('**/api/v1/finance/connections/simplefin/claim', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'connection-1',
        status: 'active',
        provider: 'simplefin-bridge',
        version: 1,
      }),
    }),
  );
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Finance' }).click();
  await page.getByLabel('Setup token').fill('fixture-setup-token');
  await page.getByRole('button', { name: 'Connect SimpleFIN Bridge' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'cannot be redisplayed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh SimpleFIN Bridge' })).toBeVisible();
});
