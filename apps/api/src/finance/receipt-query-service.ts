import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { localFinanceDate } from '@naaseh/domain';
import { financeQueryFiltersSchema, financeQueryPageSchema } from '@naaseh/contracts';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { SafeApiError } from '../shared/http.js';
import { findAttachment, findAttachmentBlob } from '../attachments/attachment-repository.js';
import { verifiedReceiptVersion } from '../attachments/receipt-content-service.js';
import type { authorizeReceiptRequest } from '../attachments/receipt-authorization.js';
import { listFinanceBrowseKeys } from './query-runtime.js';
import { decodeFinanceCursor, encodeFinanceCursor } from './query-contract.js';

type Authorize = Awaited<ReturnType<typeof authorizeReceiptRequest>>;
type QueryKey = {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
};
const invalidCursor = () =>
  new SafeApiError(400, 'receipt_cursor_invalid', 'Restart the receipt search.', 'validation');

export function parseReceiptQuery(query: string) {
  const params = new URLSearchParams(query);
  return {
    filters: financeQueryFiltersSchema.parse({
      ...Object.fromEntries(
        ['date', 'dateFrom', 'dateTo', 'timeZone'].flatMap((key) =>
          params.has(key) ? [[key, params.get(key)]] : [],
        ),
      ),
      ...Object.fromEntries(
        ['budgetIds', 'categoryIds', 'subcategoryIds', 'merchantIds'].flatMap((key) =>
          params.has(key) ? [[key, params.getAll(key)]] : [],
        ),
      ),
    }),
    page: financeQueryPageSchema.parse({
      limit: params.get('limit') ?? 25,
      ...(params.has('cursor') ? { cursor: params.get('cursor') } : {}),
    }),
  };
}

