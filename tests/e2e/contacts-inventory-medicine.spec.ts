import { expect, test } from '@playwright/test';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { prescriberContactTypeId } from '../../packages/contacts-inventory-contracts/src/index.js';
import { buildFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { mountWorkspaceStory } from '../fixtures/contacts-inventory-story.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('saves Medicine with a shared prescriber and includes it regardless of status', async ({
  page,
}) => {
  const repo = new WorkspaceRepository(new MemoryWorkspaceStore());
  const id = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
  await repo.mutate({
    id,
    kind: 'contact',
    actor: fixture.members[0],
    generation: 1,
    mutationId: 'seed-contact',
    action: 'create',
    fields: {
      firstName: 'Synthetic clinician',
      contactTypeId: prescriberContactTypeId,
    },
  });
  await mountWorkspaceStory(page, repo, await buildFeatureFixture('contacts'), fixture.members[0]);
  await signIn(page);
  await page.goto('/admin/strength-units');
  await page.getByRole('button', { name: 'mg', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Milligrams');
  await page.getByRole('button', { name: 'Save unit' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Strength unit saved.' })).toBeVisible();

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'New item' }).click();
  await page.getByRole('textbox', { name: 'Item name' }).fill('Synthetic medication');
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption('closet');
  await page.getByRole('combobox', { name: 'Item type', exact: true }).selectOption('medicine');
  await page.getByRole('combobox', { name: 'Who’s Med', exact: true }).selectOption('both');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('discontinued');
  await page.getByRole('combobox', { name: 'Time Taken', exact: true }).selectOption('night');
  await page.getByRole('combobox', { name: 'Prescriber', exact: true }).selectOption(id);
  await page
    .getByRole('combobox', { name: 'Strength unit', exact: true })
    .selectOption({ label: 'Milligrams' });
  await page.getByRole('spinbutton', { name: 'Strength number', exact: true }).fill('2.5');
  await page.getByRole('textbox', { name: 'Dose', exact: true }).fill('½ tablet');
  await page.getByRole('checkbox', { name: 'Include on Med List', exact: true }).check();
  const save = page.waitForResponse(
    (response) =>
      response.url().includes('/items/') &&
      response.request().method() === 'PUT' &&
      response.status() === 201,
  );
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  const { id: medicineId } = await (await save).json();
  expect((await repo.read({ kind: 'item', id: medicineId }))?.fields).toMatchObject({
    strengthNumber: 2.5,
    strengthUnitId: 'mg',
    prescriberId: id,
    status: 'discontinued',
  });
  await page
    .getByRole('combobox', { name: 'Filter by item type', exact: true })
    .selectOption('medicine');
  await page
    .getByRole('combobox', { name: 'Filter by status', exact: true })
    .selectOption('current');
  await expect(page.getByText('No matching items.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter by item type', exact: true }).selectOption('');
  await expect(page.getByRole('combobox', { name: 'Filter by status', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Synthetic medication', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Medication List', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Medication List', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Synthetic medication', exact: true }),
  ).toBeVisible();
});
