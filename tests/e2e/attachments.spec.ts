import { expect, test } from '@playwright/test';
import { createListWithItem, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });
test('@enhanced-lists encrypted attachment upload enters scanning and respects offline transfer controls', async ({
  page,
  context,
}) => {
  const attachment = {
    id: '01J00000000000000000000001',
    parentType: 'listItem',
    parentId: '',
    blobId: '01J00000000000000000000002',
    uploaderId: 'steve',
    originalFilename: 'receipt.txt',
    mediaType: 'text/plain',
    sizeBytes: 7,
    checksumSha256: 'dGVzdA==',
    status: 'scanning',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 2,
  };
  let uploadCount = 0;
  const initiated = new Map<string, typeof attachment>();
  await page.route(/\/api\/v1\/attachments\/uploads$/, async (route) => {
    const body = route.request().postDataJSON() as {
      parentId: string;
      originalFilename: string;
      mediaType: string;
      sizeBytes: number;
    };
    uploadCount += 1;
    const next = {
      ...attachment,
      id: `01J0000000000000000000000${uploadCount}`,
      blobId: `01J0000000000000000000001${uploadCount}`,
      parentId: body.parentId,
      originalFilename: body.originalFilename,
      mediaType: body.mediaType,
      sizeBytes: body.sizeBytes,
    };
    initiated.set(next.id, next);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        attachment: { ...next, status: 'pending_upload', version: 1 },
        uploadSessionId: `session-${uploadCount}`,
        uploadUrl: '/__test/upload',
        requiredHeaders: {},
      }),
    });
  });
  await page.route(/\/__test\/upload$/, async (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'x-amz-version-id': 'version-1',
        etag: 'etag-1',
        'access-control-allow-origin': '*',
      },
    }),
  );
  await page.route(/\/api\/v1\/attachments\/[^/]+\/complete$/, async (route) => {
    const id =
      route
        .request()
        .url()
        .match(/attachments\/([^/]+)\/complete/)?.[1] ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(initiated.get(id)),
    });
  });
  await signIn(page);
  const list = await createListWithItem(page, 'Receipts', 'Hardware');
  await list
    .locator('.list-item')
    .filter({ hasText: 'Hardware' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  const panel = list
    .locator('.list-item-editor')
    .getByRole('heading', { name: 'Attachments' })
    .locator('..');
  await panel.getByLabel(/Attach a file/).setInputFiles([
    { name: 'receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('receipt') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') },
  ]);
  await expect(panel.getByText(/receipt\.txt — scanning/)).toBeVisible();
  await expect(panel.getByText(/notes\.txt — scanning/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Remove' })).toHaveCount(2);
  await expect(panel.getByRole('button', { name: 'Remove' }).first()).toBeDisabled();
  await context.setOffline(true);
  await expect(panel.getByLabel(/Attach a file/)).toBeDisabled();
  await expect(panel.getByText(/Connect to the internet/)).toBeVisible();
});
