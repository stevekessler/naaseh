import { createReceiptOrphanCleanup } from '../../apps/api/src/attachments/receipt-orphan-cleanup.js';
import { describe, expect, it, vi } from 'vitest';
import { createReceiptService } from '../../apps/api/src/finance/receipt-service.js';
import { createReceiptScanService } from '../../apps/api/src/attachments/receipt-scan-service.js';
import { createHash } from 'node:crypto';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SafeApiError } from '../../apps/api/src/shared/http.js';
import {
  parseReceiptQuery,
  readReceiptPage,
} from '../../apps/api/src/finance/receipt-query-service.js';
import { resolveReceiptTransaction } from '../../apps/api/src/finance/receipt-transaction-source.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { keys } from '../../apps/api/src/shared/keys.js';

const receiptId = '01J00000000000000000000691';
const transactionId = '01J00000000000000000000692';
const accountId = '01J00000000000000000000693';
const input = {
  clientReceiptId: receiptId,
  filename: 'Invoice.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 32,
  checksumSha256: 'a'.repeat(64),
};
function setup() {
  const store = financePersistenceFixture();
  const work = () => new FinanceUnitOfWork(store.persistence, 'table');
  const assertCurrent = vi.fn(async () => {});
  const authorize = vi.fn(async (id: string) =>
    Object.assign(assertCurrent, { transaction: { id, accountId } }),
  );
  const presign = vi.fn(async () => 'https://object.fixture.invalid/put');
  let headFields: Record<string, unknown> = {};
  const head = vi.fn(async () => headFields);
  let time = new Date('2026-11-14T00:00:00Z');
  const now = () => time;
  const encryptionKey = 'test-attachment-key';
  const service = createReceiptService({
    actorId: 'owner',
    work,
    authorize,
    encryptionKey,
    head,
    presign,
    now,
  });
  const inspectBytes = vi.fn(async () => true);
  const scan = createReceiptScanService({ work, inspectBytes, now });
  const start = async () => {
    const value = await service.initiate(transactionId, input);
    headFields = {
      VersionId: 'immutable',
      ETag: '"receipt"',
      ContentLength: input.sizeBytes,
      ContentType: input.mediaType,
      ChecksumSHA256: value.receipt.checksumSha256,
      SSEKMSKeyId: encryptionKey,
      ServerSideEncryption: 'aws:kms',
      Metadata: { attachmentid: receiptId, sessionid: value.uploadSessionId! },
    };
    return value;
  };
  return {
    service,
    store,
    assertCurrent,
    authorize,
    presign,
    head,
    scan,
    inspectBytes,
    start,
    moveTime: (minutes: number) => {
      time = new Date(time.getTime() + minutes * 60_000);
    },
    changeObject: (changes: Record<string, unknown>) => {
      headFields = { ...headFields, ...changes };
    },
    grant: (session: string) => ({
      uploadSessionId: session,
      objectVersionId: 'immutable',
      etag: '"receipt"',
    }),
  };
}

