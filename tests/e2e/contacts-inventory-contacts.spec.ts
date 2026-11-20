import { expect, test, type Page } from '@playwright/test';
import {
  WorkspaceError,
  WorkspaceRepository,
} from '../../apps/api/src/contacts-inventory/repository.js';
import { readWorkspace } from '../../apps/api/src/contacts-inventory/read-routes.js';
import {
  contactFieldsSchema,
  contactPayload,
  parseMutationHeaders,
  prescriberContactTypeId,
} from '../../packages/contacts-inventory-contracts/src/index.js';
import { buildFeatureFixture, installFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

async function mountContacts(page: Page, repo: WorkspaceRepository, actor: string, entry: string) {
  const [release] = fixture.releases;
  const activate = await installFeatureFixture(page, entry);
  activate(release);
  await page.route(`**/api/v1/contacts-inventory/releases/${release}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.split(`/${release}/`)[1] ?? '';
    if (path === 'catalogs')
      return route.fulfill({
        json: {
          contactTypes: [{ id: prescriberContactTypeId, name: 'Prescriber', revision: 1 }],
          generation: 1,
        },
      });
    if (request.method() === 'GET') {
      const result = await readWorkspace(
        repo,
        actor,
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
      kind: 'contact' as const,
      id,
      actor,
      generation: version.generation,
      mutationId: version.mutationId,
    };
    try {
      if (request.method() === 'DELETE' && version.mode === 'update') {
        return route.fulfill({
          json: await repo.mutate({ ...base, action: 'delete', revision: version.revision }),
        });
      }
      const fields = contactPayload(contactFieldsSchema.parse(request.postDataJSON()));
      const result = await repo.mutate(
        version.mode === 'create'
          ? { ...base, action: 'create', fields }
          : { ...base, action: 'update', revision: version.revision, fields },
      );
      return route.fulfill({ status: version.mode === 'create' ? 201 : 200, json: result });
    } catch (error) {
      if (!(error instanceof WorkspaceError)) throw error;
      return route.fulfill({ status: 409, json: { code: error.code } });
    }
  });
  await signIn(page);
  await page.goto('/lists/contacts');
  await expect(page.getByRole('heading', { name: 'Contacts', exact: true })).toBeVisible();
}

test('workspace members create, filter and edit the same contact', async ({
  page,
  browser,
  baseURL,
}) => {
  const repo = new WorkspaceRepository(new MemoryWorkspaceStore());
  const entry = await buildFeatureFixture('contacts');
  await mountContacts(page, repo, fixture.members[0], entry);

  await page.getByRole('button', { name: 'New contact' }).click();
  await expect(page.getByLabel('State', { exact: true })).toHaveValue('CO');
  await page.getByLabel('First Name').fill('Synthetic');
  await page.getByLabel('Last Name').fill('Contact');
  await page.getByLabel('Cell', { exact: true }).fill('303-555-0198');
  await page.getByLabel('Zip', { exact: true }).fill('00123');
  await page.getByLabel('Default Number').selectOption('cell');
  await page.getByLabel('Contact Type', { exact: true }).selectOption('prescriber');
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/contacts/') &&
      response.status() === 201,
  );
  await page.getByRole('button', { name: 'Save contact' }).click();
  const creation = await (await created).json();
  await page.getByLabel('Search contacts').fill('555-0198');
  await page.getByLabel('Filter by contact type').selectOption('prescriber');
  await expect(page.getByRole('button', { name: 'Synthetic Contact' })).toBeVisible();

  const context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    serviceWorkers: 'block',
  });
  try {
    const other = await context.newPage();
    await mountContacts(other, repo, fixture.members[1], entry);
    await other.getByRole('button', { name: 'Synthetic Contact' }).click();
    await expect(other.getByLabel('Zip', { exact: true })).toHaveValue('00123');
    await other.getByLabel('Cell', { exact: true }).fill('');
    await expect(other.getByLabel('Default Number')).toHaveValue('');
    const updated = other.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith(`/contacts/${creation.id}`) &&
        response.status() === 200,
    );
    await other.getByRole('button', { name: 'Save contact' }).click();
    await updated;
    expect((await repo.read({ kind: 'contact', id: creation.id }))?.fields).not.toHaveProperty(
      'defaultNumber',
    );
  } finally {
    await context.close();
  }
});
