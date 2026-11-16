import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockSuccessfulSync,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });
const desktopOnly = (testInfo: TestInfo) =>
  test.skip(
    !['chromium', 'webkit'].includes(testInfo.project.name),
    'T126 uses desktop Chromium and WebKit.',
  );

const accountId = '01J00000000000000000000091';
const accountName = 'Household checking';
const account = {
  id: accountId,
  scope: { type: 'owner', ownerId: 'local-steve' },
  friendlyName: accountName,
  organizationName: 'Fixture Bank',
  sourceName: 'Checking',
  accountType: 'checking',
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 12345,
  status: 'active',
  balanceAt: '2026-11-14T18:00:00Z',
  freshness: { stale: true, lastUpdatedAt: '2026-11-14T18:00:00Z' },
  version: 1,
};
const budget = {
  id: '01J00000000000000000000092',
  name: 'Household budget',
  groupId: '01J00000000000000000000095',
  status: 'active',
  activity: 'active',
  startDate: '2027-01-01',
  budgetDate: '2027-01-01',
  items: [],
  totals: [],
  totalsComplete: true,
  version: 1,
};
const category = {
  id: '01J00000000000000000000093',
  name: 'Food',
  origin: 'bank',
  status: 'active',
  version: 1,
};
const merchant = {
  id: '01J00000000000000000000094',
  name: 'Juniper Market',
  source: 'manual',
  status: 'active',
  version: 1,
};

async function openDashboard(page: Page, options: { accountFailure?: boolean } = {}) {
  let upcomingCount = 10;
  let settingsVersion = 0;
  const flags = new Map<
    string,
    {
      targetKind: string;
      targetId: string;
      included: boolean;
      version: number;
    }
  >();
  const expenses = Array.from({ length: 21 }, (_, index) => ({
    expense: {
      id: `01J${String(200 + index).padStart(23, '0')}`,
      description: index === 0 ? 'Overdue invoice' : `Upcoming invoice ${index}`,
      dueDate: `2027-01-${String(index + 1).padStart(2, '0')}`,
      currency: 'USD',
      currencyExponent: 2,
      expectedAmountMinor: 2500,
      version: 1,
    },
    remainingAmountMinor: 2500,
    state: index === 0 ? 'overdue' : 'upcoming',
  }));
  await page.route('**/api/v1/finance/accounts', (route) =>
    options.accountFailure
      ? route.fulfill({ status: 503, json: { code: 'test_unavailable' } })
      : route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [account] } }),
  );
  await page.route('**/api/v1/finance/upcoming-expenses', (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: expenses } }),
  );
  await page.route('**/api/v1/finance/dashboard-preferences', (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as {
        upcomingCount: number;
        expectedVersion: number;
      };
      expect(body.expectedVersion).toBe(settingsVersion);
      upcomingCount = body.upcomingCount;
      settingsVersion++;
      return route.fulfill({ json: { upcomingCount, version: settingsVersion } });
    }
    return route.fulfill({
      json: {
        settings: { upcomingCount, version: settingsVersion },
        flags: [...flags.values()],
      },
    });
  });
  await page.route('**/api/v1/finance/dashboard-preferences/*/*', (route) => {
    expect(route.request().method()).toBe('PUT');
    const [targetKind, targetId] = new URL(route.request().url()).pathname.split('/').slice(-2);
    const key = `${targetKind}/${targetId}`;
    const body = route.request().postDataJSON() as { included: boolean; expectedVersion: number };
    const previous = flags.get(key)?.version ?? 0;
    expect(body.expectedVersion).toBe(previous);
    const flag = {
      targetKind: targetKind!,
      targetId: targetId!,
      included: body.included,
      version: previous + 1,
    };
    flags.set(key, flag);
    return route.fulfill({ json: flag });
  });
  await page.route('**/api/v1/finance/budgets', (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [budget] } }),
  );
  await page.route(`**/api/v1/finance/budgets/${budget.id}`, (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: budget }),
  );
  await page.route('**/api/v1/finance/categories', (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [category] } }),
  );
  await page.route('**/api/v1/finance/merchants', (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [merchant] } }),
  );
  await page.route(`**/api/v1/finance/merchants/${merchant.id}`, (route) =>
    route.fulfill({
      headers: financeSnapshotFixtureHeaders,
      json: { merchant, transactions: [], totalsComplete: true },
    }),
  );
  await page.route('**/api/v1/users/directory', (route) =>
    route.fulfill({
      json: { items: [{ id: 'local-steve', displayName: 'Steve', username: 'steve' }] },
    }),
  );
  await page.route('**/api/v1/groups', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: budget.groupId,
            name: 'Household',
            ownerId: 'local-steve',
            status: 'active',
            joined: true,
            role: 'member',
            version: 1,
          },
        ],
      },
    }),
  );
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockSuccessfulSync(page);
  await mockFinanceSnapshotEvidence(page, { allowProoflessPull: true });
  await signIn(page);
  await page.goto('/finance');
}

