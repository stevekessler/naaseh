import { expect, test, type Page } from '@playwright/test';

const productionUrl = process.env.PRODUCTION_BASE_URL;
const smokeUsername = process.env.PRODUCTION_SMOKE_USERNAME;
const smokePassword = process.env.PRODUCTION_SMOKE_PASSWORD;

async function signIn(page: Page) {
  if (!productionUrl || !smokeUsername || !smokePassword)
    throw new Error('Production smoke credentials are not configured.');
  await page.goto(productionUrl);
  await page.getByLabel('Username').fill(smokeUsername);
  await page.getByLabel('Password').fill(smokePassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByLabel('Username')).not.toBeVisible();
}

function expectNoStore(response: { headers(): Record<string, string> }) {
  expect(response.headers()['cache-control']).toContain('no-store');
}

test('static delivery exposes the safe login shell', async ({ page }) => {
  await page.goto(productionUrl ?? '/');
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
});

test.describe('deployed production canary', () => {
  test.skip(
    !productionUrl || !smokeUsername || !smokePassword,
    'Production endpoint and smoke credentials are required only in the protected deployment job.',
  );

  test('authenticates and performs an authorized sync bootstrap', async ({ page }) => {
    await signIn(page);
    const response = await page.request.get(`${productionUrl}/api/v1/sync/bootstrap`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('tasks');
    expect(body).toHaveProperty('keyRegistry');
    expect(JSON.stringify(body)).not.toMatch(/password|pepper|privateKey|sessionToken/i);
  });

  test('returns a correlated safe error without protected request data', async ({ page }) => {
    await signIn(page);
    const response = await page.request.post(`${productionUrl}/api/v1/sync/push`, {
      data: { mutations: [] },
      headers: { Origin: productionUrl! },
    });
    expect([400, 403]).toContain(response.status());
    const body = await response.text();
    expect(body).toMatch(/correlation|csrf|forbidden|invalid/i);
    expect(body).not.toContain(smokeUsername!);
    expect(body).not.toContain(smokePassword!);
  });

  test('routes Journal and Crisis Plan reads to durable DynamoDB state without mutation', async ({
    page,
  }) => {
    await signIn(page);
    const firstEnvelope = await page.request.get(`${productionUrl}/api/v1/journal/key-envelope`);
    const firstPlan = await page.request.get(`${productionUrl}/api/v1/journal/crisis-plan`);
    expect(firstEnvelope.status()).toBe(200);
    expect(firstPlan.status()).toBe(200);
    expectNoStore(firstEnvelope);
    expectNoStore(firstPlan);

    // Separate HTTP requests execute the Lambda again and must return the same durable records.
    const secondEnvelope = await page.request.get(`${productionUrl}/api/v1/journal/key-envelope`);
    const secondPlan = await page.request.get(`${productionUrl}/api/v1/journal/crisis-plan`);
    expect(secondEnvelope.status()).toBe(200);
    expect(secondPlan.status()).toBe(200);
    expect(await secondEnvelope.json()).toEqual(await firstEnvelope.json());
    expect(await secondPlan.json()).toEqual(await firstPlan.json());
  });

  test('publishes a signed sharing-key registry with no-store caching', async ({ page }) => {
    await signIn(page);
    const response = await page.request.get(
      `${productionUrl}/api/v1/journal/crisis-plan/sharing-key`,
    );
    expect(response.status()).toBe(200);
    expectNoStore(response);
    const registry = (await response.json()) as {
      keyVersion: number;
      publicKeySpki: string;
      signingPublicKeySpki: string;
      signingAlgorithm: string;
      signature: string;
      expiresAt: string;
    };
    expect(registry).toMatchObject({
      keyVersion: 1,
      signingAlgorithm: 'RSA-PSS-SHA256',
      publicKeySpki: expect.any(String),
      signingPublicKeySpki: expect.any(String),
      signature: expect.any(String),
      expiresAt: expect.any(String),
    });
    const signingKey = await crypto.subtle.importKey(
      'spki',
      Buffer.from(registry.signingPublicKeySpki, 'base64url'),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const payload = new TextEncoder().encode(
      [registry.keyVersion, registry.publicKeySpki, registry.expiresAt].join('|'),
    );
    expect(
      await crypto.subtle.verify(
        { name: 'RSA-PSS', saltLength: 32 },
        signingKey,
        Buffer.from(registry.signature, 'base64url'),
        payload,
      ),
    ).toBe(true);
    expect(Date.parse(registry.expiresAt)).toBeGreaterThan(Date.now());
  });

  test('conceals unauthorized broker requests and never permits response caching', async ({
    page,
  }) => {
    await signIn(page);
    const response = await page.request.post(`${productionUrl}/api/v1/journal/crisis-plan/broker`, {
      data: {
        requestId: crypto.randomUUID(),
        ownerId: 'production-smoke-unauthorized-owner',
        planId: crypto.randomUUID(),
        shareVersion: 1,
        keyGeneration: 1,
        ephemeralPublicKeySpki: 'production-smoke-invalid-spki',
      },
      headers: { Origin: productionUrl! },
    });
    expect(response.status()).toBe(403);
    expectNoStore(response);
    const body = await response.text();
    expect(body).toContain('CRISIS_PLAN_ACCESS_DENIED');
    expect(body).not.toContain('production-smoke-unauthorized-owner');
  });
});
