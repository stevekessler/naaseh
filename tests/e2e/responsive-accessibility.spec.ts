import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test('representative responsive pages have no serious or critical axe findings', async ({
  page,
}) => {
  await signIn(page);
  for (const pageName of [
    'Tasks',
    'Personal Stack',
    'Completed Tasks',
    'Lists',
    'Groups',
    'Archive',
    'Projects',
    'Google',
    'Admin',
  ]) {
    await page.getByRole('button', { name: pageName, exact: true }).click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
    ).toEqual([]);
  }
});
