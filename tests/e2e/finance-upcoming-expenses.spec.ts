import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  setOffline,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block', timezoneId: 'America/Denver' });

const ids = {
  group: '01J00000000000000000000901',
  account: '01J00000000000000000000902',
  activeBudget: '01J00000000000000000000903',
  inactiveBudget: '01J00000000000000000000904',
  expense: '01J00000000000000000000905',
  overdue: '01J00000000000000000000906',
  transaction: '01J00000000000000000000907',
  fulfillment1: '01J00000000000000000000908',
  fulfillment2: '01J00000000000000000000909',
};

const desktopOnly = (testInfo: TestInfo) =>
  test.skip(['iphone', 'ipad'].includes(testInfo.project.name), 'T084 requires Chromium/WebKit.');

const group = {
  id: ids.group,
  name: 'Household',
  ownerId: 'local-steve',
  status: 'active',
  hasJoinPin: false,
  joined: true,
  role: 'member',
  version: 1,
};
const account = {
  id: ids.account,
  scope: { type: 'owner', ownerId: 'local-steve' },
  organizationName: 'Fixture Bank',
  sourceName: 'Checking',
  friendlyName: 'Household checking',
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 150_000,
  status: 'active',
  version: 1,
};
const budgets = [
  {
    id: ids.activeBudget,
    groupId: ids.group,
    name: 'Active household plan',
    status: 'active',
    activity: 'active',
    version: 1,
  },
  {
    id: ids.inactiveBudget,
    groupId: ids.group,
    name: 'Inactive historical plan',
    status: 'active',
    activity: 'inactive',
    version: 2,
  },
];

type ExpenseRecord = Record<string, unknown> & {
  id: string;
  accountId: string;
  budgetId: string;
  groupId: string;
  description: string;
  expectedAmountMinor: number;
  dueDate: string;
  lifecycle: 'active' | 'cancelled';
  version: number;
};
type FulfillmentRecord = Record<string, unknown> & {
  id: string;
  transactionId: string;
  amountMinor: number;
  status: 'active' | 'tombstone';
  version: number;
};

function seededExpense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: ids.expense,
    groupId: ids.group,
    accountId: ids.account,
    budgetId: ids.activeBudget,
    description: 'Annual insurance',
    expectedAmountMinor: 10_000,
    currency: 'USD',
    currencyExponent: 2,
    dueDate: '2027-01-20',
    entryContext: {
      enteredAt: '2026-11-14T18:00:00.000Z',
      localDate: '2026-11-14',
      timeZone: 'America/Denver',
    },
    dateChangeHistory: [],
    lifecycle: 'active',
    creatorId: 'local-steve',
    acceptedAt: '2026-11-14T18:00:01.000Z',
    createdAt: '2026-11-14T18:00:01.000Z',
    updatedAt: '2026-11-14T18:00:01.000Z',
    version: 1,
    ...overrides,
  };
}

