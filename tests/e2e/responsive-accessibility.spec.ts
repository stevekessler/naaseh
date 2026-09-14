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
    'Profile',
    'Completed Tasks',
    'Lists',
    'Global Items',
    'Groups',
    'Archive',
    'Projects',
    'Users and categories',
  ]) {
    if (['Global Items', 'Groups', 'Users and categories'].includes(pageName))
      await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await page
      .getByRole('button', {
        name: pageName === 'Profile' ? /^Signed in as .+\. Open profile$/u : pageName,
        exact: true,
      })
      .click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
    ).toEqual([]);
  }
});
