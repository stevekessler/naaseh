import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block', timezoneId: 'America/Denver' });

const ids = {
  group: '01J00000000000000000000941',
  account: '01J00000000000000000000942',
  budget: '01J00000000000000000000943',
  expense: '01J00000000000000000000944',
  task: '01J00000000000000000000945',
  link: '01J00000000000000000000946',
};
const desktopOnly = (testInfo: TestInfo) =>
  test.skip(['iphone', 'ipad'].includes(testInfo.project.name), 'Phase 11 requires Chromium/WebKit.');

type SeedFinanceValue = {
  id: string;
  entityType: 'financeTransaction' | 'financeUpcomingExpense';
  scopeKey: `OWNER#${string}`;
  value: Record<string, unknown>;
};

async function seedFinanceOptions(page: Page, values: SeedFinanceValue[]) {
  await page.evaluate(async (input) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keyTransaction = database.transaction('cryptoKeys', 'readwrite');
    const keyStore = keyTransaction.objectStore('cryptoKeys');
    const storedKey = await new Promise<{ key: CryptoKey } | undefined>((resolve, reject) => {
      const request = keyStore.get('device');
      request.onsuccess = () => resolve(request.result as { key: CryptoKey } | undefined);
      request.onerror = () => reject(request.error);
    });
    const key = storedKey?.key ?? await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    if (!storedKey) keyStore.put({ id: 'device', key });
    await new Promise<void>((resolve, reject) => {
      keyTransaction.oncomplete = () => resolve();
      keyTransaction.onerror = () => reject(keyTransaction.error);
    });
    const encode = (value: ArrayBuffer) =>
      btoa(String.fromCharCode(...new Uint8Array(value)));
    const encoder = new TextEncoder();
    const generation = crypto.randomUUID();
    const encrypted = await Promise.all(input.map(async (item) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv,
          additionalData: encoder.encode(`finance:${item.entityType}:${item.id}:v1`) },
        key,
        encoder.encode(JSON.stringify(item.value)),
      );
      return { ...item, cacheGeneration: generation, version: 1,
        updatedAt: '2026-11-15T15:00:00.000Z',
        value: { iv: encode(iv.buffer), ciphertext: encode(ciphertext) } };
    }));
    const deliveryIv = crypto.getRandomValues(new Uint8Array(12));
    const deliveryCiphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: deliveryIv,
        additionalData: encoder.encode('finance:delivery:local-steve:v1') },
      key,
      encoder.encode(JSON.stringify({ ownerId: 'local-steve', cursor: {},
        cacheGeneration: generation, cacheProof: 'fc1.synthetic.fixture.proof' })),
    );
    const write = database.transaction(['secureFinanceRecords', 'settings'], 'readwrite');
    const records = write.objectStore('secureFinanceRecords');
    for (const record of encrypted) records.put(record);
    write.objectStore('settings').put({ key: 'finance-delivery:local-steve',
      value: JSON.stringify({ version: 1,
        value: { iv: encode(deliveryIv.buffer), ciphertext: encode(deliveryCiphertext) } }) });
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
    });
    database.close();
  }, values);
}

async function mockProtectedFinanceSecurity(page: Page) {
  let signedIn = false;
  await page.route('**/api/v1/auth/login', (route) => {
    signedIn = true;
    return route.fulfill({ json: { user: { id: 'local-steve', displayName: 'Steve', role: 'user' },
      csrfToken: 'local-development' } });
  });
  await page.route('**/api/v1/auth/finance-security', (route) => route.fulfill({
    json: { requirePin: true, enrolled: true, revision: 1 },
  }));
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    status: signedIn ? 200 : 401,
    json: { user: { id: 'local-steve', displayName: 'Steve', role: 'user', sessionEpoch: 0 },
      csrfToken: 'local-development' },
  }));
}

async function mockCurrentFinanceCachePull(page: Page) {
  await page.route('**/api/v1/sync/pull', (route) => {
    const body = route.request().postDataJSON() as {
      financeCacheOnly?: boolean;
      financeCursor?: unknown;
    };
    if (!body.financeCacheOnly) return route.fallback();
    return route.fulfill({ json: { changes: [], financeChanges: [], cursor: {},
      financeCursor: body.financeCursor,
      financeCache: { status: 'current', proof: financeSnapshotFixtureHeaders['x-finance-cache-proof'] } } });
  });
}

