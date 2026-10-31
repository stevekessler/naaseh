import { expect, test, type Page } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

type SeedValue = {
  id: string;
  entityType: string;
  scopeKey: string;
  accountId?: string;
  occurredAt?: string;
  value: Record<string, unknown>;
};

async function seedFinanceSearch(page: Page, values: SeedValue[]) {
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
          version: 1,
          updatedAt: '2026-10-28T12:00:00.000Z',
          value: { iv: encode(iv.buffer), ciphertext: encode(ciphertext) },
          ...(item.accountId ? { accountId: item.accountId } : {}),
          ...(item.occurredAt ? { occurredAt: item.occurredAt } : {}),
        };
      }),
    );
    const write = database.transaction('secureFinanceRecords', 'readwrite');
    const store = write.objectStore('secureFinanceRecords');
    for (const record of encrypted) store.put(record);
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
    });
    database.close();
  }, values);
}

const records: SeedValue[] = [
  {
    id: 'account-a',
    entityType: 'financeAccount',
    scopeKey: 'OWNER#local-steve',
    value: { id: 'account-a', friendlyName: 'Household checking', status: 'active' },
  },
  {
    id: 'account-b',
    entityType: 'financeAccount',
    scopeKey: 'OWNER#local-steve',
    value: { id: 'account-b', friendlyName: 'Vacation savings', status: 'active' },
  },
  {
    id: 'transaction-a',
    entityType: 'financeTransaction',
    scopeKey: 'OWNER#local-steve',
    accountId: 'account-a',
    occurredAt: '2026-10-20T12:00:00.000Z',
    value: {
      id: 'transaction-a',
      accountId: 'account-a',
      description: 'Juniper groceries',
      effectiveAt: '2026-10-20T12:00:00.000Z',
      amountMinor: -4250,
      currency: 'USD',
      pending: false,
      status: 'active',
    },
  },
  {
    id: 'transaction-b',
    entityType: 'financeTransaction',
    scopeKey: 'OWNER#local-steve',
    accountId: 'account-b',
    occurredAt: '2026-10-21T12:00:00.000Z',
    value: {
      id: 'transaction-b',
      accountId: 'account-b',
      description: 'Juniper hotel',
      effectiveAt: '2026-10-21T12:00:00.000Z',
      pending: true,
      status: 'active',
    },
  },
  {
    id: 'transaction-secret',
    entityType: 'financeTransaction',
    scopeKey: 'GROUP#revoked',
    accountId: 'account-secret',
    occurredAt: '2026-10-22T12:00:00.000Z',
    value: {
      id: 'transaction-secret',
      accountId: 'account-secret',
      description: 'Juniper inaccessible',
      effectiveAt: '2026-10-22T12:00:00.000Z',
      pending: false,
      status: 'active',
    },
  },
  {
    id: 'merchant-a',
    entityType: 'financeMerchant',
    scopeKey: 'PUBLIC',
    value: {
      id: 'merchant-a',
      name: 'Juniper Coffee',
      city: 'Denver',
      region: 'CO',
      status: 'active',
    },
  },
];

test('Finance types are opt-in and mixed results respect account scope', async ({ page }) => {
  await signIn(page);
  await seedFinanceSearch(page, records);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search all work' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Tasks' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Lists' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Transactions' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Merchants' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Transactions' }).check();
  await page.getByRole('checkbox', { name: 'Merchants' }).check();
  await page.getByLabel('Search tasks and list items').fill('juniper');
  const results = page.getByRole('table', { name: 'Search results' });
  await expect(results.getByRole('link', { name: 'Juniper groceries' })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Juniper hotel' })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Juniper Coffee' })).toBeVisible();
  await expect(page.getByText('Juniper inaccessible')).toHaveCount(0);
  await page.getByLabel('Transaction account').selectOption('account-a');
  await expect(results.getByRole('link', { name: 'Juniper groceries' })).toBeVisible();
  await expect(results.getByRole('link', { name: 'Juniper hotel' })).toHaveCount(0);
  await expect(page).toHaveURL(/transactions=1/);
  await expect(page).not.toHaveURL(/juniper/i);
});

test('Finance search remains complete for synchronized data offline', async ({ page, context }) => {
  await signIn(page);
  await seedFinanceSearch(page, records);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Transactions' }).check();
  await page.getByLabel('Search tasks and list items').fill('juniper');
  await expect(page.getByRole('link', { name: 'Juniper groceries' })).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(
    page.getByText(
      'Offline results include all Finance data already synchronized to this browser.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Juniper groceries' })).toBeVisible();
});

test('Finance empty state and controls remain accessible on a phone layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Transactions' }).check();
  await page.getByLabel('Search tasks and list items').fill('nothing matches');
  await expect(page.getByText('No selected content matches “nothing matches”.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Include content types' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Search results' })).toHaveCount(1);
});

test('Finance indexing failures keep ordinary search available', async ({ page }) => {
  await signIn(page);
  await seedFinanceSearch(page, [records[0]!]);
  await page.evaluate(async () => {
    const request = indexedDB.open('naaseh');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('secureFinanceRecords', 'readwrite');
    const store = transaction.objectStore('secureFinanceRecords');
    const get = store.get('account-a');
    const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
      get.onsuccess = () => resolve(get.result as Record<string, unknown>);
      get.onerror = () => reject(get.error);
    });
    store.put({ ...record, value: { iv: 'invalid', ciphertext: 'invalid' } });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Transactions' }).check();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Finance search is unavailable' }),
  ).toHaveText('Finance search is unavailable. Tasks and lists remain searchable.');
  await expect(page.getByRole('checkbox', { name: 'Tasks' })).toBeChecked();
});
