import { expect, test } from '@playwright/test';
import {
  signIn,
  mockUnprotectedFinanceSecurity,
  mockFinanceSnapshotEvidence,
  financeSnapshotFixtureHeaders,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const accountId = '01J00000000000000000000001';

test('creates a named manual account and records a later balance', async ({ page }) => {
  let accounts: Array<Record<string, unknown>> = [];
  let balanceRequests = 0;
  await page.route('**/api/v1/finance/accounts', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        status: 200,
        headers: financeSnapshotFixtureHeaders,
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
    balanceRequests++;
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
  await page.route(`**/api/v1/finance/accounts/${accountId}`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      expectedVersion: 2,
      friendlyName: 'Household checking',
    });
    accounts[0] = { ...accounts[0], friendlyName: 'Household checking', version: 3 };
    return route.fulfill({
      json: { ...accounts[0], id: 'unexpected', friendlyName: 'Unverified account name' },
    });
  });
  await page.route(`**/api/v1/finance/records/account/${accountId}/deletion-preview`, (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      json: {
        outcome: 'archive',
        dependentCounts: { transactions: 2 },
        preservedRecordTypes: ['balance-snapshot'],
      },
    }),
  );
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  const evidence = await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Show Finance menu' }).click();
  await page.getByRole('button', { name: 'New Account' }).click();
  await page.getByLabel('Organization name').fill('Fixture Bank');
  await page.getByLabel('Account name').fill('Checking');
  await page.getByLabel('Opening balance').fill('1250.00');
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Fixture Bank - Checking' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Balance and freshness' }).getByText('$1,250.00'),
  ).toBeVisible();
  await page.getByLabel('New balance').fill('1300.25');
  await page.getByRole('button', { name: 'Record balance' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Balance recorded.' })).toBeVisible();
  await page.getByLabel('Friendly name').fill('Household checking');
  await page.getByRole('button', { name: 'Save account name' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Household checking' })).toBeVisible();
  await expect(page.getByText('Unverified account name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview account removal' }).click();
  await expect(page.getByRole('region', { name: 'Account removal impact' })).toContainText(
    '2 visible dependent records',
  );
  let releaseVerification!: () => void;
  const heldVerification = new Promise<void>((resolve) => {
    releaseVerification = resolve;
  });
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as { financeCacheOnly?: boolean } | null;
    if (body?.financeCacheOnly) await heldVerification;
    await route.fallback();
  });
  try {
    await page.getByLabel('New balance').fill('1400.00');
    await page.getByRole('button', { name: 'Record balance' }).click();
  } finally {
    evidence.revoke();
    releaseVerification();
  }
  await expect(page.getByRole('button', { name: 'Refresh Finance security' })).toBeVisible();
  expect(balanceRequests).toBe(1);
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
  await page.route(`**/api/v1/finance/accounts/${accountId}/csv-duplicates`, async (route) => {
    const { rows } = route.request().postDataJSON() as { rows: Array<{ ordinal: number }> };
    expect(rows).toHaveLength(1);
    expect([1, 3]).toContain(rows[0]!.ordinal);
    await route.fulfill({ json: { ordinals: rows[0]!.ordinal === 1 ? [1] : [] } });
  });
  let submittedRequest: unknown;
  await page.route(`**/api/v1/finance/accounts/${accountId}/csv-imports`, async (route) => {
    const request = route.request().postDataJSON() as {
      batchId: string;
      fileDigest: string;
      duplicateDecisionDigest: string;
      rows: unknown[];
    };
    expect(request.rows).toMatchObject([
      { ordinal: 1, description: 'Coffee', duplicateDisposition: 'included-after-review' },
      { ordinal: 3, description: 'Groceries', duplicateDisposition: 'not-suspected' },
    ]);
    if (submittedRequest === undefined) {
      submittedRequest = request;
      await route.fulfill({ status: 503, json: { message: 'Synthetic interrupted response' } });
      return;
    }
    expect(request).toEqual(submittedRequest);
    await route.fulfill({
      status: 201,
      json: {
        id: request.batchId,
        accountId,
        fileDigest: request.fileDigest,
        duplicateDecisionDigest: request.duplicateDecisionDigest,
        status: 'succeeded',
        counts: { committed: 2, failed: 0 },
      },
    });
  });
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ items: [account], cursor: null }),
    }),
  );
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Finance', exact: true }).click();
  await page.getByRole('button', { name: 'Open account' }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'fixture.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Date,Description,Amount\n2026-01-02,Coffee,-4.25\n2026-01-03,Lunch,-5.00\n2026-01-04,Groceries,-12.00',
    ),
  });
  await expect(page.getByText('Ready to review 3 rows.')).toBeVisible();
  await page.getByLabel('Date column').selectOption('Date');
  await page.getByLabel('Description column').selectOption('Description');
  await page.getByLabel('Amount column').selectOption('Amount');
  await page.getByRole('button', { name: 'Include' }).press('Enter');
  await expect(page.getByText(/Possible duplicate 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Exclude' }).press('Enter');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Commit reviewed import' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'queued securely' })).toBeVisible();
  await context.setOffline(false);
  await page.goto('/finance');
  await page.getByRole('button', { name: 'Open account' }).click();
  await page.getByRole('button', { name: 'Check saved CSV imports' }).click();
  const saved = page.getByRole('region', { name: 'Saved CSV imports' });
  await expect(saved.getByText('Destination account: Fixture Bank - Checking')).toBeVisible();
  const batch = saved.getByRole('listitem').filter({ hasText: '2 saved rows' });
  await expect(batch).toBeVisible();
  await batch.getByRole('button', { name: 'Preview saved rows' }).click();
  const rows = saved.getByRole('region', { name: 'Saved CSV rows' });
  await expect(rows.getByText(/Coffee/)).toBeVisible();
  await expect(rows.getByText(/Lunch/)).toHaveCount(0);
  await rows.getByLabel('Saved rows per page').selectOption('1');
  await expect(rows.getByText('Rows 1–1 of 2.')).toBeVisible();
  await rows.getByRole('button', { name: 'Check displayed rows for duplicates' }).click();
  await expect(rows.getByText(/Coffee.*Possible duplicate/)).toBeVisible();
  await rows.getByRole('button', { name: 'Include saved row 1' }).click();
  await expect(rows.getByText('Choice recorded: Include', { exact: false })).toBeVisible();
  await expect(rows.getByRole('button', { name: 'Import reviewed saved rows' })).toBeDisabled();
  await rows.getByLabel('Confirm destination: Fixture Bank - Checking').check();
  await rows.getByRole('button', { name: 'Import reviewed saved rows' }).click();
  await expect(saved.getByText(/Check every saved row/)).toBeVisible();
  await rows.getByRole('button', { name: 'Next saved rows' }).click();
  await expect(rows.getByText(/Groceries/)).toBeVisible();
  await expect(rows.getByText(/Coffee/)).toHaveCount(0);
  await rows.getByRole('button', { name: 'Check displayed rows for duplicates' }).click();
  await expect(rows.getByText('No possible duplicates for the displayed rows.')).toBeVisible();
  await rows.getByRole('button', { name: 'Previous saved rows' }).click();
  await expect(rows.getByText('Choice recorded: Include', { exact: false })).toBeVisible();
  await rows.getByRole('button', { name: 'Import reviewed saved rows' }).click();
  await expect(saved.getByText(/submission could not be confirmed/)).toBeVisible();
  await rows.getByRole('button', { name: 'Retry confirmed import' }).click();
  await expect(saved.getByText('Saved CSV rows imported.')).toBeVisible();
  await saved.getByRole('button', { name: 'Check saved CSV imports' }).click();
  await expect(saved.getByText('No saved CSV imports for this account.')).toBeVisible();
});

test('shows protected SimpleFIN status and remains touch-friendly on a narrow screen', async ({
  page,
}) => {
  let connection: Record<string, unknown> | undefined;
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], cursor: null }),
    }),
  );
  await page.route('**/api/v1/finance/connections/simplefin/claim', (route) => {
    connection = {
      id: 'connection-1',
      scope: { type: 'owner', ownerId: 'local-steve' },
      status: 'active',
      provider: 'simplefin-bridge',
      version: 1,
    };
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: connection.id, status: 'unverified-reply' }),
    });
  });
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await page.route('**/api/v1/finance/connections', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ items: connection ? [connection] : [], nextCursor: null }),
    }),
  );
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show Finance menu' }).click();
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.getByLabel('Setup token').fill('fixture-setup-token');
  await page.getByRole('button', { name: 'Connect SimpleFIN Bridge' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'cannot be redisplayed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh SimpleFIN Bridge' })).toBeVisible();
});
