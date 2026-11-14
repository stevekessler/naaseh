import { expect, type Locator, type Page } from '@playwright/test';
import { journalSyncContractVersion } from '@naaseh/domain';
import { journalPullResponseSchema } from '@naaseh/contracts';

export async function expandTaskDetails(form: Locator) {
  const details = form.locator('.task-form-details');
  if ((await details.getAttribute('open')) === null)
    await details.getByText('Task details', { exact: true }).click();
  await expect(details).toHaveAttribute('open', '');
}

export async function setTaskDueDate(form: Locator, date: string, time?: string) {
  await form.getByRole('button', { name: /Add due date|Change due date/ }).click();
  const dialog = form.page().getByRole('dialog', { name: 'Set due date' });
  await dialog.getByLabel('Due date', { exact: true }).fill(date);
  if (time) {
    await dialog.getByLabel('Add a time').check();
    const [hourText = '10', minute = '00'] = time.split(':');
    const hour24 = Number(hourText);
    await dialog.getByLabel('Due time hour').selectOption(String(hour24 % 12 || 12));
    await dialog.getByLabel('Due time minute').selectOption(minute);
    await dialog.getByLabel('Due time AM or PM').selectOption(hour24 >= 12 ? 'PM' : 'AM');
  }
  await dialog.getByRole('button', { name: 'Set due date' }).click();
}

export async function signIn(page: Page) {
  await page.route('**/api/v1/sync/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tasks: [],
        categories: [],
        projects: [],
        lists: [],
        listItems: [],
        cursor: { public: 0, owner: 0 },
      }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  const bootstrapResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/sync/bootstrap',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  await bootstrapResponse;
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

export async function mockSuccessfulSync(page: Page) {
  await page.route('**/api/v1/sync/push', async (route) => {
    const body = route.request().postDataJSON() as {
      mutations?: Array<{ id: string; baseVersion?: number }>;
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: (body.mutations ?? []).map((mutation) => ({
          mutationId: mutation.id,
          operationId: mutation.id,
          status: 'applied',
          version: (mutation.baseVersion ?? 0) + 1,
        })),
      }),
    });
  });
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as {
      cursor?: Record<string, number>;
      version?: number;
      journalCursor?: number;
    };
    // Journal shares this URL but has an independent, strict response contract.
    // A task response creates a spurious sync failure in otherwise successful journeys.
    if (body.version === journalSyncContractVersion) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          journalPullResponseSchema.parse({
            version: journalSyncContractVersion,
            changes: [],
            journalCursor: body.journalCursor ?? 0,
            hasMore: false,
          }),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ changes: [], cursor: body.cursor ?? {} }),
    });
  });
}

export async function openLists(page: Page) {
  const lists = page.getByRole('button', { name: 'Lists', exact: true });
  await lists.focus();
  await lists.press('Enter');
  await expect(page.getByRole('heading', { name: 'Lists', exact: true })).toBeVisible();
}

export async function openNamedList(page: Page, name: string) {
  await openLists(page);
  const open = page
    .getByRole('row', { name: new RegExp(name, 'u') })
    .getByRole('button', { name: 'Open' });
  await open.focus();
  await open.press('Enter');
  const list = page.locator('.named-list').filter({ hasText: name });
  await expect(list.getByRole('heading', { name })).toBeVisible();
  return list;
}

export async function createListWithItem(page: Page, listName: string, itemName: string) {
  await openLists(page);
  await page.getByLabel('List name').fill(listName);
  await page.getByLabel('List name').press('Enter');
  const list = page.locator('.named-list').filter({ hasText: listName });
  await list.getByLabel('Add an item').fill(itemName);
  await list.getByRole('button', { name: 'Add item' }).click();
  await expect(list.getByText(itemName, { exact: true })).toBeVisible();
  return list;
}

export async function addTask(page: Page, label: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: label })).toBeVisible();
}

export async function openCompletedTasks(page: Page) {
  await openTaskSection(page, 'Task Reporting');
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Task Reporting', exact: true })).toBeVisible();
}

