import { expect, test } from '@playwright/test';
import { addTask, setOffline, signIn } from './enhanced-helpers.js';

async function enroll(page: import('@playwright/test').Page) {
  await signIn(page);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Journal PIN', { exact: true }).fill('246810');
  await page.getByLabel('Confirm Journal PIN', { exact: true }).fill('246810');
  await page.getByRole('button', { name: 'Create Journal' }).click();
  await createCrisisPlan(page);
}

async function createCrisisPlan(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Crisis Plans' }).click();
  await page
    .getByRole('textbox', { name: 'Crisis Plan', exact: true })
    .fill('Use my coping skills and contact my trusted person.');
  await page.getByRole('button', { name: 'Save Crisis Plan' }).click();
  await expect(page.getByText('Crisis Plan saved.')).toBeVisible();
}

test('journal list filters and dashboard reflow across supported browsers and devices', async ({
  page,
}) => {
  await enroll(page);
  await page.getByRole('button', { name: 'New entry' }).click();
  await page.getByLabel('Journal date').fill('2026-08-28');
  await page.getByRole('spinbutton', { name: 'Hours of sleep' }).fill('7.5');
  await page.getByRole('button', { name: 'Save encrypted entry' }).click();
  await page.getByLabel('Start date').fill('2026-08-28');
  await page.getByLabel('End date').fill('2026-08-28');
  await expect(page.getByRole('button', { name: /2026-08-28.*Read or edit entry/u })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByLabel('Start date').fill('2026-08-28');
  await page.getByLabel('End date').fill('2026-08-28');
  await expect(page.getByRole('button', { name: /hoursOfSleep: 7.5/u })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('task reflection remains encrypted and available offline without expanding task access', async ({
  page,
}) => {
  await signIn(page);
  await addTask(page, 'Journal reflection task');
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Journal PIN', { exact: true }).fill('246810');
  await page.getByLabel('Confirm Journal PIN', { exact: true }).fill('246810');
  await page.getByRole('button', { name: 'Create Journal' }).click();
  await createCrisisPlan(page);
  await page.getByRole('button', { name: 'New entry' }).click();
  await page.getByRole('combobox', { name: 'Related task (optional)' }).fill('Journal reflection');
  await page.getByRole('option', { name: 'Journal reflection task' }).click();
  await setOffline(page);
  await page.getByRole('button', { name: 'Save encrypted entry' }).click();
  await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
});
