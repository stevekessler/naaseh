import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { fixturePdf } from '../fixtures/finance/receipts/documents.js';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const account = '01J00000000000000000000691';
const transactionId = '01J00000000000000000000692';
const receiptId = '01J00000000000000000000693';
const categoryId = '01J00000000000000000000694';
const merchantId = '01J00000000000000000000695';
const budgetId = '01J00000000000000000000696';
const timestamp = '2026-11-14T19:00:00.000Z';
const transaction = {
  id: transactionId,
  accountId: account,
  description: 'Corner Market',
  amountMinor: -1250,
  currency: 'USD',
  currencyExponent: 2,
  allocations: [],
  reconciliationState: 'not-applicable',
  reviewState: 'none',
  version: 1,
  effectiveAt: timestamp,
};

async function setup(page: Page) {
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockFinanceSnapshotEvidence(page);
  await page.route('**/api/v1/finance/accounts', (route) =>
    route.fulfill({
      headers: financeSnapshotFixtureHeaders,
      json: {
        items: [
          {
            id: account,
            friendlyName: 'Checking',
            currency: 'USD',
            scope: { type: 'owner', ownerId: 'local-steve' },
          },
        ],
      },
    }),
  );
  await page.route(
    /\/api\/v1\/finance\/(categories|merchants|budgets|review-issues)(?:\?|$)/u,
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const items = path.endsWith('categories')
        ? [{ id: categoryId, name: 'Groceries', status: 'active' }]
        : path.endsWith('merchants')
          ? [{ id: merchantId, name: 'Corner Market' }]
          : path.endsWith('budgets')
            ? [{ id: budgetId, name: 'Household plan' }]
            : [];
      return route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items } });
    },
  );
  await page.route(
    new RegExp('/api/v1/finance/transactions/' + transactionId + '(?:[?]browse=1)?$'),
    (route) => route.fulfill({ headers: financeSnapshotFixtureHeaders, json: transaction }),
  );
  await page.route(/\/api\/v1\/finance\/transactions\?/u, (route) =>
    route.fulfill({
      json: { items: [transaction], rowsState: 'ready', aggregateState: 'exact', totalCount: 1 },
    }),
  );
  await signIn(page);
}

function fixtureReceipt(id: string, data: Buffer, name: string, mediaType: string) {
  return {
    id,
    parentId: transactionId,
    parentType: 'financeTransaction',
    blobId: id,
    uploaderId: 'local-steve',
    originalFilename: name,
    mediaType,
    sizeBytes: data.length,
    status: 'available',
    version: 3,
    checksumSha256: createHash('sha256').update(data).digest('base64'),
    createdAt: timestamp,
    updatedAt: timestamp,
    etag: '"receipt"',
    transactionDate: '2026-11-14',
    transactionDescription: 'Corner Market transaction',
    merchant: 'Corner Market',
    classifications: [{ category: 'Groceries' }],
    budgets: [{ id: budgetId, name: 'Household plan' }],
  };
}

