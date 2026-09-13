import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test('owner creates a Crisis Plan, journals, sees it for a crisis answer, and reopens the entry', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Journal PIN', { exact: true }).fill('246810');
  await page.getByLabel('Confirm Journal PIN', { exact: true }).fill('246810');
  await page.getByRole('button', { name: 'Create Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New entry' }).click();
  await expect(page.getByRole('heading', { name: 'Create your Crisis Plan' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Crisis Plan', exact: true })
    .fill('Call my trusted person and use my coping skills.');
  await page.getByRole('button', { name: 'Save Crisis Plan' }).click();
  await expect(page.getByText('Crisis Plan saved.')).toBeVisible();
  await page.getByRole('button', { name: 'New entry' }).click();
  await page
    .getByRole('group', { name: /Suicidal behaviors/u })
    .getByLabel('Yes')
    .check();
  await expect(page.getByRole('heading', { name: 'Your Crisis Plan' })).toBeVisible();
  await expect(page.getByText(/Call my trusted person/u)).toBeVisible();
  await page
    .getByRole('group', { name: /Suicidal behaviors/u })
    .getByLabel('No')
    .check();
  await page
    .getByRole('group', { name: /Self-harm behaviors/u })
    .getByLabel('Yes')
    .check();
  await expect(page.getByRole('heading', { name: 'Your Crisis Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Save encrypted entry' }).click();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Journal' })).toBeVisible();
  await page.getByLabel('Journal PIN', { exact: true }).fill('246810');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: /Read or edit entry/u }).click();
  await page.getByRole('spinbutton', { name: 'Hours of sleep' }).fill('7.5');
  await page.getByRole('button', { name: 'Save encrypted entry' }).click();
  await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
});