test('persists the upcoming count and keeps overdue rows outside the limit', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await openDashboard(page);
  const upcoming = page.getByRole('region', { name: 'Upcoming expenses' });
  const count = upcoming.getByRole('combobox', { name: 'Number of upcoming expenses' });
  const rows = upcoming.getByRole('button', { name: /^Upcoming invoice / });
  await expect(count).toBeEnabled();
  await expect(rows).toHaveCount(10);
  await count.selectOption('5');
  await expect(upcoming.getByText('Dashboard preference saved.')).toBeVisible();
  await expect(rows).toHaveCount(5);
  await expect(
    upcoming.getByRole('region', { name: 'Overdue' }).getByText(/Overdue invoice/),
  ).toBeVisible();
  await page.reload();
  await expect(count).toHaveValue('5');
  await expect(rows).toHaveCount(5);
});

test('includes only the account the user selects and preserves balance freshness', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await openDashboard(page);
  await expect(
    page.getByText('Choose accounts to include from their Finance detail pages.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: accountName })).toHaveCount(0);
  await page.goto(`/finance/accounts/${accountId}`);
  const flag = page.getByRole('checkbox', {
    name: `Include on my Finance dashboard: ${accountName}`,
  });
  await expect(flag).toBeEnabled();
  await expect(flag).not.toBeChecked();
  await flag.click();
  await expect(page.getByText('Dashboard preference saved.')).toBeVisible();
  await expect(flag).toBeChecked();
  await page.goto('/finance');
  const balances = page.getByRole('region', { name: 'Dashboard accounts' });
  await expect(balances.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(balances.getByText('$123.45')).toBeVisible();
  await expect(balances.getByText('Refresh recommended')).toBeVisible();
});

test('keeps upcoming expenses usable when account balances are unavailable', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await openDashboard(page, { accountFailure: true });
  await expect(page.getByRole('region', { name: 'Dashboard accounts unavailable' })).toBeVisible();
  const upcoming = page.getByRole('region', { name: 'Upcoming expenses' });
  await expect(upcoming.getByRole('button', { name: /^Upcoming invoice / })).toHaveCount(10);
  await expect(upcoming.getByRole('region', { name: 'Overdue' })).toBeVisible();
});

test('saves personal preferences from the budget, category and merchant pages', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await openDashboard(page);
  const targets = [
    { path: `/finance/budgets/${budget.id}`, name: budget.name },
    { path: '/finance/categories', name: category.name },
    { path: `/finance/merchants/${merchant.id}`, name: merchant.name },
  ];
  for (const { path, name } of targets) {
    await page.goto(path);
    const flag = page.getByRole('checkbox', { name: `Include on my Finance dashboard: ${name}` });
    await expect(flag).toBeEnabled();
    await expect(flag).not.toBeChecked();
    await flag.click();
    await expect(page.getByText('Dashboard preference saved.')).toBeVisible();
    await expect(flag).toBeChecked();
  }
  for (const { path, name } of targets) {
    await page.goto(path);
    const flag = page.getByRole('checkbox', { name: `Include on my Finance dashboard: ${name}` });
    await expect(flag).toBeChecked();
  }
});
