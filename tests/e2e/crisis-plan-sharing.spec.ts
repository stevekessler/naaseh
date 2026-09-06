import { expect, test } from '@playwright/test';
import { webcrypto } from 'node:crypto';
import { signIn } from './enhanced-helpers.js';

test('owner uses Select2 to grant immediate read-only Crisis Plan access', async ({ page }) => {
  const sharing = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const publicKeySpki = Buffer.from(
    await webcrypto.subtle.exportKey('spki', sharing.publicKey),
  ).toString('base64url');
  const signing = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const signingPublicKeySpki = Buffer.from(
    await webcrypto.subtle.exportKey('spki', signing.publicKey),
  ).toString('base64url');
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const signature = Buffer.from(
    await webcrypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: 32 },
      signing.privateKey,
      new TextEncoder().encode([1, publicKeySpki, expiresAt].join('|')),
    ),
  ).toString('base64url');
  let createdGrant: Record<string, unknown> | undefined;
  await page.route('**/api/v1/journal/crisis-plan/shares', async (route) => {
    if (route.request().method() === 'GET')
      await route.fulfill({ json: { shares: [], rotationState: 'current' } });
    else {
      const body = route.request().postDataJSON() as {
        recipientId: string;
        grant: Record<string, unknown>;
      };
      createdGrant = body.grant;
      await route.fulfill({
        status: 201,
        json: {
          planId: body.grant.planId,
          ownerId: body.grant.ownerId,
          recipientId: body.recipientId,
          version: 1,
          state: 'active',
          grant: body.grant,
          updatedAt: new Date().toISOString(),
        },
      });
    }
  });
  await page.route('**/api/v1/journal/crisis-plan/shares/recipient-1/revoke', async (route) => {
    const body = route.request().postDataJSON() as {
      keyGeneration: number;
      body: object;
      ownerWrap: object;
    };
    const now = new Date().toISOString();
    await route.fulfill({
      json: {
        plan: {
          planId: createdGrant?.planId,
          ownerId: createdGrant?.ownerId,
          version: 2,
          keyGeneration: body.keyGeneration,
          rotationState: 'current',
          body: body.body,
          ownerWrap: body.ownerWrap,
          createdAt: now,
          updatedAt: now,
        },
        shares: [
          {
            planId: createdGrant?.planId,
            ownerId: createdGrant?.ownerId,
            recipientId: 'recipient-1',
            version: 2,
            state: 'revoked',
            updatedAt: now,
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/journal/crisis-plan/shareable-users**', (route) =>
    route.fulfill({
      json: { users: [{ id: 'recipient-1', displayName: 'Trusted Person', username: 'trusted' }] },
    }),
  );
  await page.route('**/api/v1/journal/crisis-plan/sharing-key', (route) =>
    route.fulfill({
      json: {
        keyVersion: 1,
        publicKeySpki,
        signingPublicKeySpki,
        signingAlgorithm: 'RSA-PSS-SHA256',
        signature,
        expiresAt,
      },
    }),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Journal PIN').fill('246810');
  await page.getByRole('button', { name: 'Create Journal' }).click();
  await page.getByRole('button', { name: 'Crisis Plans' }).click();
  await page
    .getByRole('textbox', { name: 'Crisis Plan', exact: true })
    .fill('Call my trusted person.');
  await page.getByRole('button', { name: 'Save Crisis Plan' }).click();
  await page.locator('.select2-selection').click();
  await page.locator('.select2-search__field').fill('tr');
  await page.getByRole('option', { name: /Trusted Person/u }).click();
  await expect(page.getByText(/can now view this Crisis Plan while online/u)).toBeVisible();
  const revoke = page.getByRole('button', { name: 'Revoke access' });
  await expect(revoke).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await revoke.click();
  await expect(revoke).not.toBeVisible();
});
