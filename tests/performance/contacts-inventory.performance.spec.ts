import { devices, expect, test, type Locator } from '@playwright/test';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { signIn } from '../e2e/enhanced-helpers.js';
import { buildFeatureFixture } from '../fixtures/contacts-inventory-host.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { mountWorkspaceStory } from '../fixtures/contacts-inventory-story.js';
import { contactsInventoryFixture } from '../fixtures/contacts-inventory.js';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, serviceWorkers: 'block' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'The mobile benchmark uses CDP throttling.',
);

test('updates warm workspace results for 500 contacts and 500 inventory items', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  const workspace = new WorkspaceRepository(new MemoryWorkspaceStore());
  const actor = contactsInventoryFixture.members[0];
  for (let index = 0; index < 500; index++) {
    const suffix = String(index).padStart(3, '0');
    const base = { actor, generation: 1, action: 'create' as const };
    await workspace.mutate({
      ...base,
      id: `b4d02419-80af-4a8f-b710-1a49e7ca0${suffix}`,
      kind: 'contact',
      mutationId: `contact-${suffix}`,
      fields: { firstName: `Performance contact ${suffix}` },
    });
    await workspace.mutate({
      ...base,
      id: `b4d02419-80af-4a8f-b710-1a49e7ca1${suffix}`,
      kind: 'item',
      mutationId: `item-${suffix}`,
      fields: {
        name: `Performance item ${suffix}`,
        locationId: 'closet',
        ...(index % 2 === 0
          ? { type: 'medicine', whoMed: 'both', status: 'current', timeTaken: 'night' }
          : { type: 'base' }),
      },
    });
  }

  await mountWorkspaceStory(page, workspace, await buildFeatureFixture('contacts'), actor);
  await signIn(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mobileConnection = {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 90_000,
  };
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', mobileConnection);

  const durations: number[] = [];
  async function measure(field: Locator, prefix: string, offset: number, count: number) {
    await field.fill(`${prefix} 499`);
    await expect(page.getByRole('button', { name: `${prefix} 499`, exact: true })).toBeVisible();
    for (let index = offset; index < offset + count; index++) {
      const name = `${prefix} ${String(index).padStart(3, '0')}`;
      const start = performance.now();
      await field.fill(name);
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
      durations.push(Math.round(performance.now() - start));
    }
  }

  await page.goto('/lists/contacts');
  await measure(page.getByLabel('Search contacts'), 'Performance contact', 0, 15);
  await page.goto('/inventory');
  await measure(page.getByLabel('Search inventory'), 'Performance item', 50, 15);
  await page.goto('/search');
  for (const label of ['Contacts', 'Inventory Items', 'Medicine']) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  const search = page.getByRole('searchbox', { name: 'Search tasks and list items' });
  await measure(search, 'Performance contact', 100, 5);
  await measure(search, 'Performance item', 110, 5);

  const sorted = [...durations].sort((left, right) => left - right);
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  await testInfo.attach('warm-result-latency-ms', {
    body: JSON.stringify({ cpuThrottle: 4, mobileConnection, durations, p95Ms }),
    contentType: 'application/json',
  });
  expect(p95Ms).toBeLessThanOrEqual(2000);
});
