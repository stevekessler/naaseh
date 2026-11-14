import { journalSyncContractVersion } from '@naaseh/domain';
import { expect, test, type Page } from '@playwright/test';
import {
  signIn,
  mockUnprotectedFinanceSecurity,
  mockFinanceSnapshotEvidence,
  financeSnapshotFixtureHeaders,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const ids = {
  group: '01J00000000000000000000801',
  budget: '01J00000000000000000000802',
  account: '01J00000000000000000000803',
  category: '01J00000000000000000000804',
  reusable: '01J00000000000000000000805',
  item: '01J00000000000000000000806',
  match: '01J00000000000000000000807',
  automaticTransaction: '01J00000000000000000000808',
  ambiguousTransaction: '01J00000000000000000000809',
};

async function routes(page: Page) {
  let matchState = { status: 'suggested', version: 1 };
  let transactionVersion = 1;
  await page.route('**/api/v1/groups', (route) =>
    route.fulfill({
      status: 200,
      json: {
        items: [
          {
            id: ids.group,
            name: 'Household',
            ownerId: 'local-steve',
            status: 'active',
            hasJoinPin: false,
            joined: true,
            role: 'member',
            version: 1,
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: ids.account,
            friendlyName: 'Shared checking',
            currency: 'USD',
            scope: { type: 'group', groupId: ids.group },
          },
        ],
      }),
    }),
  );
  await page.route('**/api/v1/finance/categories**', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: ids.category, name: 'Utilities', origin: 'user', status: 'active', version: 1 },
        ],
      }),
    }),
  );
  const budgetState = {
    id: ids.budget,
    groupId: ids.group,
    name: 'September plan',
    budgetDate: '2027-09-01',
    startDate: '2027-09-01',
    endDate: '2027-09-30',
    status: 'active',
    items: [] as Array<Record<string, unknown>>,
    totals: [],
    totalsComplete: true,
    version: 2,
  };
  const reusableItems: Array<Record<string, unknown>> = [];
  const availableOffers = [
    {
      reusableItemId: ids.reusable,
      occurrenceDate: '2027-09-15',
      description: 'Mobile service',
      plannedAmountMinor: -50_000,
      currency: 'USD',
      currencyExponent: 2,
    },
  ];
  const json = (body: unknown, status = 200) => ({
    status,
    headers: financeSnapshotFixtureHeaders,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/v1/finance/budgets', (route) =>
    route.fulfill(json({ items: [budgetState], cursor: null })),
  );
  await page.route(`**/api/v1/finance/budgets/${ids.budget}`, (route) =>
    route.fulfill(json(budgetState)),
  );
  await page.route('**/api/v1/finance/reusable-items', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(json({ items: reusableItems }));
    const saved = {
      ...route.request().postDataJSON(),
      id: ids.reusable,
      status: 'active',
      creatorId: 'member-1',
      version: 1,
    };
    reusableItems.push(saved);
    return route.fulfill(json(saved, 201));
  });
  await page.route(`**/api/v1/finance/budgets/${ids.budget}/reusable-offers`, (route) =>
    route.fulfill(json({ items: availableOffers })),
  );
  await page.route(
    `**/api/v1/finance/budgets/${ids.budget}/reusable-items/${ids.reusable}/copy`,
    (route) => {
      const input = route.request().postDataJSON();
      expect(input.expectedBudgetVersion).toBe(budgetState.version);
      const copied = {
        id: ids.item,
        budgetId: ids.budget,
        sourceReusableItemId: ids.reusable,
        description: 'Mobile service',
        financeCategoryId: ids.category,
        plannedAmountMinor: -50_000,
        currency: 'USD',
        currencyExponent: 2,
        applicableDate: '2027-09-15',
        relatedAccountIds: [ids.account],
        creatorId: 'member-1',
        status: 'active',
        version: 1,
      };
      budgetState.items.push(copied);
      budgetState.version++;
      availableOffers.splice(0);
      return route.fulfill(json(copied, 201));
    },
  );
  await page.route('**/api/v1/finance/transactions/*/matches', (route) => {
    const transactionId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const exact = {
      transactionId,
      kind: 'exact',
      scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 0 },
      version: 1,
    };
    const items =
      transactionId === ids.automaticTransaction
        ? [{ ...exact, id: ids.match, budgetItemId: ids.item, status: 'accepted' }]
        : transactionId === ids.ambiguousTransaction
          ? [
              { ...exact, id: `${ids.match}1`, budgetItemId: ids.item, status: 'suggested' },
              { ...exact, id: `${ids.match}2`, budgetItemId: `${ids.item}2`, status: 'suggested' },
            ]
          : [
              {
                id: ids.match,
                transactionId,
                budgetItemId: ids.item,
                kind: 'near',
                scoreBasis: {
                  merchant: true,
                  date: true,
                  account: true,
                  amountDifferencePercent: 10,
                },
                ...matchState,
              },
            ];
    return route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ items, transactionVersion }),
    });
  });
  await page.route(`**/api/v1/finance/matches/${ids.match}/decision`, (route) => {
    const input = route.request().postDataJSON();
    expect(input.expectedVersion).toBe(matchState.version);
    expect(input.expectedTransactionVersion).toBe(transactionVersion);
    matchState = {
      status:
        input.decision === 'undo'
          ? 'undone'
          : input.decision === 'reject'
            ? 'rejected'
            : 'accepted',
      version: matchState.version + 1,
    };
    if (input.decision !== 'reject') transactionVersion++;
    return route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        id: ids.match,
        transactionId: 'transaction-1',
        budgetItemId: ids.item,
        kind: 'near',
        scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 10 },
        ...matchState,
        decidedBy: 'member-1',
        decidedAt: '2027-09-16T00:00:00.000Z',
      }),
    });
  });
}

