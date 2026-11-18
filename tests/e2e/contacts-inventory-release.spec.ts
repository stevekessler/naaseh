import { expect, test } from '@playwright/test';
import { buildFeatureFixture, installFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { contactsInventoryFixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('Contacts and Inventory fixture installs, upgrades and rolls back on the prepared host', async ({
  page,
}) => {
  const [first, second] = contactsInventoryFixture.releases;
  const setActive = await installFeatureFixture(page, await buildFeatureFixture());
  await signIn(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const inventory = nav.getByRole('button', { name: 'Inventory' });
  const finance = nav.getByRole('button', { name: 'Finance' });
  const featureStatus = page.locator('main').getByRole('status');

  await expect(inventory).toHaveCount(0);
  const financeAvailable = await finance.isVisible();
  setActive(first);
  await page.reload();
  await inventory.click();
  await expect(featureStatus).toHaveText(`inventory: ${first}`);

  setActive(second);
  await page.getByRole('button', { name: 'Check feature release' }).click();
  await expect(featureStatus).toHaveText(`inventory: ${second}`);

  setActive(first);
  await page.getByRole('button', { name: 'Check feature release' }).click();
  await expect(featureStatus).toHaveText(`inventory: ${first}`);

  setActive('incompatible');
  await page.reload();
  await expect(featureStatus).toHaveText('This Contacts and Inventory page is unavailable.');
  await expect(inventory).toHaveCount(0);
  if (financeAvailable) await expect(finance).toBeVisible();

  setActive(null);
  await page.reload();
  await expect(featureStatus).toHaveText('This Contacts and Inventory page is unavailable.');
  await expect(inventory).toHaveCount(0);
});