export async function readReceiptPage({
  userId,
  transactionId,
  authorize,
  query,
}: {
  userId: string;
  transactionId?: string;
  authorize: Authorize;
  query: ReturnType<typeof parseReceiptQuery>;
}) {
  const { filters, page } = query;
  const parent = transactionId ? await authorize(transactionId) : undefined;
  const groups = parent
    ? typeof parent.transaction.accountId === 'string'
      ? [parent.transaction.accountId]
      : []
    : [...new Set(await listFinanceBrowseKeys(userId, 'accounts'))].sort();
  const index = 'GSI2';
  const partitionName = 'FINANCE#RECEIPTS#';
  const context = {
    userId,
    accountId: transactionId ? 'receipt-parent:' + transactionId : 'receipt-browser',
    sourceRevision: JSON.stringify(groups),
    securityRevision: authorize.securityRevision,
    filters,
  };
  const secret = process.env.CURSOR_SIGNING_SECRET ?? '';
  let position = 0;
  let startKey: QueryKey | undefined;
  if (page.cursor) {
    try {
      const cursor = decodeFinanceCursor(page.cursor, context, secret);
      position = groups.indexOf(cursor.PK);
      startKey = cursor.SK ? (JSON.parse(cursor.SK) as QueryKey) : undefined;
      if (
        position < 0 ||
        (startKey &&
          (startKey[`${index}PK`] !== partitionName + cursor.PK ||
            typeof startKey[`${index}SK`] !== 'string' ||
            !/^ATTACHMENT#[0-9A-HJKMNP-TV-Z]{26}$/u.test(startKey.PK) ||
            startKey.SK !== 'CURRENT'))
      )
        throw invalidCursor();
    } catch {
      throw invalidCursor();
    }
  }
  const items = [];
  const checks = new Set<() => Promise<void>>();
  const seen = new Set<string>();
  const limit = Math.min(50, page.limit);
  for (
    let partitions = 0;
    position < groups.length && partitions < 3 && items.length < limit;
    partitions++
  ) {
    const group = groups[position]!;
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: index,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': index + 'PK' },
        ExpressionAttributeValues: { ':pk': partitionName + group },
        ProjectionExpression: 'PK',
        ScanIndexForward: false,
        Limit: limit - items.length,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const row of result.Items ?? []) {
      const id =
        typeof row.PK === 'string' && /^ATTACHMENT#[0-9A-HJKMNP-TV-Z]{26}$/u.test(row.PK)
          ? row.PK.slice(11)
          : undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const receipt = await findAttachment(id);
      if (
        receipt?.parentType !== 'financeTransaction' ||
        receipt.status === 'deleted' ||
        (['pending_upload', 'cancelled', 'expired'].includes(receipt.status) &&
          receipt.uploaderId !== userId)
      )
        continue;
      let access;
      try {
        access =
          parent && receipt.parentId === transactionId ? parent : await authorize(receipt.parentId);
      } catch (error) {
        if (error instanceof SafeApiError && error.status === 404) continue;
        throw error;
      }
      const { transaction, source } = access;
      if (
        transaction.accountId !== group ||
        typeof transaction.id !== 'string' ||
        (parent && transaction.id !== parent.transaction.id)
      )
        continue;
      if (typeof transaction.effectiveAt !== 'string') continue;
      const day = localFinanceDate(transaction.effectiveAt, filters.timeZone);
      if (
        (filters.date && day !== filters.date) ||
        (filters.dateFrom && day < filters.dateFrom) ||
        (filters.dateTo && day > filters.dateTo)
      )
        continue;
      const allocations = Array.isArray(transaction.allocations) ? transaction.allocations : [];
      const selectedAllocations = [];
      const budgetLinks =
        'budgetLinks' in transaction && Array.isArray(transaction.budgetLinks)
          ? transaction.budgetLinks
          : [];
      for (const allocation of allocations) {
        const budget =
          typeof allocation.budgetItemId === 'string'
            ? await source.readCanonicalSource('financeBudgetItem', allocation.budgetItemId)
            : undefined;
        const budgetId = budgetLinks.find((link) => link.id === budget?.budgetId)?.id;
        if (
          (filters.budgetIds?.length && !filters.budgetIds.includes(budgetId)) ||
          (filters.categoryIds?.length &&
            !filters.categoryIds.includes(allocation.financeCategoryId)) ||
          (filters.subcategoryIds?.length &&
            !filters.subcategoryIds.includes(allocation.subcategoryId))
        )
          continue;
        selectedAllocations.push({
          ...(typeof allocation.classification?.categoryLabel === 'string'
            ? { category: allocation.classification.categoryLabel }
            : {}),
          ...(typeof allocation.classification?.subcategoryLabel === 'string'
            ? { subcategory: allocation.classification.subcategoryLabel }
            : {}),
        });
      }
      if (
        (filters.budgetIds?.length ||
          filters.categoryIds?.length ||
          filters.subcategoryIds?.length) &&
        !selectedAllocations.length
      )
        continue;
      const merchant =
        typeof transaction.merchantId === 'string'
          ? await source.readCanonicalSource('financeMerchant', transaction.merchantId)
          : undefined;
      if (
        filters.merchantIds?.length &&
        (!merchant || !filters.merchantIds.some((id) => id === transaction.merchantId))
      )
        continue;
      const blob =
        receipt.status === 'available' ? await findAttachmentBlob(receipt.blobId) : undefined;
      const content = verifiedReceiptVersion(receipt, blob);
      checks.add(access);
      items.push({
        ...receipt,
        parentId: transaction.id,
        transactionDate: day,
        transactionDescription:
          typeof transaction.description === 'string' ? transaction.description : undefined,
        merchant: typeof merchant?.name === 'string' ? merchant.name : undefined,
        classifications: selectedAllocations,
        budgets: budgetLinks,
        ...(content ? { etag: content.etag } : {}),
      });
    }
    startKey = result.LastEvaluatedKey as QueryKey | undefined;
    if (startKey) break;
    position++;
  }
  for (const check of checks) await check();
  if (parent) await parent();
  const visit = await authorize.assertUnlocked();
  if (visit.securityRevision !== context.securityRevision)
    throw new SafeApiError(403, 'finance_locked', 'Unlock Finance to continue.', 'authorization');
  const nextCursor =
    position < groups.length
      ? encodeFinanceCursor(
          { PK: groups[position]!, SK: startKey ? JSON.stringify(startKey) : '' },
          context,
          secret,
        )
      : undefined;
  return { items, ...(nextCursor ? { nextCursor } : {}) };
}
