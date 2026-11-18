import { describe, expect, it, vi } from 'vitest';
import { buildFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { contactsInventoryFixture } from '../fixtures/contacts-inventory.js';
import { parseReleaseManifest } from '../../packages/contacts-inventory-contracts/src/host.js';
import { loadManifest } from '../../apps/web/src/features/contacts-inventory-host/loader.js';
import { parseAppRoute, routePath } from '../../apps/web/src/app/router.js';

const [releaseId, otherReleaseId] = contactsInventoryFixture.releases;
const prefix = `/features/contacts-inventory/releases/${releaseId}/`;
const manifest = {
  releaseId,
  hostProtocol: 1,
  apiProtocol: 1,
  entry: `${prefix}entry.js`,
  assets: [`${prefix}entry.js`, `${prefix}chunks/runtime-a1.js`],
};

describe('Contacts and Inventory host contract', () => {
  it('builds the fixture that the browser release tests load', async () => {
    const entry = await buildFeatureFixture();
    expect(entry).toContain('Contacts and Inventory release fixture');
    const offline = await buildFeatureFixture('offline');
    expect(offline).toContain('Cache synthetic contact');
  });

  it('loads only compatible immutable paths from the selected release', () => {
    expect(parseReleaseManifest(manifest)).toEqual(manifest);
    for (const entry of [
      'https://example.test/entry.js',
      '//' + 'example.test/entry.js',
      `${prefix}../entry.js`,
      `${prefix}%2e%2e/entry.js`,
      `${prefix}entry.js?v=2`,
      `/features/contacts-inventory/releases/${otherReleaseId}/entry.js`,
    ]) {
      expect(parseReleaseManifest({ ...manifest, entry, assets: [entry] })).toBeNull();
    }
    expect(parseReleaseManifest({ ...manifest, assets: [] })).toBeNull();
    expect(parseReleaseManifest({ ...manifest, apiProtocol: 2 })).toBeNull();
  });

  it('keeps the verified release on transport failure but withdraws it online', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Network failed'));
    expect(await loadManifest({ request: offline, cached: manifest, online: false })).toEqual(
      manifest,
    );
    expect(await loadManifest({ request: offline, cached: manifest, online: true })).toBeNull();
    const inactive = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await loadManifest({ request: inactive, cached: manifest, online: true })).toBeNull();
    expect(inactive).toHaveBeenCalledWith('/features/contacts-inventory/release.json', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
  });

  it('preserves existing routing and resolves built-in feature routes', () => {
    expect(parseAppRoute('/lists/legacy-list')).toEqual({
      section: 'lists',
      listId: 'legacy-list',
    });
    expect(parseAppRoute('/finance/accounts/cash')).toEqual({
      section: 'finance',
      view: 'accounts',
      accountId: 'cash',
    });
    for (const path of [
      '/lists/contacts',
      '/lists/contacts/record-id',
      '/inventory',
      '/inventory/medication-list',
      '/inventory/record-id',
      '/admin/contact-types',
      '/admin/locations',
      '/admin/strength-units',
    ]) {
      expect(routePath(parseAppRoute(path))).toBe(path);
    }
  });
});
