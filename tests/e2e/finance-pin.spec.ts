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
test('enrolls with the password and protects direct links, cancellation and later visits', async ({
  page,
  pinServer,
}) => {
  const f = await securityFixture(pinServer);
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
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Finance', exact: true })).toBeVisible();
  await expect.poll(f.revoked).toBeGreaterThan(0);
  await expect(page.getByLabel('Finance PIN', { exact: true })).toHaveValue('');
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
