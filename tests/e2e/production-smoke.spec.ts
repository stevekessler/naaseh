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
});