async function routeUpcomingFinance(page: Page, initial: ExpenseRecord[] = []) {
  const expenses = [...initial];
  const fulfillments = new Map<string, FulfillmentRecord[]>();
  const capturedCreates: Record<string, unknown>[] = [];
  const transaction = {
    id: ids.transaction,
    accountId: ids.account,
    origin: 'manual',
    amountMinor: -10_000,
    currency: 'USD',
    currencyExponent: 2,
    description: 'Insurance payment',
    pending: false,
    allocations: [],
    reconciliationState: 'not-applicable',
    reviewState: 'none',
    status: 'active',
    version: 1,
  };

  const expenseView = (expense: ExpenseRecord) => {
    const references = fulfillments.get(expense.id) ?? [];
    const active = references.filter(({ status }) => status === 'active');
    const fulfilledAmountMinor = active.reduce((sum, item) => sum + item.amountMinor, 0);
    const remainingAmountMinor = Math.max(0, expense.expectedAmountMinor - fulfilledAmountMinor);
    const state =
      expense.lifecycle === 'cancelled'
        ? 'cancelled'
        : remainingAmountMinor === 0
          ? fulfilledAmountMinor > expense.expectedAmountMinor
            ? 'overpaid'
            : 'paid'
          : expense.dueDate < '2026-11-20'
            ? fulfilledAmountMinor
              ? 'partially-paid-overdue'
              : 'overdue'
            : fulfilledAmountMinor
              ? 'partially-paid'
              : 'upcoming';
    return {
      expense,
      fulfillments: references,
      claimVersions: Object.fromEntries(
        active.map(({ transactionId }, index) => [transactionId, index + 1]),
      ),
      fulfilledAmountMinor,
      remainingAmountMinor,
      overpaidAmountMinor: Math.max(0, fulfilledAmountMinor - expense.expectedAmountMinor),
      state,
    };
  };

  await page.route('**/api/v1/groups', (route) => route.fulfill({ json: { items: [group] } }));
  await page.route('**/api/v1/finance/budgets**', (route) =>
    route.fulfill({
      headers: financeSnapshotFixtureHeaders,
      json: { items: budgets, cursor: null },
    }),
  );
  await page.route('**/api/v1/finance/accounts**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/${ids.account}/transactions`))
      return route.fulfill({
        headers: financeSnapshotFixtureHeaders,
        json: { items: [transaction], cursor: null, totalsComplete: true },
      });
    return route.fulfill({
      headers: financeSnapshotFixtureHeaders,
      json: { items: [account], cursor: null },
    });
  });
  await page.route('**/api/v1/finance/upcoming-expenses**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const expenseId = path.match(/upcoming-expenses\/([^/]+)/u)?.[1];
    const expense = expenses.find(({ id }) => id === expenseId);

    if (request.method() === 'POST' && path.endsWith('/upcoming-expenses')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      capturedCreates.push(body);
      const created = seededExpense({
        ...body,
        id: String(body.id),
        accountId: String(body.accountId),
        budgetId: String(body.budgetId),
        groupId: String(body.groupId),
        description: String(body.description),
        expectedAmountMinor: Number(body.expectedAmountMinor),
        dueDate: String(body.dueDate),
      });
      expenses.push(created);
      return route.fulfill({ status: 201, json: expenseView(created) });
    }
    if (request.method() === 'PATCH' && expense) {
      const body = request.postDataJSON() as Record<string, unknown>;
      Object.assign(expense, body.dueDate ? { dueDate: body.dueDate } : {}, {
        version: expense.version + 1,
        updatedAt: new Date().toISOString(),
      });
      return route.fulfill({ json: expenseView(expense) });
    }
    if (request.method() === 'POST' && path.endsWith('/cancel') && expense) {
      expense.lifecycle = 'cancelled';
      expense.version++;
      return route.fulfill({ json: expenseView(expense) });
    }
    if (request.method() === 'POST' && path.endsWith('/fulfillments') && expense) {
      const body = request.postDataJSON() as Record<string, unknown>;
      const current = fulfillments.get(expense.id) ?? [];
      const created: FulfillmentRecord = {
        id: current.length ? ids.fulfillment2 : ids.fulfillment1,
        upcomingExpenseId: expense.id,
        transactionId: String(body.transactionId),
        amountMinor: Number(body.amountMinor),
        currency: 'USD',
        currencyExponent: 2,
        calculationState: 'accepted',
        status: 'active',
        version: 1,
      };
      current.push(created);
      fulfillments.set(expense.id, current);
      expense.version++;
      return route.fulfill({ status: 201, json: expenseView(expense) });
    }
    if (request.method() === 'DELETE' && expense) {
      const fulfillmentId = path.split('/').at(-1);
      const reference = (fulfillments.get(expense.id) ?? []).find(({ id }) => id === fulfillmentId);
      if (reference) {
        reference.status = 'tombstone';
        reference.version++;
      }
      expense.version++;
      return route.fulfill({ json: expenseView(expense) });
    }
    if (expense)
      return route.fulfill({ headers: financeSnapshotFixtureHeaders, json: expenseView(expense) });
    const includeClosed = url.searchParams.get('includeClosed') === 'true';
    const items = expenses
      .map(expenseView)
      .filter(({ state }) => includeClosed || !['paid', 'overpaid', 'cancelled'].includes(state));
    return route.fulfill({
      headers: financeSnapshotFixtureHeaders,
      json: { items, cursor: null },
    });
  });

  return { expenses, fulfillments, capturedCreates, expenseView };
}

async function prepare(page: Page, initial: ExpenseRecord[] = []) {
  const state = await routeUpcomingFinance(page, initial);
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  return state;
}

test('captures original browser context, excludes inactive budgets, and manages an existing association', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const state = await prepare(page);
  await page.goto('/finance/upcoming-expenses/new');
  await page.getByLabel('Description').fill('Winter renewal');
  await page.getByLabel('Expected amount').fill('45.00');
  await page.getByLabel('Date').fill('2027-01-20');
  await page.getByLabel('Group').selectOption(ids.group);
  await expect(page.getByLabel('Budget')).toContainText('Active household plan');
  await expect(page.getByLabel('Budget')).not.toContainText('Inactive historical plan');
  await page.getByLabel('Budget').selectOption(ids.activeBudget);
  await page.getByLabel('Account').selectOption(ids.account);
  await page.getByRole('button', { name: 'Save upcoming expense' }).click();
  await expect(page.getByRole('heading', { name: 'Winter renewal' })).toBeVisible();
  expect(state.capturedCreates).toHaveLength(1);
  expect(state.capturedCreates[0]).toMatchObject({
    dueDate: '2027-01-20',
    entryContext: { timeZone: 'America/Denver' },
  });

  const created = state.expenses[0]!;
  created.budgetId = ids.inactiveBudget;
  await page.getByLabel('New date').fill('2027-02-01');
  await page.getByRole('button', { name: 'Save new date' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Upcoming expense saved.' }),
  ).toBeVisible();
  expect(created.dueDate).toBe('2027-02-01');
  await page.getByRole('button', { name: 'Cancel upcoming expense' }).click();
  await expect(page.getByText(/cancelled/u)).toBeVisible();
});

