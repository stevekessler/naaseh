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
  await page.route(/\/api\/v1\/attachments\/uploads$/, async (route) => {
    const body = route.request().postDataJSON() as { parentId: string };
    attachment.parentId = body.parentId;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        attachment: { ...attachment, status: 'pending_upload', version: 1 },
        uploadSessionId: 'session',
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
  await page.route(/\/api\/v1\/attachments\/[^/]+\/complete$/, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(attachment),
    }),
  );
  await signIn(page);
  const list = await createListWithItem(page, 'Receipts', 'Hardware');
  const panel = list.getByRole('heading', { name: 'Attachments' }).locator('..');
  await panel
    .getByLabel(/Attach a file/)
    .setInputFiles({ name: 'receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('receipt') });
  await expect(panel.getByText(/receipt\.txt — scanning/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Remove' })).toBeDisabled();
  await context.setOffline(true);
  await expect(panel.getByLabel(/Attach a file/)).toBeDisabled();
  await expect(panel.getByText(/Connect to the internet/)).toBeVisible();
});
