import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('names and forgets this browser and another remembered browser in profile settings', async ({
  page,
}) => {
  const now = '2026-09-20T00:00:00.000Z';
  const later = '2026-10-20T00:00:00.000Z';
  const macId = 'a'.repeat(64);
  const ipadId = 'b'.repeat(64);
  const devices = [
    {
      id: macId,
      label: 'Chrome on Mac',
      createdAt: now,
      lastUsedAt: now,
      expiresAt: later,
      current: true,
    },
    {
      id: ipadId,
      label: 'Chrome on iPad',
      createdAt: now,
      lastUsedAt: now,
      expiresAt: later,
      current: false,
    },
  ];
  const deleted: string[] = [];

  await page.route('**/api/v1/profile/security', (route) =>
    route.fulfill({ json: { tfaStatus: 'enabled', enrolledAt: now, recoveryCodesRemaining: 5 } }),
  );
  await page.route('**/api/v1/profile/security/trusted-devices', (route) =>
    route.fulfill({ json: { devices } }),
  );
  await page.route('**/api/v1/profile/security/trusted-devices/*', (route) => {
    const id = route.request().url().split('/').at(-1) ?? '';
    if (route.request().method() === 'PATCH') {
      const label = (route.request().postDataJSON() as { label: string }).label;
      const device = devices.find((candidate) => candidate.id === id);
      if (device) device.label = label;
      return route.fulfill({ json: { label } });
    }
    deleted.push(id);
    return route.fulfill({ json: { forgotten: true } });
  });

  await signIn(page);
  await page.getByRole('button', { name: /^Signed in as .+\. Open profile$/u }).click();
  await page.getByText('Account security', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Remembered browsers' })).toBeVisible();
  const mac = page.locator('.remembered-browsers li').filter({ hasText: 'Chrome on Mac' });
  await expect(mac).toContainText('this browser');
  await mac.getByRole('textbox', { name: 'Browser name' }).fill('Steve’s MacBook Pro');
  await mac.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('.remembered-browsers li').first()).toContainText(
    'Steve’s MacBook Pro',
  );

  await page.getByRole('button', { name: 'Forget Chrome on iPad' }).click();
  await expect(page.locator('.remembered-browsers li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Forget this browser' }).click();
  await expect(page.getByText('No browsers are currently remembered.')).toBeVisible();
  expect(deleted).toEqual([ipadId, macId]);
});
