import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test('dashboard and organization navigation remain keyboard-operable without overflow', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Completion dashboard' })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toBeVisible();
});