test('links partial and full payments, reverses a reference, and keeps dashboard lists canonical', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const current = seededExpense();
  const overdue = seededExpense({
    id: ids.overdue,
    description: 'Past due utilities',
    expectedAmountMinor: 2_500,
    dueDate: '2026-11-01',
  });
  await prepare(page, [current, overdue]);
  await page.goto(`/finance/upcoming-expenses/${ids.expense}`);
  await page.getByLabel('Expense transaction').selectOption(ids.transaction);
  await page.getByLabel('Amount fulfilled').fill('30.00');
  await page.getByRole('button', { name: 'Link payment' }).click();
  await expect(page.getByText(/Remaining \$70\.00/u)).toBeVisible();
  await page.getByLabel('Expense transaction').selectOption(ids.transaction);
  await page.getByLabel('Amount fulfilled').fill('70.00');
  await page.getByRole('button', { name: 'Link payment' }).click();
  await expect(page.getByText(/· paid/u)).toBeVisible();

  await page.goto('/finance');
  const widget = page.getByRole('region', { name: 'Upcoming expenses' });
  await expect(widget.getByText('Annual insurance')).toHaveCount(0);
  await expect(widget.getByRole('heading', { name: 'Overdue' })).toBeVisible();
  await expect(widget.getByText(/Past due utilities/u)).toBeVisible();

  await page.goto(`/finance/upcoming-expenses/${ids.expense}`);
  await page.getByRole('button', { name: 'Remove reference' }).first().click();
  await expect(page.getByText(/Remaining \$30\.00/u)).toBeVisible();
});

test('replays a delayed offline create without changing its date or Auckland entry context', async ({
  browser,
}, testInfo) => {
  desktopOnly(testInfo);
  const context = await browser.newContext({
    timezoneId: 'Pacific/Auckland',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  try {
    const state = await prepare(page);
    let replayed: Record<string, unknown> | undefined;
    await page.route('**/api/v1/sync/push', async (route) => {
      const body = route.request().postDataJSON() as {
        mutations?: Array<Record<string, unknown> & { id: string; entityType: string }>;
      };
      const mutation = body.mutations?.find(
        ({ entityType }) => entityType === 'financeUpcomingExpense',
      );
      if (mutation) {
        replayed = mutation;
        const payload = mutation.payload as Record<string, unknown>;
        state.expenses.push(
          seededExpense({
            ...payload,
            id: String(payload.id),
            accountId: String(payload.accountId),
            budgetId: String(payload.budgetId),
            groupId: String(payload.groupId),
            description: String(payload.description),
            expectedAmountMinor: Number(payload.expectedAmountMinor),
            dueDate: String(payload.dueDate),
          }),
        );
      }
      return route.fulfill({
        json: {
          results: (body.mutations ?? []).map((item) => ({
            mutationId: item.id,
            operationId: item.id,
            status: 'applied',
            version: 1,
          })),
        },
      });
    });
    await page.goto('/finance/upcoming-expenses/new');
    await expect(page.getByRole('heading', { name: 'New upcoming expense' })).toBeVisible();
    await expect(page.getByLabel('Group')).toContainText('Household');
    await setOffline(page);
    await page.getByLabel('Description').fill('Delayed offline renewal');
    await page.getByLabel('Expected amount').fill('60.00');
    await page.getByLabel('Date').fill('2026-11-16');
    await page.getByLabel('Group').selectOption(ids.group);
    await page.getByLabel('Budget').selectOption(ids.activeBudget);
    await page.getByLabel('Account').selectOption(ids.account);
    await page.getByRole('button', { name: 'Save upcoming expense' }).click();
    await expect(page.getByText(/queued securely and will sync when online/u)).toBeVisible();
    await setOffline(page, false);
    await expect.poll(() => replayed, { timeout: 10_000 }).toBeTruthy();
    const payload = replayed!.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      dueDate: '2026-11-16',
      entryContext: { timeZone: 'Pacific/Auckland' },
    });
    await page.goto('/finance/upcoming-expenses');
    const delayed = page.getByRole('article').filter({ hasText: 'Delayed offline renewal' });
    await expect(delayed).toContainText('Due 2026-11-16 · overdue');
  } finally {
    await context.close();
  }
});