describe('Finance receipt lifecycle', () => {
  it('uses one receipt and upload session through retry, recovery and both checks', async () => {
    const f = setup();
    const first = await f.start();
    const second = await f.service.initiate(transactionId, input);
    expect(second.uploadSessionId).toBe(first.uploadSessionId);
    expect(second.receipt.blobId).toBe(first.receipt.blobId);
    expect(first.requiredHeaders).toMatchObject({
      'if-none-match': '*',
      'x-amz-meta-attachmentid': receiptId,
    });
    const recovered = await f.service.complete(receiptId, {
      uploadSessionId: first.uploadSessionId!,
      recover: true,
    });
    expect(recovered.status).toBe('scanning');
    expect((await f.service.metadata(receiptId)).etag).toBeUndefined();
    expect(await f.scan(receiptId, 'wrong-version', 'NO_THREATS_FOUND')).toBeUndefined();
    expect(f.inspectBytes).not.toHaveBeenCalled();
    expect(await f.scan(receiptId, 'immutable', 'NO_THREATS_FOUND')).toBe('available');
    expect((await f.service.metadata(receiptId)).etag).toBe('"receipt"');
    const retry = await f.service.complete(receiptId, f.grant(first.uploadSessionId!));
    expect(retry.status).toBe('available');
    expect(await f.scan(receiptId, 'immutable', 'NO_THREATS_FOUND')).toBeUndefined();
    expect(f.inspectBytes).toHaveBeenCalledOnce();
  });

  it('keeps the encrypted retry identity useful after the original upload grant expires', async () => {
    const f = setup();
    const first = await f.start();
    f.moveTime(6);
    const renewed = await f.service.initiate(transactionId, input);
    expect(renewed.uploadSessionId).toBe(first.uploadSessionId);
    expect(renewed.receipt.id).toBe(first.receipt.id);
    expect(Date.parse(renewed.expiresAt!)).toBeGreaterThan(Date.parse(first.expiresAt!));
    await expect(
      f.service.initiate(transactionId, { ...input, filename: 'changed.pdf' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('retries the original receipt through the canonical transaction after reconciliation', async () => {
    const f = setup();
    const first = await f.start();
    const canonicalId = '01J00000000000000000000694';
    const unrelatedId = '01J00000000000000000000695';
    let originalRevoked = false;
    f.authorize.mockImplementation(async (id) =>
      Object.assign(
        async () => {
          if (id === transactionId && originalRevoked)
            throw new SafeApiError(403, 'finance_locked', 'Unlock Finance.', 'authorization');
        },
        { transaction: { id: id === transactionId ? canonicalId : id, accountId } },
      ),
    );
    f.moveTime(6);
    await expect(f.service.initiate(unrelatedId, input)).rejects.toMatchObject({ status: 404 });
    await expect(
      f.service.initiate(canonicalId, { ...input, filename: 'Changed.pdf' }),
    ).rejects.toMatchObject({ status: 409 });
    originalRevoked = true;
    await expect(f.service.initiate(canonicalId, input)).rejects.toMatchObject({ status: 403 });
    expect(f.presign).toHaveBeenCalledOnce();
    originalRevoked = false;
    const retried = await f.service.initiate(canonicalId, input);
    expect(retried.uploadSessionId).toBe(first.uploadSessionId);
    expect(retried.receipt).toMatchObject({
      id: first.receipt.id,
      parentId: transactionId,
      blobId: first.receipt.blobId,
    });
    expect(Date.parse(retried.expiresAt!)).toBeGreaterThan(Date.parse(first.expiresAt!));
    await f.service.complete(receiptId, f.grant(first.uploadSessionId!));
    await f.scan(receiptId, 'immutable', 'NO_THREATS_FOUND');
    await expect(f.service.initiate(canonicalId, input)).resolves.toMatchObject({
      receipt: { id: first.receipt.id, status: 'available' },
    });
    expect(f.presign).toHaveBeenCalledTimes(2);
  });

  it('rejects a mismatched version, tags or content without creating a usable blob', async () => {
    const f = setup();
    const grant = await f.start();
    f.changeObject({ Metadata: { attachmentid: receiptId, sessionid: 'wrong' } });
    await expect(
      f.service.complete(receiptId, f.grant(grant.uploadSessionId!)),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      f.store.rows.get(f.store.key(keys.attachmentBlob(grant.receipt.blobId))),
    ).toBeUndefined();
  });

  it('cancels incomplete intents and prevents a concurrent or late completion', async () => {
    const f = setup();
    const grant = await f.start();
    expect((await f.service.cancel(receiptId)).status).toBe('cancelled');
    await expect(
      f.service.complete(receiptId, f.grant(grant.uploadSessionId!)),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.head).not.toHaveBeenCalled();
  });

  it('cancels an expired receipt without reviving the upload or dropping an available original', async () => {
    const expired = setup();
    const grant = await expired.start();
    const key = expired.store.key(keys.attachment(receiptId));
    const row = expired.store.rows.get(key)!;
    expired.store.rows.set(key, { ...row, data: { ...grant.receipt, status: 'expired' } });
    const cancelled = await expired.service.cancel(receiptId);
    expect(cancelled.status).toBe('cancelled');
    await expect(expired.service.cancel(receiptId)).resolves.toEqual(cancelled);
    await expect(expired.service.initiate(transactionId, input)).resolves.toEqual({
      receipt: cancelled,
    });
    await expect(
      expired.service.complete(receiptId, expired.grant(grant.uploadSessionId!)),
    ).rejects.toMatchObject({ status: 409 });
    expect(expired.head).not.toHaveBeenCalled();

    const available = setup();
    const active = await available.start();
    await available.service.complete(receiptId, available.grant(active.uploadSessionId!));
    await available.scan(receiptId, 'immutable', 'NO_THREATS_FOUND');
    await expect(available.service.cancel(receiptId)).rejects.toMatchObject({ status: 409 });
    await expect(available.service.metadata(receiptId)).resolves.toMatchObject({
      status: 'available',
    });
  });

  it('rejects policy failures and keeps transient scan failures recoverable', async () => {
    const f = setup();
    const grant = await f.start();
    const completed = await f.service.complete(receiptId, f.grant(grant.uploadSessionId!));
    f.inspectBytes.mockRejectedValueOnce(new Error('object unavailable'));
    expect(await f.scan(receiptId, 'immutable', 'NO_THREATS_FOUND')).toBe('scan_failed');
    const retry = await f.service.retry(receiptId, { expectedVersion: completed.version + 1 });
    expect(retry.status).toBe('scanning');
    f.inspectBytes.mockResolvedValueOnce(false);
    expect(await f.scan(receiptId, 'immutable', 'NO_THREATS_FOUND')).toBe('rejected');
    expect((await f.service.metadata(receiptId)).etag).toBeUndefined();
  });

  it('keeps private receipt metadata behind the current source gate', async () => {
    const f = setup();
    await f.start();
    f.authorize.mockRejectedValueOnce(new Error('Finance is locked'));
    await expect(f.service.metadata(receiptId)).rejects.toThrow('Finance is locked');
  });
});

it('cleans unconfirmed expired uploads by exact version and skips retained originals', async () => {
  const f = setup();
  const grant = await f.start();
  const key = keys.attachment(receiptId);
  const row = f.store.rows.get(f.store.key(key))!;
  f.store.rows.set(f.store.key(key), { ...row, data: { ...grant.receipt, status: 'expired' } });
  const listVersions = vi.fn(async () => ['old-version']);
  const deleteVersion = vi.fn(async () => {});
  const clean = createReceiptOrphanCleanup({
    work: () => new FinanceUnitOfWork(f.store.persistence, 'table'),
    listVersions,
    deleteVersion,
  });
  const at = new Date('2026-11-14T00:30:00Z');
  await expect(clean(receiptId, at)).resolves.toBe(true);
  expect(deleteVersion).toHaveBeenCalledExactlyOnceWith(
    'attachments/' + grant.receipt.blobId,
    'old-version',
  );
  await expect(clean(receiptId, new Date('2026-11-14T00:40:00Z'))).resolves.toBe(false);
  expect(listVersions).toHaveBeenCalledOnce();

  const retained = setup();
  const other = await retained.start();
  await retained.service.complete(receiptId, retained.grant(other.uploadSessionId!));
  await expect(
    createReceiptOrphanCleanup({
      work: () => new FinanceUnitOfWork(retained.store.persistence, 'table'),
      listVersions,
      deleteVersion,
    })(receiptId, at),
  ).resolves.toBe(false);
  expect(deleteVersion).toHaveBeenCalledOnce();
});

it('follows retained receipt aliases within the original Finance account and scope', async () => {
  const f = financePersistenceFixture();
  const PK = 'FINANCE#SCOPE#fixture';
  const targetId = '01J00000000000000000000694';
  const seed = (row: { PK: string; SK: string } & Record<string, unknown>) =>
    f.rows.set(f.key(row), row);
  seed({ PK, SK: 'META', revision: 7 });
  const add = (id: string, owner: string, status: string) => {
    const storageKey = { PK, SK: 'ROW#transactions#' + id };
    seed({
      ...storageKey,
      collection: 'transactions',
      entryKey: id,
      data: { id, accountId: owner, status },
    });
    seed({ ...financeLocatorKey('transactions', id), storageKey });
  };
  add(transactionId, accountId, 'tombstone');
  add(targetId, accountId, 'active');
  seed({
    PK,
    SK: 'ROW#transactionAliases#' + createHash('sha256').update(transactionId).digest('hex'),
    collection: 'transactionAliases',
    entryKey: transactionId,
    data: targetId,
  });
  const resolve = () =>
    resolveReceiptTransaction(transactionId, new FinanceUnitOfWork(f.persistence, 'table'));
  await expect(resolve()).resolves.toMatchObject({ id: targetId, accountId, transferred: true });
  add(targetId, 'another-account', 'active');
  await expect(resolve()).rejects.toMatchObject({ status: 409 });
});

it('deduplicates indexed aliases and filters by authorized transaction-local relationships', async () => {
  const f = setup();
  const { receipt } = await f.start();
  const canonicalId = '01J00000000000000000000694';
  const blockedId = '01J00000000000000000000695';
  const budgetId = '01J00000000000000000000696';
  const budgetItemId = '01J00000000000000000000697';
  const categoryId = '01J00000000000000000000698';
  const subcategoryId = '01J00000000000000000000699';
  const merchantId = '01J00000000000000000000700';
  const assertCurrent = vi.fn(async () => {});
  const readCanonicalSource = vi.fn(
    async (kind: string): Promise<Record<string, unknown> | undefined> =>
      kind === 'financeBudgetItem' ? { budgetId } : { name: 'Authorized merchant' },
  );
  const transaction = {
    id: canonicalId,
    accountId,
    effectiveAt: '2026-11-13T02:00:00Z',
    allocations: [
      {
        budgetItemId,
        financeCategoryId: categoryId,
        subcategoryId,
        classification: { categoryLabel: 'Historical label' },
      },
    ],
    budgetLinks: [{ id: budgetId, name: 'Authorized budget' }],
    merchantId,
  };
  const authorize = Object.assign(
    vi.fn(async (id: string) => {
      if (id === blockedId) throw new SafeApiError(404, 'missing', 'Missing', 'not_found');
      return Object.assign(assertCurrent, { transaction, source: { readCanonicalSource } });
    }),
    { securityRevision: 7, assertUnlocked: async () => ({ securityRevision: 7 }) },
  ) as unknown as Parameters<typeof readReceiptPage>[0]['authorize'];
  const send = vi
    .spyOn(DynamoDBDocumentClient.prototype, 'send')
    .mockImplementation(async (command) => {
      if (command instanceof QueryCommand) {
        expect(command.input).toMatchObject({
          IndexName: 'GSI2',
          ExpressionAttributeValues: { ':pk': 'FINANCE#RECEIPTS#' + accountId },
          Limit: 25,
        });
        return {
          Items: [
            keys.attachment(receiptId),
            keys.attachment(receiptId),
            keys.attachment(blockedId),
          ],
        };
      }
      if (!(command instanceof GetCommand)) throw new Error('Unexpected receipt query command.');
      const key = command.input.Key;
      return {
        Item: {
          data:
            key?.PK === keys.attachment(blockedId).PK
              ? { ...receipt, id: blockedId, parentId: blockedId }
              : receipt,
        },
      };
    });
  try {
    const query = parseReceiptQuery(
      'date=2026-11-12&timeZone=America%2FDenver&budgetIds=' +
        budgetId +
        '&categoryIds=' +
        categoryId +
        '&subcategoryIds=' +
        subcategoryId +
        '&merchantIds=' +
        merchantId,
    );
    const read = () =>
      readReceiptPage({ userId: 'owner', transactionId: canonicalId, authorize, query });
    await expect(read()).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: receiptId,
          parentId: canonicalId,
          transactionDate: '2026-11-12',
          merchant: 'Authorized merchant',
          classifications: [{ category: 'Historical label' }],
        }),
      ],
    });
    expect(assertCurrent).toHaveBeenCalled();
    readCanonicalSource.mockImplementation(async (kind) =>
      kind === 'financeBudgetItem' ? { budgetId } : undefined,
    );
    await expect(read()).resolves.toEqual({ items: [] });
  } finally {
    send.mockRestore();
  }
});
