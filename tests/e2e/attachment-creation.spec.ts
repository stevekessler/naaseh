import { expect, test, type Page } from '@playwright/test';
import { expandTaskDetails, mockSuccessfulSync, openLists, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

async function prepareUploads(page: Page, failFirst = false) {
  await mockSuccessfulSync(page);
  let attempts = 0;
  const uploaded: Array<{ parentType: string; parentId: string; originalFilename: string }> = [];
  const attachments = new Map<string, object>();
  await page.route('**/api/v1/attachments/uploads', async (route) => {
    attempts += 1;
    if (failFirst && attempts === 1) {
      await route.fulfill({ status: 503, json: { message: 'Please retry the file upload.' } });
      return;
    }
    const body = route.request().postDataJSON();
    uploaded.push(body);
    const id = `01J0000000000000000000000${attempts}`;
    const attachment = {
      ...body,
      id,
      blobId: `01J0000000000000000000001${attempts}`,
      uploaderId: 'local-steve',
      status: 'scanning',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 2,
    };
    attachments.set(id, attachment);
    await route.fulfill({
      status: 201,
      json: {
        attachment: { ...attachment, status: 'pending_upload', version: 1 },
        uploadSessionId: `session-${attempts}`,
        uploadUrl: '/__test/upload',
        requiredHeaders: {},
      },
    });
  });
  await page.route('**/__test/upload', (route) =>
    route.fulfill({ status: 200, headers: { 'x-amz-version-id': 'version-1', etag: 'etag-1' } }),
  );
  await page.route('**/api/v1/attachments/*/complete', (route) =>
    route.fulfill({ json: attachments.get(route.request().url().split('/').at(-2)!) }),
  );
  await signIn(page);
  return uploaded;
}

test('selects files while creating tasks and list items and places task uploads below Parent task', async ({
  page,
}) => {
  const uploaded = await prepareUploads(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Task with file');
  await expandTaskDetails(form);
  const picker = form.getByLabel(/Attach files/);
  const parent = form.getByRole('combobox', { name: 'Parent task' });
  expect((await picker.boundingBox())!.y).toBeGreaterThan((await parent.boundingBox())!.y);
  await picker.setInputFiles({ name: 'brief.docx', mimeType: '', buffer: Buffer.from('brief') });
  await form.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect.poll(() => uploaded.length).toBe(1);
  expect(uploaded[0]).toMatchObject({ parentType: 'task', originalFilename: 'brief.docx' });
  await expect(form.getByRole('button', { name: 'Add task', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Task with file', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  const editPicker = editor.getByLabel(/Attach a file/);
  expect((await editPicker.boundingBox())!.y).toBeGreaterThan(
    (await editor.getByRole('combobox', { name: 'Parent task' }).boundingBox())!.y,
  );
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openLists(page);
  await page.getByLabel('List name').fill('Files');
  await page.getByRole('button', { name: 'Create list', exact: true }).click();
  const listForm = page.locator('.list-add');
  await listForm.getByLabel('Add an item', { exact: true }).fill('Item with file');
  await expect(listForm.getByLabel(/Attach files/)).toBeVisible();
  await listForm
    .getByLabel(/Attach files/)
    .setInputFiles({ name: 'budget.xlsx', mimeType: '', buffer: Buffer.from('budget') });
  await listForm.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect.poll(() => uploaded.length).toBe(2);
  expect(uploaded[1]).toMatchObject({ parentType: 'listItem', originalFilename: 'budget.xlsx' });
  await expect(listForm.getByLabel('Add an item', { exact: true })).toHaveValue('');
});

test('retries a new list item upload without creating a duplicate item', async ({ page }) => {
  const uploaded = await prepareUploads(page, true);
  await openLists(page);
  await page.getByLabel('List name').fill('Upload retries');
  await page.getByRole('button', { name: 'Create list', exact: true }).click();
  const form = page.locator('.list-add');
  await form.getByLabel('Add an item', { exact: true }).fill('Keep one item');
  await form
    .getByLabel(/Attach files/)
    .setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('notes') });
  await form.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('Please retry the file upload.');
  await form.getByRole('button', { name: 'Retry file upload' }).click();
  await expect.poll(() => uploaded.length).toBe(1);
  await expect(form.getByLabel('Add an item', { exact: true })).toHaveValue('');
  await expect(
    page
      .locator('.list-item-name-cell')
      .getByRole('button', { name: 'Keep one item', exact: true }),
  ).toHaveCount(1);
});