export async function openTaskSection(
  page: Page,
  section: 'My Tasks' | 'Personal Stack' | 'Task Reporting' | 'Archive',
) {
  const trigger = page.getByRole('button', { name: 'Show Tasks menu' });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const link = page
    .locator('#tasks-navigation-links')
    .getByRole('button', { name: section, exact: true });
  await link.focus();
  await link.press('Enter');
}

export async function setOffline(page: Page, offline = true) {
  await page.context().setOffline(offline);
  await page.evaluate((isOffline) => {
    window.dispatchEvent(new Event(isOffline ? 'offline' : 'online'));
  }, offline);
}

export async function resizePreservingValue(
  page: Page,
  fieldLabel: string,
  value: string,
  width: number,
  height: number,
) {
  const field = page.getByLabel(fieldLabel);
  await field.fill(value);
  await page.setViewportSize({ width, height });
  await expect(field).toHaveValue(value);
}

/** Explicit legacy-unprotected fixture; authentication security journeys use their own routes. */
export async function mockUnprotectedFinanceSecurity(
  page: Page,
  options: { role?: 'user' | 'admin' } = {},
) {
  const role = options.role ?? 'admin';
  let signedIn = false;
  await page.route('**/api/v1/auth/login', (route) => {
    signedIn = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'local-steve', displayName: 'Steve', role },
        csrfToken: 'local-development',
      }),
    });
  });
  await page.route('**/api/v1/auth/finance-security', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ requirePin: false, enrolled: false, revision: 0 }),
    }),
  );
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'local-steve', displayName: 'Steve', role, sessionEpoch: 0 },
        csrfToken: 'local-development',
      }),
    }),
  );
}

/** Synthetic source evidence for mocked REST/permission responses; server crypto has separate tests. */
export const financeSnapshotFixtureHeaders = {
  'x-finance-cache-proof': 'fc1.synthetic.fixture.proof',
};
export async function mockFinanceSnapshotEvidence(page: Page) {
  let current = true;
  await page.route('**/api/v1/finance/connections', (route) =>
    route.fulfill({
      status: 200,
      headers: financeSnapshotFixtureHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as {
      financeCacheOnly?: boolean;
      financeCacheProtocol?: number;
      financeCacheProof?: string | string[];
      financeCursor?: Record<string, number>;
    };
    if (!body.financeCacheOnly) return route.fallback();
    expect(body.financeCacheProtocol).toBe(1);
    const proofs = Array.isArray(body.financeCacheProof)
      ? body.financeCacheProof
      : [body.financeCacheProof];
    expect(proofs.length).toBeGreaterThan(0);
    expect(
      proofs.every((proof) => proof === financeSnapshotFixtureHeaders['x-finance-cache-proof']),
    ).toBe(true);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        changes: [],
        financeChanges: [],
        cursor: {},
        financeCursor: body.financeCursor,
        financeCache: current
          ? { status: 'current', proof: financeSnapshotFixtureHeaders['x-finance-cache-proof'] }
          : { status: 'refresh-required' },
      }),
    });
  });
  return {
    revoke: () => {
      current = false;
    },
  };
}

export async function mockFinanceTransactionBrowsing(
  page: Page,
  records: () => Iterable<Record<string, unknown>>,
) {
  await page.route(/\/api\/v1\/finance\/(?:accounts\/[^/?]+\/)?transactions\?/u, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('browse') !== '1')
      return route.fallback();
    const accountId = url.pathname.match(/accounts\/([^/]+)\/transactions$/u)?.[1];
    const accounts = accountId ? [accountId] : url.searchParams.getAll('accountIds[]');
    const text = url.searchParams.get('text')?.toLowerCase();
    const amount = url.searchParams.get('amount');
    const amountMax = url.searchParams.get('amountMax');
    const currency = url.searchParams.get('currency');
    const items = [...records()].filter(
      (row) =>
        accounts.includes(String(row.accountId)) &&
        (!text || String(row.description).toLowerCase().includes(text)) &&
        (!currency || row.currency === currency) &&
        (amount === null || row.amountMinor === Number(amount)) &&
        (amountMax === null || Number(row.amountMinor) <= Number(amountMax)),
    );
    return route.fulfill({
      json: {
        items,
        asOf: '2026-11-14T00:00:00.000Z',
        projectionRevision: 'fixture',
        complete: true,
        rowsState: items.length ? 'ready' : 'confirmed-empty',
        aggregateState: 'exact',
        totalCount: items.length,
        totalsByCurrency: [],
        coverage: { examined: items.length, scopeComplete: true },
      },
    });
  });
}

