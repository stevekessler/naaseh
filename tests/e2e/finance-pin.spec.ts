import { startFinancePinBrowserServer } from '../fixtures/finance/pin-browser-server.js';
import { expect, test as base, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

type PinServer = Awaited<ReturnType<typeof startFinancePinBrowserServer>>;
const test = base.extend<{ pinServer: PinServer }>({
  pinServer: async ({ browser }, use) => {
    if (!browser.isConnected()) throw new Error('The PIN journey needs a connected browser.');
    const server = await startFinancePinBrowserServer();
    try {
      await use(server);
    } finally {
      await server.close();
    }
  },
  baseURL: async ({ pinServer }, use) => {
    await use(pinServer.url);
  },
});
test.use({ serviceWorkers: 'allow' });
async function securityFixture(server: PinServer, protectedInitially = false) {
  server.state.requirePin = protectedInitially;
  server.state.enrolled = protectedInitially;
  server.state.revision = protectedInitially ? 1 : 0;
  return { grants: () => server.state.grants, revoked: () => server.state.revoked };
}
async function unlock(page: Page) {
  await page.getByLabel('Finance PIN', { exact: true }).fill('001234');
  await page.getByRole('button', { name: 'Unlock Finance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock Finance', exact: true })).toBeVisible();
}
/** Real encrypted IndexedDB material, isolated to this synthetic browser context. */
async function pendingAfterPinReset(page: Page, seed = false) {
  return page.evaluate(async (seed) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    type Cipher = { iv: string; ciphertext: string };
    const read = <T>(store: string, id: string) =>
      new Promise<T>((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      });
    const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const base64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
    const key = (await read<{ key: CryptoKey }>('cryptoKeys', 'device')).key;
    const editId = '01K00000000000000000008001',
      receiptId = '01K00000000000000000008002';
    const transactionId = '01K00000000000000000008003',
      receiptMutationId = '01K00000000000000000008004';
    const edit = {
      description: 'Synthetic retained edit',
      entryContext: { localDate: '2021-11-06', timeZone: 'America/Denver' },
    };
    const receipt = { transactionId, filename: 'synthetic.txt' };
    const encrypt = async (plaintext: string, associatedData: string): Promise<Cipher> => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(associatedData) },
        key,
        new TextEncoder().encode(plaintext),
      );
      return { iv: base64(iv.buffer), ciphertext: base64(encrypted) };
    };
    const decrypt = async (value: Cipher, associatedData: string) =>
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
      );
    try {
      if (seed) {
        const createdAt = new Date().toISOString();
        const editPayload = await encrypt(JSON.stringify(edit), `mutation:${editId}`);
        const receiptPayload = await encrypt(
          JSON.stringify(receipt),
          `mutation:${receiptMutationId}`,
        );
        const value = await encrypt(
          btoa('Synthetic retained receipt bytes'),
          `finance:receiptBytes:${receiptId}:v1`,
        );
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            ['outbox', 'secureFinancePendingBytes'],
            'readwrite',
          );
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
          transaction.objectStore('outbox').put({
            id: editId,
            entityType: 'financeTransaction',
            entityId: transactionId,
            operation: 'update',
            baseVersion: 1,
            createdAt,
            attempts: 0,
            payload: editPayload,
          });
          transaction.objectStore('outbox').put({
            id: receiptMutationId,
            entityType: 'financeReceipt',
            entityId: receiptId,
            operation: 'create',
            baseVersion: 0,
            createdAt,
            attempts: 0,
            payload: receiptPayload,
          });
          transaction.objectStore('secureFinancePendingBytes').put({
            id: receiptId,
            ownerId: 'local-steve',
            transactionId,
            mutationId: receiptMutationId,
            version: 1,
            updatedAt: createdAt,
            value,
          });
        });
      }
      const storedEdit = await read<{ payload: Cipher }>('outbox', editId);
      const storedReceipt = await read<{ payload: Cipher }>('outbox', receiptMutationId);
      const storedBytes = await read<{ value: Cipher }>('secureFinancePendingBytes', receiptId);
      return {
        keyNonextractable: key.extractable === false,
        editCipher: storedEdit.payload,
        receiptCipher: storedReceipt.payload,
        bytesCipher: storedBytes.value,
        editRecovered:
          (await decrypt(storedEdit.payload, `mutation:${editId}`)) === JSON.stringify(edit),
        receiptRecovered:
          (await decrypt(storedReceipt.payload, `mutation:${receiptMutationId}`)) ===
          JSON.stringify(receipt),
        bytesRecovered:
          atob(await decrypt(storedBytes.value, `finance:receiptBytes:${receiptId}:v1`)) ===
          'Synthetic retained receipt bytes',
      };
    } finally {
      database.close();
    }
  }, seed);
}
/** Synthetic protected delivery through the built PWA, checked in real IndexedDB. */
async function readCatchUpCheckpoint(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(store: string, key: string) =>
      new Promise<T | undefined>((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error);
      });
    type Cipher = { iv: string; ciphertext: string };
    try {
      const stored = await read<{ version: number; cacheGeneration: string; value: Cipher }>(
        'secureFinanceRecords',
        id,
      );
      const checkpoint = await read<{ value: string }>('settings', 'finance-delivery:local-steve');
      const ordinary = await read<{ value: string }>('settings', 'sync-cursor');
      const key = (await read<{ key: CryptoKey }>('cryptoKeys', 'device'))?.key;
      if (!stored || !checkpoint || !key) return undefined;
      const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const decrypt = async (value: Cipher, associatedData: string) =>
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
      const record = await decrypt(stored.value, `finance:financeBudget:${id}:v${stored.version}`);
      const envelope = JSON.parse(checkpoint.value);
      const delivery = await decrypt(
        envelope.value,
        `finance:delivery:local-steve:v${envelope.version}`,
      );
      return {
        name: record.name,
        version: stored.version,
        cursor: delivery.cursor,
        generationMatches: stored.cacheGeneration === delivery.cacheGeneration,
        keyNonextractable: key.extractable === false,
        encrypted: !JSON.stringify(stored).includes('Caught-up synthetic budget'),
        ordinaryCursor: ordinary ? JSON.parse(ordinary.value) : {},
      };
    } finally {
      database.close();
    }
  }, id);
}

