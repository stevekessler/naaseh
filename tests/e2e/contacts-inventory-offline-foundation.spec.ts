import { expect, test } from '@playwright/test';
import { buildFeatureFixture, installFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { contactsInventoryFixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('Contacts and Inventory encrypts pending edits and purges them when deletion syncs', async ({
  page,
}) => {
  const activate = await installFeatureFixture(page, await buildFeatureFixture('offline'));
  activate(contactsInventoryFixture.releases[0]);
  await signIn(page);
  await page.goto('/lists/contacts');
  const status = page.locator('main').getByRole('status');
  await expect(status).toHaveText('0 local records, 0 queued changes');
  await page.getByRole('button', { name: 'Cache synthetic contact' }).click();
  await expect(status).toHaveText('1 local records, 0 queued changes');
  await page.getByRole('button', { name: 'Queue synthetic edit' }).click();
  await expect(status).toHaveText('1 local records, 1 queued changes');
  await page.reload();
  await expect(status).toHaveText('1 local records, 1 queued changes');

  const readQueued = () =>
    page.evaluate(
      () =>
        new Promise<Array<{ ciphertext?: string; status: string }>>((resolve, reject) => {
          const open = indexedDB.open('naaseh-contacts-inventory');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const database = open.result;
            const rows = database.transaction('outbox').objectStore('outbox').getAll();
            rows.onerror = () => {
              database.close();
              reject(rows.error);
            };
            rows.onsuccess = () => {
              database.close();
              resolve(rows.result);
            };
          };
        }),
    );
  const [queued] = await readQueued();
  expect(queued?.ciphertext).toBeTruthy();
  expect(queued?.ciphertext).not.toContain('Synthetic queued edit');

  activate(null);
  await page.reload();
  await expect(status).toHaveText('This Contacts and Inventory page is unavailable.');
  const confirmation = new Promise<string>((resolve) =>
    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
      resolve(dialog.message());
    }),
  );
  await page.getByRole('button', { name: 'Sign out' }).click();
  expect(await confirmation).toContain('1 change waiting to sync');

  activate(contactsInventoryFixture.releases[0]);
  await page.reload();
  await page.getByRole('button', { name: 'Apply tombstone' }).click();
  await expect(status).toHaveText('0 local records, 0 queued changes');
  const [deleted] = await readQueued();
  expect(deleted?.status).toBe('deleted');
  expect(deleted?.ciphertext).toBeUndefined();
});

test('retains an encrypted draft until the user applies it to a restored workspace', async ({
  page,
}) => {
  const activate = await installFeatureFixture(page, await buildFeatureFixture('offline'));
  activate(contactsInventoryFixture.releases[0]);
  await signIn(page);
  await page.goto('/lists/contacts');
  const status = page.locator('main').getByRole('status');
  await page.getByRole('button', { name: 'Cache synthetic contact' }).click();
  await expect(status).toHaveText('1 local records, 0 queued changes');
  await page.getByRole('button', { name: 'Queue synthetic edit' }).click();
  await expect(status).toHaveText('1 local records, 1 queued changes');
  await page.getByRole('button', { name: 'Restore workspace' }).click();
  await expect(status).toHaveText('1 local records, 0 queued changes');
  await page.reload();
  await page.getByRole('button', { name: 'Review and apply draft' }).click();
  await expect(status).toHaveText('1 local records, 1 queued changes');
});