export type SeedFinanceValue = {
  id: string;
  entityType: string;
  scopeKey: string;
  accountId?: string;
  occurredAt?: string;
  value: Record<string, unknown>;
};

export async function seedFinanceSearch(page: Page, values: SeedFinanceValue[]) {
  // Synthetic server acceptance for this UI fixture; real proof authentication/revocation has API tests.
  await page.route('**/api/v1/sync/pull', async (route) => {
    const body = route.request().postDataJSON() as {
      financeCacheOnly?: boolean;
      financeCacheProtocol?: number;
      financeCacheProof?: string | string[];
      financeCursor?: Record<string, number>;
    };
    if (!body.financeCacheOnly) return route.fallback();
    expect(body.financeCacheProtocol).toBe(1);
    const proofs = Array.isArray(body.financeCacheProof)
      ? body.financeCacheProof
      : [body.financeCacheProof];
    expect(proofs.length).toBeGreaterThan(0);
    expect(proofs.every((proof) => proof === 'fc1.synthetic.fixture.proof')).toBe(true);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        changes: [],
        financeChanges: [],
        cursor: {},
        financeCursor: body.financeCursor,
        financeCache: { status: 'current', proof: 'fc1.synthetic.fixture.proof' },
      }),
    });
  });
  await page.evaluate(async (input) => {
    const request = indexedDB.open('naaseh');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keyTransaction = database.transaction('cryptoKeys', 'readwrite');
    const keyStore = keyTransaction.objectStore('cryptoKeys');
    const currentRequest = keyStore.get('device');
    const current = await new Promise<{ key: CryptoKey } | undefined>((resolve, reject) => {
      currentRequest.onsuccess = () =>
        resolve(currentRequest.result as { key: CryptoKey } | undefined);
      currentRequest.onerror = () => reject(currentRequest.error);
    });
    const key =
      current?.key ??
      (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]));
    if (!current) keyStore.put({ id: 'device', key });
    await new Promise<void>((resolve, reject) => {
      keyTransaction.oncomplete = () => resolve();
      keyTransaction.onerror = () => reject(keyTransaction.error);
    });
    const encoder = new TextEncoder();
    const encode = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const cacheGeneration = crypto.randomUUID();
    const encrypted = await Promise.all(
      input.map(async (item) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: encoder.encode(`finance:${item.entityType}:${item.id}:v1`),
          },
          key,
          encoder.encode(JSON.stringify(item.value)),
        );
        return {
          id: item.id,
          entityType: item.entityType,
          scopeKey: item.scopeKey,
          cacheGeneration,
          version: 1,
          updatedAt: '2026-10-28T12:00:00.000Z',
          value: { iv: encode(iv.buffer), ciphertext: encode(ciphertext) },
          ...(item.accountId ? { accountId: item.accountId } : {}),
          ...(item.occurredAt ? { occurredAt: item.occurredAt } : {}),
        };
      }),
    );
    const proofIv = crypto.getRandomValues(new Uint8Array(12));
    const proofCiphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: proofIv,
        additionalData: encoder.encode('finance:delivery:local-steve:v1'),
      },
      key,
      encoder.encode(
        JSON.stringify({
          ownerId: 'local-steve',
          cursor: {},
          cacheGeneration,
          cacheProof: 'fc1.synthetic.fixture.proof',
        }),
      ),
    );
    const write = database.transaction(['secureFinanceRecords', 'settings'], 'readwrite');
    write.objectStore('settings').put({
      key: 'finance-delivery:local-steve',
      value: JSON.stringify({
        version: 1,
        value: { iv: encode(proofIv.buffer), ciphertext: encode(proofCiphertext) },
      }),
    });
    const store = write.objectStore('secureFinanceRecords');
    for (const record of encrypted) store.put(record);
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
    });
    database.close();
  }, values);
}