test('enrolls, resets and changes PIN requirements while preserving encrypted pending Finance data', async ({
  page,
  pinServer,
  context,
}) => {
  const f = await securityFixture(pinServer);
  const budgetId = '01K00000000000000000008101';
  const delivered = pinServer.state.financeDeliveryCursors;
  await signIn(page);
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.getByText('Account security', { exact: true }).click();
  await page.getByLabel('Require a Finance PIN').check();
  await page.getByLabel('Current password for Finance security').fill('local');
  await page.getByLabel('New Finance PIN', { exact: true }).fill('001234');
  await page.getByLabel('Confirm new Finance PIN', { exact: true }).fill('001234');
  await page.getByRole('button', { name: 'Save Finance security', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Finance security saved.' }),
  ).toBeVisible();
  await page.goto('/finance/budgets');
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
  expect(f.grants()).toBe(0);
  await page.goto('/finance/budgets');
  await unlock(page);
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible();
  pinServer.state.financeCatchUp = true;
  await expect
    .poll(async () => {
      if (!delivered.length) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      return delivered.length;
    })
    .toBe(3);
  await expect
    .poll(async () => (await readCatchUpCheckpoint(page, budgetId))?.cursor.owner)
    .toBe(3);
  const caughtUp = await readCatchUpCheckpoint(page, budgetId);
  expect(caughtUp).toMatchObject({
    name: 'Caught-up synthetic budget',
    version: 2,
    cursor: { owner: 3 },
    generationMatches: true,
    keyNonextractable: true,
    encrypted: true,
  });
  expect(caughtUp?.ordinaryCursor.owner).not.toBe(777);
  expect(delivered).toEqual([0, 1, 2]);
  pinServer.state.financeCatchUp = false;
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await expect.poll(f.revoked).toBeGreaterThan(0);
  await expect(page.getByLabel('Finance PIN', { exact: true })).toHaveValue('');
  // Keep synthetic Finance writes pending; this journey verifies reset durability,
  // independently of the semantic replay/acknowledgment story.
  await page.route('**/api/v1/finance/sync/push', (route) => route.abort('internetdisconnected'));
  const pending = await pendingAfterPinReset(page, true);
  expect(pending).toMatchObject({
    keyNonextractable: true,
    editRecovered: true,
    receiptRecovered: true,
    bytesRecovered: true,
  });
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.getByText('Account security', { exact: true }).click();
  await page.getByLabel('Require a Finance PIN').check();
  await page.getByLabel('Current password for Finance security').fill('local');
  await page.getByLabel('New Finance PIN', { exact: true }).fill('008765');
  await page.getByLabel('Confirm new Finance PIN', { exact: true }).fill('008765');
  await page.getByRole('button', { name: 'Save Finance security', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Finance security saved.' }),
  ).toBeVisible();
  await page.goto('/finance/budgets');
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await page.getByLabel('Finance PIN', { exact: true }).fill('001234');
  await page.getByRole('button', { name: 'Unlock Finance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await page.getByLabel('Finance PIN', { exact: true }).fill('008765');
  await page.getByRole('button', { name: 'Unlock Finance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock Finance', exact: true })).toBeVisible();
  expect(await pendingAfterPinReset(page)).toEqual(pending);
  const grants = f.grants();
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByLabel('Finance PIN', { exact: true }).fill('008765');
  await page.getByRole('button', { name: 'Unlock Finance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock Finance', exact: true })).toBeVisible();
  expect(f.grants()).toBe(grants);
  expect(await pendingAfterPinReset(page)).toEqual(pending);
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.getByText('Account security', { exact: true }).click();
  await page.getByLabel('Require a Finance PIN').uncheck();
  await page.getByLabel('Current password for Finance security').fill('incorrect');
  await page.getByRole('button', { name: 'Save Finance security', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Unable to save Finance security.' }),
  ).toBeVisible();
  expect(pinServer.state.requirePin).toBe(true);
  await page.goto('/finance/budgets');
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.getByText('Account security', { exact: true }).click();
  await page.getByLabel('Require a Finance PIN').uncheck();
  await page.getByLabel('Current password for Finance security').fill('local');
  await page.getByRole('button', { name: 'Save Finance security', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Finance security saved.' }),
  ).toBeVisible();
  expect(pinServer.state.requirePin).toBe(false);
  await page.goto('/finance/budgets');
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toHaveCount(0);
  expect(await pendingAfterPinReset(page)).toEqual(pending);
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.getByText('Account security', { exact: true }).click();
  await page.getByLabel('Require a Finance PIN').check();
  await page.getByLabel('Current password for Finance security').fill('local');
  await page.getByRole('button', { name: 'Save Finance security', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Finance security saved.' }),
  ).toBeVisible();
  expect(pinServer.state.requirePin).toBe(true);
  await page.goto('/finance/budgets');
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await page.getByLabel('Finance PIN', { exact: true }).fill('008765');
  await page.getByRole('button', { name: 'Unlock Finance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock Finance', exact: true })).toBeVisible();
  expect(await pendingAfterPinReset(page)).toEqual(pending);
});
test('uses the encrypted device verifier offline without persisting or minting an online grant', async ({
  page,
  context,
  pinServer,
}) => {
  const f = await securityFixture(pinServer, true);
  await signIn(page);
  await page.getByRole('button', { name: 'Finance', exact: true }).click();
  await unlock(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
    .toBe('activated');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await unlock(page);
  const grantsBeforeOffline = f.grants();
  const metadata = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('naaseh');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction('secureFinanceOfflineSecurity')
        .objectStore('secureFinanceOfflineSecurity')
        .get('local-steve');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return JSON.stringify(value);
  });
  expect(metadata).not.toContain('001234');
  expect(metadata).not.toContain('g'.repeat(43));
  expect(metadata).toContain('ciphertext');
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await unlock(page);
  expect(f.grants()).toBe(grantsBeforeOffline);
  const persisted = await page.evaluate(() =>
    JSON.stringify({ ...sessionStorage, ...localStorage }),
  );
  expect(persisted).not.toContain('g'.repeat(43));
  expect(persisted).not.toContain('001234');
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  expect(f.grants()).toBe(grantsBeforeOffline);
});

test('uses the cached verifier when the origin is unavailable (separate from network-offline emulation)', async ({
  page,
  pinServer,
}) => {
  const f = await securityFixture(pinServer, true);
  await signIn(page);
  await page.getByRole('button', { name: 'Finance', exact: true }).click();
  await unlock(page);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
    .toBe('activated');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await unlock(page);
  const grants = f.grants();
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await pinServer.close();
  // Keep this origin-outage control distinct from setOffline: WebKit's network flag
  // can reject even local service-worker responses (upstream issue 42775).
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await unlock(page);
  expect(f.grants()).toBe(grants);
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
});
