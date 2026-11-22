import { expect, test } from '@playwright/test';
import {
  WorkspaceError,
  WorkspaceRepository,
} from '../../apps/api/src/contacts-inventory/repository.js';
import { readWorkspace } from '../../apps/api/src/contacts-inventory/read-routes.js';
import {
  itemFieldsSchema,
  locationSchema,
  parseMutationHeaders,
  type InventoryLocation,
} from '../../packages/contacts-inventory-contracts/src/index.js';
import { buildFeatureFixture, installFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('creates a multiline location, saves an item and filters inventory', async ({ page }) => {
  const repo = new WorkspaceRepository(new MemoryWorkspaceStore());
  const locations: InventoryLocation[] = [];
  const [release] = fixture.releases;
  const activate = await installFeatureFixture(page, await buildFeatureFixture('contacts'));
  activate(release);
  await page.route(`**/api/v1/contacts-inventory/releases/${release}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.split(`/${release}/`)[1] ?? '';
    if (path === 'catalogs')
      return route.fulfill({ json: { locations, contactTypes: [], generation: 1 } });
    if (path.startsWith('catalogs/locations/') && request.method() === 'PUT') {
      const result = locationSchema.parse({
        ...request.postDataJSON(),
        id: path.split('/')[2],
        revision: 1,
      });
      locations.push(result);
      return route.fulfill({ status: 201, json: result });
    }
    if (request.method() === 'GET') {
      const result = await readWorkspace(
        repo,
        fixture.members[0],
        fixture.workspace,
        path,
        Object.fromEntries(url.searchParams),
        request.headers(),
      );
      return route.fulfill({ status: result ? 200 : 404, json: result ?? {} });
    }
    const version = parseMutationHeaders(request.headers());
    const id = path.split('/')[1];
    if (!version || !id) return route.fulfill({ status: 400, json: {} });
    const base = {
      kind: 'item' as const,
      id,
      actor: fixture.members[0],
      generation: version.generation,
      mutationId: version.mutationId,
    };
    try {
      const result = await repo.mutate(
        request.method() === 'DELETE' && version.mode === 'update'
          ? { ...base, action: 'delete', revision: version.revision }
          : version.mode === 'create'
            ? { ...base, action: 'create', fields: itemFieldsSchema.parse(request.postDataJSON()) }
            : {
                ...base,
                action: 'update',
                revision: version.revision,
                fields: itemFieldsSchema.parse(request.postDataJSON()),
              },
      );
      return route.fulfill({ status: version.mode === 'create' ? 201 : 200, json: result });
    } catch (error) {
      if (!(error instanceof WorkspaceError)) throw error;
      return route.fulfill({ status: 409, json: { code: error.code } });
    }
  });

  await signIn(page);
  await page.goto('/admin/locations');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Linen closet');
  await page
    .getByRole('textbox', { name: 'Location details', exact: true })
    .fill('Top shelf\nBlue basket');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Location saved.' })).toBeVisible();
  expect(locations[0]?.details).toBe('Top shelf\nBlue basket');

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'New item' }).click();
  await page.getByRole('textbox', { name: 'Item name', exact: true }).fill('Travel bag');
  await page
    .getByRole('combobox', { name: 'Location', exact: true })
    .selectOption({ label: 'Linen closet' });
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/items/') &&
      response.status() === 201,
  );
  await page.getByRole('button', { name: 'Save item' }).click();
  const creation = await (await created).json();
  await page.getByRole('searchbox', { name: 'Search inventory' }).fill('travel');
  await page
    .getByRole('combobox', { name: 'Filter by location', exact: true })
    .selectOption({ label: 'Linen closet' });
  await page.getByRole('button', { name: 'Travel bag', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(
    'Travel bag',
  );
  await expect(page).toHaveURL(new RegExp(`/inventory/${creation.id}$`));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete item', exact: true }).click();
  await expect(page.getByText('This item is unavailable.')).toBeVisible();
  await expect.poll(() => repo.read({ kind: 'item', id: creation.id })).toBeNull();
});
