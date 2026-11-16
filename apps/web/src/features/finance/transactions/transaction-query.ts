import { db } from '../../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../../db/finance-repository.js';
import { readFinanceCachedData } from '../../../sync/finance-cache-access.js';
import {
  filterFinanceDocuments,
  type FinanceBrowseDocument,
  type FinanceIndexProgress,
} from '../../../search/finance-index.js';
import { financeQueryEnvelopeSchema, financeQueryFiltersSchema } from '@naaseh/contracts';
import type { z } from 'zod';
import { financeRequest } from '../finance-client.js';
import type { TransactionFilterValues } from './TransactionFilters.js';

export interface TransactionBrowseRow {
  id: string;
  accountId: string;
  effectiveAt?: string;
  description: string;
  payee?: string;
  merchantName?: string;
  merchantId?: string;
  reviewState?: string;
  classificationNames?: string[];
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  paymentType?: string;
  checkNumber?: string;
  receiptAvailable?: boolean;
  allocations?: Array<{ financeCategoryId: string; subcategoryId?: string }>;
  slices?: Array<{ financeCategoryId?: string; categoryId?: string; subcategoryId?: string }>;
}

export type TransactionQueryPage = Omit<z.infer<typeof financeQueryEnvelopeSchema>, 'items'> & {
  items: TransactionBrowseRow[];
};

export function transactionFilters(values: TransactionFilterValues, accountIds: string[]) {
  const input: Record<string, unknown> = {
    accountIds,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    input[key] = key.startsWith('amount') ? Number(value) : value;
  }
  return financeQueryFiltersSchema.parse(input);
}

export async function startTransactionQuery(
  filters: ReturnType<typeof transactionFilters>,
  accountId: string | undefined,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ browse: '1' });
  for (const id of filters.accountIds ?? []) params.append('accountIds[]', id);
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'string' || typeof value === 'number') params.set(key, String(value));
  }
  const route = accountId
    ? '/finance/accounts/' + encodeURIComponent(accountId) + '/transactions'
    : '/finance/transactions';
  return financeRequest<TransactionQueryPage>(route + '?' + params, { signal });
}

export function continueTransactionQuery(queryId: string, signal: AbortSignal, cursor?: string) {
  const url = '/finance/queries/' + encodeURIComponent(queryId) + '/rows';
  return financeRequest<TransactionQueryPage>(
    cursor ? url + '?' + new URLSearchParams({ cursor }) : url,
    { signal },
  );
}

export function waitForTransactionQuery(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 300);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export async function readCachedTransactionQuery(
  filters: ReturnType<typeof transactionFilters>,
  signal: AbortSignal,
  progress?: (progress: FinanceIndexProgress) => void,
) {
  return readFinanceCachedData(async (lease) => {
    const cache = db.secureFinanceRecords;
    const key = await financeDeviceKey();
    const [accountRecords, merchantRecords, categoryRecords] = await Promise.all([
      cache.where('entityType').equals('financeAccount').toArray(),
      cache.where('entityType').equals('financeMerchant').toArray(),
      cache.where('entityType').equals('financeCategory').toArray(),
    ]);
    const decode = async <T>(record: (typeof accountRecords)[number]) =>
      (await decryptFinanceRecord(record, key, lease)) as T | undefined;
    type Account = {
      id: string;
      friendlyName: string;
      sourceName?: string;
      organizationName?: string;
      status: string;
    };
    const accounts = new Map<string, Account>();
    for (const record of accountRecords) {
      signal.throwIfAborted();
      const account = await decode<Account>(record);
      if (
        account?.id &&
        account.status !== 'deleting' &&
        account.status !== 'tombstone' &&
        (!filters.accountIds?.length || filters.accountIds.includes(account.id))
      )
        accounts.set(account.id, account);
    }
    const merchants = new Map<string, string>();
    for (const record of merchantRecords) {
      signal.throwIfAborted();
      const merchant = await decode<{ id: string; name: string }>(record);
      if (merchant) merchants.set(merchant.id, merchant.name);
    }
    const categories = [];
    for (const record of categoryRecords) {
      signal.throwIfAborted();
      const category = await decode<{ id: string; name: string }>(record);
      if (category) categories.push(category);
    }
    const rows = new Map<string, TransactionBrowseRow>();
    const documents: FinanceBrowseDocument[] = [];
    let lastCachedChange: string | undefined;
    for (const account of accounts.values()) {
      const records = await cache.where('accountId').equals(account.id).toArray();
      for (const record of records) {
        signal.throwIfAborted();
        if (record.entityType !== 'financeTransaction') continue;
        const row = await decode<
          TransactionBrowseRow & { status: string; merchantId?: string; memo?: string }
        >(record);
        if (row?.status !== 'active' || !row.effectiveAt || row.accountId !== account.id) continue;
        const merchantName = row.merchantId ? merchants.get(row.merchantId) : undefined;
        rows.set(row.id, { ...row, ...(merchantName ? { merchantName } : {}) });
        documents.push({
          id: row.id,
          accountId: row.accountId,
          effectiveAt: row.effectiveAt,
          description: row.description,
          currency: row.currency,
          amountMinor: row.amountMinor,
          accountNames: [account.friendlyName, account.sourceName, account.organizationName].filter(
            (name): name is string => typeof name === 'string',
          ),
          ...(row.payee ? { payee: row.payee } : {}),
          ...(row.memo ? { memo: row.memo } : {}),
          ...(row.checkNumber ? { checkNumber: row.checkNumber } : {}),
          ...(merchantName ? { merchantName } : {}),
        });
        if (!lastCachedChange || record.updatedAt > lastCachedChange)
          lastCachedChange = record.updatedAt;
      }
    }
    const ids = await filterFinanceDocuments({ documents, filters }, signal, progress);
    signal.throwIfAborted();
    return {
      items: ids.map((id) => rows.get(id)!),
      categories,
      examined: documents.length,
      lastCachedChange,
    };
  });
}
