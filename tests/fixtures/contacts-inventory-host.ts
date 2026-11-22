import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { ReleaseManifest } from '../../packages/contacts-inventory-contracts/src/host.js';
import { contactsInventoryFixture } from './contacts-inventory.js';

const [first, second] = contactsInventoryFixture.releases;

export async function buildFeatureFixture(
  kind: 'release' | 'offline' | 'contacts' = 'release',
): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            kind === 'contacts'
              ? '../../apps/contacts-inventory/src/entry.tsx'
              : `./contacts-inventory-${kind}-entry.ts`,
            import.meta.url,
          ),
        ),
        formats: ['es'],
      },
    },
  });
  if (!Array.isArray(result)) throw new Error('Expected one bundled Contacts and Inventory entry.');
  const output = result.flatMap(({ output }) => output);
  const entry = output[0];
  if (output.length !== 1 || entry?.type !== 'chunk')
    throw new Error('Expected one bundled Contacts and Inventory entry.');
  return entry.code;
}

export async function installFeatureFixture(page: Page, entry: string) {
  let active: 'incompatible' | typeof first | typeof second | null = null;
  await page.route('**/features/contacts-inventory/release.json', (route) => {
    if (!active)
      return route.fulfill({ status: 404, body: '', headers: { 'Cache-Control': 'no-store' } });
    const releaseId = active === 'incompatible' ? first : active;
    const entryPath = `/features/contacts-inventory/releases/${releaseId}/entry.js`;
    const manifest: ReleaseManifest = {
      releaseId,
      hostProtocol: 1,
      apiProtocol: 1,
      entry: entryPath,
      assets: [entryPath],
    };
    return route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      json: { ...manifest, ...(active === 'incompatible' ? { hostProtocol: 999 } : {}) },
    });
  });
  for (const version of [first, second]) {
    await page.route(`**/features/contacts-inventory/releases/${version}/entry.js`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: entry }),
    );
    await page.route(`**/api/v1/contacts-inventory/releases/${version}/fixture`, (route) =>
      route.fulfill({
        status: active === version ? 200 : 410,
        headers: { 'Cache-Control': 'no-store' },
        json: { releaseId: version },
      }),
    );
  }
  return (release: typeof active) => {
    active = release;
  };
}