async function reusableQueueState(page: Page, resetCheckpoint = false) {
  return page.evaluate(async (resetCheckpoint) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = (store: string) =>
      new Promise<any[]>((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    try {
      if (resetCheckpoint)
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('settings', 'readwrite');
          transaction.objectStore('settings').delete('finance-delivery:local-steve');
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
      const [outbox, records, keys, settings] = await Promise.all(
        ['outbox', 'secureFinanceRecords', 'cryptoKeys', 'settings'].map(all),
      );
      const pending = outbox.filter((row) => row.entityType === 'financeReusableItem');
      const record = records.find((row) => row.entityType === 'financeReusableItem');
      const key = keys.find((row) => row.id === 'device')?.key as CryptoKey;
      const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const decrypt = async (value: { iv: string; ciphertext: string }, associatedData: string) =>
        JSON.parse(
          new TextDecoder().decode(
            await crypto.subtle.decrypt(
              {
                name: 'AES-GCM',
                iv: bytes(value.iv),
                additionalData: new TextEncoder().encode(associatedData),
              },
              key,
              bytes(value.ciphertext),
            ),
          ),
        );
      const checkpoint = settings.find((row) => row.key === 'finance-delivery:local-steve');
      const envelope = checkpoint ? JSON.parse(checkpoint.value) : undefined;
      const delivery = envelope
        ? await decrypt(envelope.value, `finance:delivery:local-steve:v${envelope.version}`)
        : undefined;
      return {
        pending,
        intent: pending[0]
          ? await decrypt(pending[0].payload, `mutation:${pending[0].id}`)
          : undefined,
        data: record
          ? await decrypt(
              record.value,
              `finance:financeReusableItem:${record.id}:v${record.version}`,
            )
          : undefined,
        generationMatches:
          !!record?.cacheGeneration && record.cacheGeneration === delivery?.cacheGeneration,
        keyNonextractable: key?.extractable === false,
        encrypted: !JSON.stringify(records).includes('Offline water bill'),
        ordinaryCursor: JSON.parse(
          settings.find((row) => row.key === 'sync-cursor')?.value ?? '{}',
        ),
      };
    } finally {
      database.close();
    }
  }, resetCheckpoint);
}

test('creates reusable items and copies an applicable future offer', async ({ page, context }) => {
  await routes(page);
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  let saved: any;
  const replayed: any[] = [];
  await page.route('**/api/v1/sync/push', async (route) => {
    const body = route.request().postDataJSON();
    if (
      body.contractVersion !== 8 ||
      !body.mutations?.some((item: any) => item.entityType === 'financeReusableItem')
    )
      return route.fallback();
    expect(body.mutations).toHaveLength(1);
    const mutation = body.mutations[0];
    replayed.push(mutation);
    expect(mutation).toMatchObject({
      entityType: 'financeReusableItem',
      operation: 'create',
      baseVersion: 0,
    });
    saved = {
      ...mutation.payload,
      id: mutation.entityId,
      creatorId: 'local-steve',
      version: 1,
      status: 'active',
    };
    await route.fulfill({
      json: {
        results: [
          {
            mutationId: mutation.id,
            status: replayed.length === 1 ? 'applied' : 'alreadyApplied',
            version: 1,
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON();
    if (body.financeCacheOnly) return route.fallback();
    if (body.version === journalSyncContractVersion)
      return route.fulfill({
        json: {
          version: journalSyncContractVersion,
          changes: [],
          journalCursor: body.journalCursor ?? 0,
          hasMore: false,
        },
      });
    if (body.financeCacheProtocol !== 1)
      return route.fulfill({ json: { changes: [], cursor: body.cursor ?? {} } });
    const feed = `group:${ids.group}`;
    const delivers = saved && Number(body.financeCursor?.[feed] ?? 0) < 1;
    await route.fulfill({
      json: {
        financeState: 'ready',
        financeHasMore: false,
        financeCache: {
          status: 'current',
          proof: financeSnapshotFixtureHeaders['x-finance-cache-proof'],
        },
        financeCursor: { ...body.financeCursor, ...(saved ? { [feed]: 1 } : {}) },
        cursor: { owner: 911 },
        changes: [],
        financeChanges: delivers
          ? [
              {
                audience: `GROUP#${ids.group}`,
                sequence: 1,
                entityId: saved.id,
                entityType: 'financeReusableItem',
                version: 1,
                changedAt: '2026-11-09T00:00:00Z',
                operation: 'upsert',
                payload: saved,
              },
            ]
          : [],
      },
    });
  });
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Reusable items' }).click();
  await page.getByRole('button', { name: 'Create reusable item' }).click();
  await page.getByLabel('Group').selectOption(ids.group);
  await page.getByLabel('Reusable description').fill('Mobile service');
  await page.getByLabel('Applicable date').fill('2027-09-15');
  await page.getByLabel('Planned amount').fill('500.00');
  await page.getByRole('button', { name: 'Save reusable item' }).click();
  await expect(page.getByRole('article', { name: 'Mobile service reusable item' })).toContainText(
    '$500.00',
  );
  await page.getByRole('button', { name: 'September plan offers' }).click();
  await expect(page.getByText('Offered for September plan')).toBeVisible();
  await page.getByRole('button', { name: 'Copy Mobile service' }).click();
  await expect(page.getByText('Copied independently')).toBeVisible();
  // Preserve the existing online flow, then prove first-bootstrap recovery of an offline draft.
  await page.route('**/api/v1/finance/reusable-items', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.fallback(),
  );
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create reusable item' }).click();
  await page.getByLabel('Group').selectOption(ids.group);
  await page.getByLabel('Reusable description').fill('Offline water bill');
  await page.getByLabel('Applicable date').fill('2027-09-15');
  await page.getByLabel('Planned amount').fill('42.00');
  await page.getByRole('button', { name: 'Save reusable item' }).click();
  await expect(
    page.getByText('Reusable item queued securely and will sync when online.'),
  ).toBeVisible();
  const queued = await reusableQueueState(page, true);
  expect(queued.pending).toHaveLength(1);
  expect(queued.intent).toMatchObject({
    description: 'Offline water bill',
    groupId: ids.group,
    plannedAmountMinor: -4200,
  });
  expect(queued.encrypted).toBe(true);
  const id = queued.pending[0].entityId;
  await context.setOffline(false);
  await expect
    .poll(async () => {
      if (!replayed.length) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      return replayed.length;
    })
    .toBeGreaterThan(0);
  await expect.poll(async () => (await reusableQueueState(page)).generationMatches).toBe(true);
  const delivered = await reusableQueueState(page);
  expect(delivered.pending).toHaveLength(0);
  expect(delivered.data).toMatchObject({
    id,
    creatorId: 'local-steve',
    description: 'Offline water bill',
    version: 1,
  });
  expect(delivered.encrypted).toBe(true);
  expect(delivered.keyNonextractable).toBe(true);
  expect(delivered.ordinaryCursor.owner).not.toBe(911);
  expect(new Set(replayed.map((mutation) => mutation.entityId))).toEqual(new Set([id]));
});

test('shows near provenance and keeps match decisions undoable', async ({ page }) => {
  await routes(page);
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Reusable items' }).click();
  await page.getByLabel('Transaction for match review').fill('transaction-1');
  await page.getByRole('button', { name: 'Review matches' }).click();
  await expect(page.getByRole('article', { name: 'Near match suggestion' })).toContainText(
    '10% amount difference',
  );
  await page.getByRole('button', { name: 'Accept match' }).click();
  await expect(page.getByRole('button', { name: 'Undo match' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo match' }).click();
  await expect(page.getByText('Status: undone')).toBeVisible();
  await page.getByRole('button', { name: 'Reject match' }).click();
  await expect(page.getByText('Status: rejected')).toBeVisible();
});

test('distinguishes a unique automatic exact match from ambiguous exact suggestions', async ({
  page,
}) => {
  await routes(page);
  await mockUnprotectedFinanceSecurity(page);
  await mockFinanceSnapshotEvidence(page);
  await signIn(page);
  await page.goto('/finance/budgets');
  await page.getByRole('button', { name: 'Reusable items' }).click();
  const transaction = page.getByLabel('Transaction for match review');
  await transaction.fill(ids.automaticTransaction);
  await page.getByRole('button', { name: 'Review matches' }).click();
  await expect(page.getByRole('article', { name: 'Exact match suggestion' })).toContainText(
    'Status: accepted',
  );
  await transaction.fill(ids.ambiguousTransaction);
  await page.getByRole('button', { name: 'Review matches' }).click();
  await expect(page.getByRole('article', { name: 'Exact match suggestion' })).toHaveCount(2);
  await expect(page.getByText('Status: suggested')).toHaveCount(2);
});