test('attaches original bytes from a transaction and finds the receipt by combined filters', async ({
  page,
}) => {
  await setup(page);
  const pdf = fixturePdf();
  let entry = fixtureReceipt(receiptId, pdf, 'Groceries.pdf', 'application/pdf');
  let available = false;
  await page.route('**/finance/transactions/' + transactionId + '/receipts', (route) =>
    route.fulfill({ json: { items: available ? [entry] : [] } }),
  );
  await page.route('**/finance/transactions/' + transactionId + '/receipts/uploads', (route) => {
    const draft = route.request().postDataJSON() as {
      clientReceiptId: string;
      checksumSha256: string;
    };
    expect(draft.checksumSha256).toBe(entry.checksumSha256);
    entry = { ...entry, id: draft.clientReceiptId };
    return route.fulfill({
      json: {
        receipt: { ...entry, status: 'pending_upload' },
        uploadSessionId: transactionId,
        uploadUrl: new URL('/fixture-receipt-upload', page.url()).href,
        requiredHeaders: { 'if-none-match': '*' },
      },
    });
  });
  await page.route('**/fixture-receipt-upload', (route) => {
    expect(route.request().postDataBuffer()).toEqual(pdf);
    return route.fulfill({ headers: { etag: '"receipt"', 'x-amz-version-id': 'exact' } });
  });
  await page.route('**/finance/receipts/*/complete', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      objectVersionId: 'exact',
      etag: '"receipt"',
    });
    available = true;
    return route.fulfill({ json: { ...entry, status: 'scanning' } });
  });
  await page.route('**/finance/receipts/*/content', (route) => {
    expect(route.request().headers()['if-match']).toBe('"receipt"');
    return route.fulfill({
      status: 206,
      body: pdf,
      headers: {
        etag: '"receipt"',
        'content-type': entry.mediaType,
        'content-length': String(pdf.length),
        'content-range': `bytes 0-${pdf.length - 1}/${pdf.length}`,
      },
    });
  });
  await page.route(/\/api\/v1\/finance\/receipts\?/u, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const matches =
      (!query.get('date') || query.get('date') === entry.transactionDate) &&
      (!query.get('budgetIds') || query.get('budgetIds') === budgetId) &&
      (!query.get('categoryIds') || query.get('categoryIds') === categoryId) &&
      (!query.get('merchantIds') || query.get('merchantIds') === merchantId);
    return route.fulfill({ json: { items: matches ? [entry] : [] } });
  });

  await page.goto('/finance/transactions/' + transactionId);
  await page
    .getByLabel('Attach receipt')
    .setInputFiles({ name: 'Groceries.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('Receipt uploaded for checking.')).toBeVisible();
  await page.goto('/finance/receipts');
  await page.getByLabel('Transaction date', { exact: true }).fill('2026-11-14');
  await page.getByRole('combobox', { name: 'Budget', exact: true }).selectOption(budgetId);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption(categoryId);
  await page.getByRole('combobox', { name: 'Merchant', exact: true }).selectOption(merchantId);
  await expect(page.getByRole('link', { name: 'Corner Market transaction' })).toBeVisible();
  await page.getByRole('button', { name: 'View / download' }).click();
  await expect(page.getByRole('link', { name: 'Save original file' })).toHaveAttribute(
    'download',
    'Groceries.pdf',
  );
  const preview = page.getByRole('img', { name: 'Groceries.pdf page 1' });
  await expect(preview).toBeVisible();
  expect(
    await preview.evaluate((node: HTMLCanvasElement) =>
      Array.from(node.getContext('2d')!.getImageData(10, node.height - 10, 1, 1).data),
    ),
  ).toEqual([255, 0, 0, 255]);
  await page.getByLabel('Transaction date', { exact: true }).fill('2026-11-13');
  await expect(page.getByText('No matching receipts.')).toBeVisible();
});

test('Office uses an original download and a Finance lock cancels an incomplete transfer', async ({
  page,
}) => {
  await setup(page);
  const office = Buffer.alloc(1_048_580, 42);
  const receipt = fixtureReceipt(
    receiptId,
    office,
    'Workbook.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/v1\/finance\/receipts\?/u, (route) =>
    route.fulfill({ json: { items: [receipt] } }),
  );
  await page.route('**/finance/receipts/*/content', async (route) => {
    const range = route.request().headers().range;
    const [start, end] = range!.slice(6).split('-').map(Number);
    if (start === 1_048_576) await hold;
    const result = office.subarray(start!, end! + 1);
    await route
      .fulfill({
        status: 206,
        body: result,
        headers: {
          etag: '"receipt"',
          'content-type': receipt.mediaType,
          'content-length': String(result.length),
          'content-range': `bytes ${start}-${end}/${office.length}`,
        },
      })
      .catch(() => {});
  });
  await page.goto('/finance/receipts');
  await expect(page.getByText('Office files are available as original downloads.')).toBeVisible();
  await page.getByRole('button', { name: 'Prepare original download' }).click();
  try {
    await expect(page.getByRole('button', { name: 'Verifying receipt…' })).toBeVisible();
    await page.route('**/api/v1/auth/finance-security', (route) =>
      route.fulfill({ json: { requirePin: true, enrolled: true, revision: 1 } }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('heading', { name: 'Unlock Finance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save original file' })).toHaveCount(0);
  } finally {
    release();
  }
});
