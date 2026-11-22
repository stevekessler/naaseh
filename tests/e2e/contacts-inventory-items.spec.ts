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
  type ImagePointer,
} from '../../packages/contacts-inventory-contracts/src/index.js';
import { buildFeatureFixture, installFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test('creates a multiline location, saves an item and filters inventory', async ({ page }) => {
  const repo = new WorkspaceRepository(new MemoryWorkspaceStore());
  const locations: InventoryLocation[] = [];
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR8sAAAAASUVORK5CYII=',
    'base64',
  );
  let image: ImagePointer | undefined;
  let imageGeneration = 0;
  let shouldRejectImage = false;
  let uploads = 0;
  await page.route('**/test-inventory-upload', (route) => {
    uploads++;
    return route.fulfill({ status: 200, headers: { 'x-amz-version-id': 'fixture-version' } });
  });

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
    const media = /^items\/([^/]+)\/image(?:\/candidates(?:\/([^/]+)(\/confirm)?)?)?$/u.exec(path);
    if (media?.[1]) {
      const itemId = media[1];
      if (path.endsWith('/candidates')) {
        const { id } = request.postDataJSON();
        return route.fulfill({
          status: 201,
          json: {
            id,
            state: 'pending_upload',
            uploadUrl: new URL('/test-inventory-upload', request.url()).href,
          },
        });
      }
      if (media[2] && media[3]) {
        if (shouldRejectImage) return route.fulfill({ json: { state: 'failed' } });
        const item = await repo.read({ kind: 'item', id: itemId });
        if (!item) return route.fulfill({ status: 404 });
        image = { id: media[2], mediaType: 'image/png', bytes: imageBytes.length };
        imageGeneration++;
        await repo.mutate({
          kind: 'item',
          id: itemId,
          action: 'update',
          revision: item.revision,
          generation: 1,
          actor: fixture.members[0],
          mutationId: media[2],
          fields: item.fields,
        });
        return route.fulfill({ json: { state: 'active', image } });
      }
      if (!image) return route.fulfill({ status: 404 });
      return route.fulfill({
        status: 206,
        headers: {
          'content-type': image.mediaType,
          'content-range': `bytes 0-${imageBytes.length - 1}/${imageBytes.length}`,
          etag: `"${imageGeneration}-${image.id}"`,
        },
        body: imageBytes,
      });
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
      if (image && result && 'changes' in result) {
        for (const change of result.changes) {
          if (change.record?.kind === 'item' && !('deleted' in change.record))
            Object.assign(change.record, { image, imageGeneration });
        }
      }
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
  await expect(page).toHaveURL((url) => url.pathname === `/inventory/${creation.id}`);
  const upload = page.getByLabel('Choose an image', { exact: true });
  await upload.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: imageBytes });
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(
    page.getByText('Image changes require a connection.', { exact: false }),
  ).toBeVisible();
  expect(uploads).toBe(0);
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Upload image', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Inventory item', exact: true })).toBeVisible();
  expect(uploads).toBe(1);
  shouldRejectImage = true;
  await upload.setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: imageBytes,
  });
  await page.getByRole('button', { name: 'Replace image', exact: true }).click();
  await expect(page.getByText('The new image was not saved.', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Inventory item', exact: true })).toBeVisible();
  expect(uploads).toBe(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete item', exact: true }).click();
  await expect(page.getByText('This item is unavailable.')).toBeVisible();
  await expect.poll(() => repo.read({ kind: 'item', id: creation.id })).toBeNull();
});
