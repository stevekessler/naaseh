import { expect, test } from '@playwright/test';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { buildFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { mountWorkspaceStory } from '../fixtures/contacts-inventory-story.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('independent feature Search scopes default off and suppress an unauthorized snapshot', async ({
  page,
}) => {
  const repo = new WorkspaceRepository(new MemoryWorkspaceStore());
  const actor = fixture.members[0];
  await repo.mutate({
    id: 'b4d02419-80af-4a8f-b710-1a49e7ca3000',
    kind: 'contact',
    actor,
    generation: 1,
    mutationId: 'contact',
    action: 'create',
    fields: { firstName: 'Fixture contact' },
  });
  await repo.mutate({
    id: 'b4d02419-80af-4a8f-b710-1a49e7ca3001',
    kind: 'item',
    actor,
    generation: 1,
    mutationId: 'base',
    action: 'create',
    fields: { type: 'base', name: 'Fixture inventory', locationId: 'closet' },
  });
  await repo.mutate({
    id: 'b4d02419-80af-4a8f-b710-1a49e7ca3002',
    kind: 'item',
    actor,
    generation: 1,
    mutationId: 'medicine',
    action: 'create',
    fields: {
      type: 'medicine',
      name: 'Fixture medicine',
      locationId: 'closet',
      whoMed: 'both',
      status: 'current',
      timeTaken: 'night',
    },
  });
  const access = { allowed: true };
  await mountWorkspaceStory(page, repo, await buildFeatureFixture('contacts'), actor, access);
  await signIn(page);
  await page.goto('/search');
  const scopes = ['Contacts', 'Inventory Items', 'Medicine'];
  const titles = ['Fixture contact', 'Fixture inventory', 'Fixture medicine'];
  for (const scope of scopes)
    await expect(page.getByRole('checkbox', { name: scope, exact: true })).not.toBeChecked();
  await page.getByRole('searchbox', { name: 'Search tasks and list items' }).fill('Fixture');
  for (let mask = 0; mask < 8; mask++) {
    for (let index = 0; index < scopes.length; index++) {
      const selected = Boolean(mask & (1 << index));
      await page.getByRole('checkbox', { name: scopes[index], exact: true }).setChecked(selected);
    }
    for (let index = 0; index < titles.length; index++) {
      const link = page.getByRole('button', { name: titles[index], exact: true });
      if (mask & (1 << index)) await expect(link).toBeVisible();
      else await expect(link).toHaveCount(0);
    }
  }
  const deleted = await repo.read({ kind: 'contact', id: 'b4d02419-80af-4a8f-b710-1a49e7ca3000' });
  if (!deleted) throw new Error('Fixture contact was missing');
  await repo.mutate({
    kind: 'contact',
    id: deleted.id,
    actor: fixture.members[1],
    action: 'delete',
    revision: deleted.revision,
    generation: 1,
    mutationId: 'delete-contact',
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: 'Fixture contact', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset Contacts and Inventory scopes' }).click();
  for (const scope of scopes)
    await expect(page.getByRole('checkbox', { name: scope, exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Inventory Items', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Medicine', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Fixture inventory', exact: true })).toBeVisible();
  access.allowed = false;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: 'Fixture inventory', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fixture medicine', exact: true })).toHaveCount(0);
});
