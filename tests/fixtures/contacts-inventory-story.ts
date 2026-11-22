import type { Page } from '@playwright/test';
import {
  WorkspaceError,
  WorkspaceRepository,
} from '../../apps/api/src/contacts-inventory/repository.js';
import { readWorkspace } from '../../apps/api/src/contacts-inventory/read-routes.js';
import {
  contactFieldsSchema,
  contactPayload,
  defaultStrengthUnits,
  itemFieldsSchema,
  itemPayload,
  parseMutationHeaders,
  prescriberContactTypeId,
} from '../../packages/contacts-inventory-contracts/src/index.js';
import { installFeatureFixture } from './contacts-inventory-host.js';
import { contactsInventoryFixture as fixture } from './contacts-inventory.js';

export async function mountWorkspaceStory(
  page: Page,
  repo: WorkspaceRepository,
  entry: string,
  actor: string,
  access = { allowed: true },
) {
  const setManifest = await installFeatureFixture(page, entry);
  let active: (typeof fixture.releases)[number] | null = fixture.releases[0];
  setManifest(active);
  const units = defaultStrengthUnits.map((unit) => ({ ...unit }));
  await page.route('**/api/v1/contacts-inventory/releases/*/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const prefix = '/api/v1/contacts-inventory/releases/';
    const versionAndPath = url.pathname.slice(prefix.length);
    const separator = versionAndPath.indexOf('/');
    if (versionAndPath.slice(0, separator) !== active)
      return route.fulfill({ status: 410, json: { code: 'stale_release' } });
    const path = versionAndPath.slice(separator + 1);
    if (!access.allowed) return route.fulfill({ status: 403, json: { code: 'forbidden' } });
    if (path === 'catalogs')
      return route.fulfill({
        json: {
          locations: [{ id: 'closet', name: 'Linen closet', revision: 1 }],
          contactTypes: [{ id: prescriberContactTypeId, name: 'Prescriber', revision: 1 }],
          strengthUnits: units,
          generation: 1,
        },
      });
    if (path.startsWith('catalogs/strength-units/') && request.method() === 'PUT') {
      const unit = units.find((entry) => entry.id === path.split('/')[2]);
      const version = parseMutationHeaders(request.headers());
      if (!unit || version?.mode !== 'update' || version.revision !== unit.revision)
        return route.fulfill({ status: 409, json: { code: 'revision_conflict' } });
      unit.name = request.postDataJSON().name;
      unit.revision++;
      return route.fulfill({ json: unit });
    }
    if (request.method() === 'GET') {
      const value = await readWorkspace(
        repo,
        actor,
        fixture.workspace,
        path,
        Object.fromEntries(url.searchParams),
        request.headers(),
      );
      return route.fulfill({ status: value ? 200 : 404, json: value ?? {} });
    }
    const version = parseMutationHeaders(request.headers());
    const [collection, id] = path.split('/');
    if (!version || !id || (collection !== 'items' && collection !== 'contacts'))
      return route.fulfill({ status: 400, json: {} });
    const base = {
      kind: collection === 'contacts' ? ('contact' as const) : ('item' as const),
      id,
      actor,
      generation: version.generation,
      mutationId: version.mutationId,
    };
    try {
      const raw = request.postDataJSON();
      const fields =
        base.kind === 'contact'
          ? contactPayload(contactFieldsSchema.parse(raw))
          : itemPayload(itemFieldsSchema.parse(raw));
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
  return (release: (typeof fixture.releases)[number] | null) => {
    active = release;
    setManifest(release);
  };
}