async function prepareUpcoming(page: Page, relatedTasks: Array<Record<string, unknown>> = []) {
  let taskCreates = 0;
  const expense = {
    id: ids.expense, groupId: ids.group, accountId: ids.account, budgetId: ids.budget,
    description: 'Protected annual insurance', expectedAmountMinor: 10_000, currency: 'USD',
    currencyExponent: 2, dueDate: '2027-01-20',
    entryContext: { enteredAt: '2026-11-15T15:00:00.000Z', localDate: '2026-11-15',
      timeZone: 'America/Denver' },
    dateChangeHistory: [], lifecycle: 'active', creatorId: 'local-steve',
    acceptedAt: '2026-11-15T15:00:00.000Z', createdAt: '2026-11-15T15:00:00.000Z',
    updatedAt: '2026-11-15T15:00:00.000Z', version: 1,
  };
  const view = { expense, fulfillments: [], claimVersions: {}, fulfilledAmountMinor: 0,
    remainingAmountMinor: 10_000, overpaidAmountMinor: 0, state: 'upcoming' };
  await page.route('**/api/v1/groups', (route) => route.fulfill({ json: { items: [{
    id: ids.group, name: 'Household', ownerId: 'local-steve', status: 'active', joined: true,
    role: 'member', version: 1,
  }] } }));
  await page.route('**/api/v1/finance/accounts**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders,
    json: { items: [{ id: ids.account, scope: { type: 'owner', ownerId: 'local-steve' },
      friendlyName: 'Checking', sourceName: 'Checking', organizationName: 'Bank', currency: 'USD',
      currencyExponent: 2, currentBalanceMinor: 100_000, status: 'active', version: 1 }], cursor: null },
  }));
  await page.route('**/api/v1/finance/budgets**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders,
    json: { items: [{ id: ids.budget, groupId: ids.group, name: 'Plan', status: 'active',
      activity: 'active', version: 1 }], cursor: null },
  }));
  await page.route('**/api/v1/finance/upcoming-expenses**', (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith(`/upcoming-expenses/${ids.expense}/tasks`)) {
      taskCreates++;
      return route.fulfill({ status: 201, json: { taskId: ids.task, financialTaskLinkId: ids.link } });
    }
    if (request.method() === 'GET' && request.url().endsWith(`/upcoming-expenses/${ids.expense}/tasks`))
      return route.fulfill({ json: { tasks: relatedTasks } });
    return route.fulfill({ headers: financeSnapshotFixtureHeaders,
      json: request.url().endsWith(ids.expense) ? view : { items: [view], cursor: null } });
  });
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await page.route('**/api/v1/sync/pull', (route) => {
    const body = route.request().postDataJSON() as { financeCacheOnly?: boolean; financeCursor?: unknown };
    if (!body.financeCacheOnly) return route.fallback();
    return route.fulfill({ json: { changes: [], financeChanges: [], cursor: {},
      financeCursor: body.financeCursor,
      financeCache: { status: 'current', proof: financeSnapshotFixtureHeaders['x-finance-cache-proof'] } } });
  });
  await signIn(page);
  return () => taskCreates;
}

async function prepareTransaction(page: Page) {
  let taskCreates = 0;
  const transaction = {
    id: '01J00000000000000000000951', accountId: ids.account, origin: 'manual',
    amountMinor: -2500, currency: 'USD', currencyExponent: 2,
    transactedAt: '2026-11-15T15:00:00.000Z', effectiveAt: '2026-11-15T15:00:00.000Z',
    description: 'Protected pharmacy purchase', pending: false, allocations: [],
    reconciliationState: 'not-applicable', reviewState: 'none', status: 'active', version: 1,
  };
  await page.route('**/api/v1/finance/transactions/**', (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith(`/transactions/${transaction.id}/tasks`)) {
      taskCreates++;
      return route.fulfill({ status: 201,
        json: { taskId: ids.task, financialTaskLinkId: ids.link } });
    }
    if (request.method() === 'GET' && request.url().endsWith(`/transactions/${transaction.id}/tasks`))
      return route.fulfill({ json: { tasks: [] } });
    return route.fulfill({ status: 200, headers: financeSnapshotFixtureHeaders, json: transaction });
  });
  await page.route('**/api/v1/finance/accounts**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders,
    json: { items: [{ id: ids.account, scope: { type: 'owner', ownerId: 'local-steve' },
      friendlyName: 'Checking', sourceName: 'Checking', organizationName: 'Bank', currency: 'USD',
      currencyExponent: 2, currentBalanceMinor: 100_000, status: 'active', version: 1 }], cursor: null },
  }));
  await page.route('**/api/v1/finance/accounts/*/transactions**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders, json: { items: [transaction], cursor: null,
      totalsComplete: true },
  }));
  await page.route('**/api/v1/finance/categories**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders, json: { items: [], cursor: null },
  }));
  await page.route('**/api/v1/finance/merchants**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders, json: { items: [], cursor: null },
  }));
  await page.route('**/api/v1/finance/review-issues**', (route) => route.fulfill({
    headers: financeSnapshotFixtureHeaders, json: { items: [], cursor: null },
  }));
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await mockCurrentFinanceCachePull(page);
  await signIn(page);
  return { transaction, taskCreates: () => taskCreates };
}

