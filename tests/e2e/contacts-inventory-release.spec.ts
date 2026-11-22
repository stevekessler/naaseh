import { expect, test } from '@playwright/test';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { mountWorkspaceStory } from '../fixtures/contacts-inventory-story.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
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

test('keeps the same stored item across install, upgrade, and rollback', async ({ page }) => {
  const [first, second] = contactsInventoryFixture.releases;
  const repository = new WorkspaceRepository(new MemoryWorkspaceStore());
  const activate = await mountWorkspaceStory(
    page,
    repository,
    await buildFeatureFixture('contacts'),
    contactsInventoryFixture.members[0],
  );
  await signIn(page);
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'New item' }).click();
  await page.getByRole('textbox', { name: 'Item name' }).fill('Release compatibility item');
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption('closet');
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/${first}/items/`) &&
      response.request().method() === 'PUT' &&
      response.status() === 201,
  );
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  const { id } = await (await saved).json();

  for (const version of [second, first]) {
    activate(version);
    const checkpoint = page.waitForResponse(
      (response) =>
        response.url().includes(`/${version}/sync/checkpoint`) && response.status() === 200,
    );
    await page.goto(`/inventory/${id}`);
    await checkpoint;
    await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(
      'Release compatibility item',
    );
  }
});
