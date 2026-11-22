import type { Page } from '@playwright/test';

export type SeedValue = {
  id: string;
  entityType: string;
  scopeKey: string;
  accountId?: string;
  occurredAt?: string;
  value: Record<string, unknown>;
};

export async function seedFinanceSearch(page: Page, values: SeedValue[]) {
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
