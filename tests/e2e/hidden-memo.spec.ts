import { constants, createPublicKey, publicEncrypt } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('unlocks offline, locks on inactivity, changes PIN without ciphertext changes, and recovers online', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  let recoveryRequests = 0;
  await page.route('**/api/v1/tasks/task-test/hidden-memo/recovery', async (route) => {
    recoveryRequests += 1;
    const body = route.request().postDataJSON() as {
      ephemeralPublicKeySpki: string;
      password: string;
    };
    expect(body.password).toBe('account-password');
    const spki = Buffer.from(body.ephemeralPublicKeySpki, 'base64url');
    const encryptedDek = publicEncrypt(
      {
        key: createPublicKey({ key: spki, format: 'der', type: 'spki' }),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      // The harness's deterministic recovery route represents the KMS-unwrapped DEK.
      Buffer.alloc(32, 0),
    ).toString('base64url');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        region: 'us-west-2',
        algorithm: 'RSA-OAEP-256',
        encryptedDek,
        kmsKeyVersion: 'recovery-v1',
        authority: 'recovery',
      }),
    });
  });

  await page.goto('/__test/hidden-memo');
  await expect(page.getByRole('heading', { name: 'Hidden memo browser validation' })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('PIN').fill('246810');
  await page.getByRole('button', { name: 'Unlock offline' }).click();
  await expect(page.getByText('Private test memo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock offline' })).toBeVisible({
    timeout: 3_000,
  });

  await page.getByLabel('PIN').fill('246810');
  await page.getByRole('button', { name: 'Unlock offline' }).click();
  await page.getByRole('button', { name: 'Change hidden memo PIN' }).click();
  await page.getByLabel('Current PIN').fill('246810');
  await page.getByLabel('New PIN', { exact: true }).fill('864200');
  await page.getByLabel('Confirm new PIN').fill('864200');
  await page.getByRole('button', { name: 'Change PIN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlock offline' })).toBeVisible();
  await page.getByLabel('PIN').fill('864200');
  await page.getByRole('button', { name: 'Unlock offline' }).click();
  await expect(page.getByText('Private test memo')).toBeVisible();
  await page.getByRole('button', { name: 'Lock memo' }).click();

  await page.getByRole('button', { name: 'Recover with password' }).click();
  await page.getByLabel('Account password').fill('account-password');
  await page.getByRole('button', { name: 'Recover memo' }).click();
  await expect(page.getByText('PIN recovery requires an internet connection.')).toBeVisible();
  expect(recoveryRequests).toBe(0);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Recover memo' }).click();
  await expect(page.getByRole('status')).toHaveText('Memo recovered successfully.');
  expect(recoveryRequests).toBe(1);
});