test('uses the normal task form for Add Task and cancel creates nothing', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const taskCreates = await prepareUpcoming(page);
  await page.goto(`/finance/upcoming-expenses/${ids.expense}`);
  await page.getByRole('button', { name: 'Create task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task from Review upcoming expense' });
  await expect(dialog.getByLabel('Task label')).toHaveValue('Review upcoming expense');
  await expect(dialog).not.toContainText('Protected annual insurance');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(taskCreates()).toBe(0);

  await page.getByRole('button', { name: 'Create task' }).click();
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: 'Open created task' })).toHaveAttribute(
    'href', `/tasks/${ids.task}`,
  );
  expect(taskCreates()).toBe(1);
});

test('uses the same protected-safe Add Task flow from a transaction', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const { transaction, taskCreates } = await prepareTransaction(page);
  await page.goto(`/finance/transactions/${transaction.id}`);
  await page.getByRole('button', { name: 'Create task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create task from Review transaction' });
  await expect(dialog.getByLabel('Task label')).toHaveValue('Review transaction');
  await expect(dialog).not.toContainText('Protected pharmacy purchase');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(taskCreates()).toBe(0);
  await page.getByRole('button', { name: 'Create task' }).click();
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: 'Open created task' })).toHaveAttribute(
    'href', `/tasks/${ids.task}`,
  );
  expect(taskCreates()).toBe(1);
});

test('navigates from an authorized expense to its related ordinary task', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await prepareUpcoming(page, [{ id: ids.task, label: 'Call insurance agent',
    ownerId: 'local-steve', assigneeId: 'local-steve', status: 'open', urgency: 'normal',
    visibility: 'private', percentComplete: 0, version: 1 }]);
  await page.goto(`/finance/upcoming-expenses/${ids.expense}`);
  const related = page.getByRole('region', { name: 'Related tasks' });
  const task = related.getByRole('link', { name: 'Call insurance agent' });
  await expect(task).toHaveAttribute('href', `/tasks/${ids.task}`);
});

test('keeps Upcoming Expenses task and post-it displays off until the user opts in', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await mockUnprotectedFinanceSecurity(page);
  await signIn(page);
  await page.goto('/tasks');
  await page.getByText('Columns', { exact: true }).click();
  const column = page.getByLabel('Show Upcoming Expenses column');
  await expect(column).not.toBeChecked();
  await column.check();
  await expect(column).toBeChecked();
  await page.getByRole('button', { name: 'Post-its' }).click();
  await page.getByText('Fields', { exact: true }).click();
  const field = page.getByLabel('Show Upcoming Expenses on post-its');
  await expect(field).not.toBeChecked();
  await field.check();
  await expect(field).toBeChecked();
});

test('selects and durably queues multiple Finance relationships from normal task creation', async ({
  page,
  context,
}, testInfo) => {
  desktopOnly(testInfo);
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await mockCurrentFinanceCachePull(page);
  await signIn(page);
  await seedFinanceOptions(page, [
    { id: '01J00000000000000000000961', entityType: 'financeTransaction',
      scopeKey: 'OWNER#local-steve', value: { id: '01J00000000000000000000961',
        description: 'Grocery transaction', status: 'active' } },
    { id: '01J00000000000000000000962', entityType: 'financeUpcomingExpense',
      scopeKey: 'OWNER#local-steve', value: { id: '01J00000000000000000000962',
        description: 'Annual registration', lifecycle: 'active', status: 'active' } },
  ]);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
  const form = page.locator('.task-form').first();
  await expect(form.getByRole('group', { name: 'Related Finance records (optional)' })).toBeVisible();
  await form.getByLabel('Grocery transaction').check();
  await form.getByLabel('Annual registration').check();
  await form.getByLabel('Find a transaction, upcoming expense, or budget item').fill('annual');
  await expect(form.getByLabel('Grocery transaction')).toHaveCount(0);
  await expect(form.getByLabel('Annual registration')).toBeChecked();
  await form.getByLabel('Find a transaction, upcoming expense, or budget item').fill('');
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await form.getByLabel('Task label').fill('Review household expenses');
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('button', { name: 'Review household expenses', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = database.transaction('outbox').objectStore('outbox').index('entityType')
        .count('financeTaskLink');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  })).toBe(2);
});

test('keeps ordinary task details usable while an embedded Finance visit is locked', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await mockProtectedFinanceSecurity(page);
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Ordinary locked-finance task');
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Ordinary locked-finance task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog.getByLabel('Task label')).toHaveValue('Ordinary locked-finance task');
  await dialog.getByRole('button', { name: 'Unlock Finance', exact: true }).click();
  const unlock = dialog.getByRole('region', { name: 'Unlock Finance' });
  await expect(unlock.getByLabel('Finance PIN', { exact: true })).toBeVisible();
  await unlock.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByLabel('Task label')).toHaveValue('Ordinary locked-finance task');
  await expect(dialog.getByRole('button', { name: 'Unlock Finance', exact: true })).toBeVisible();
});
