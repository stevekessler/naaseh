import MiniSearch from 'minisearch';
import type { FinanceMerchant, FinancialTransaction } from '@naaseh/domain';
import { db } from '../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../db/finance-repository.js';

export interface FinanceSearchDocument {
  id: string;
  accountId: string;
  description: string;
  payee?: string;
  memo?: string;
  merchantName?: string;
}

export interface FinanceIndexProgress {
  indexed: number;
  total: number;
  complete: boolean;
}

export interface FinanceMerchantSearchDocument {
  id: string;
  name: string;
  city?: string;
  region?: string;
}

export interface FinanceAccountSearchOption {
  id: string;
  friendlyName: string;
}

export type FinanceSearchHit =
  | {
      id: string;
      kind: 'transaction';
      title: string;
      accountId: string;
      accountName: string;
      memo?: string;
      effectiveAt?: string;
      pending: boolean;
      amountMinor?: number;
      currency?: string;
      currencyExponent?: number;
    }
  | {
      id: string;
      kind: 'merchant';
      title: string;
      city?: string;
      region?: string;
    };

export interface FinanceSearchSource {
  accounts: FinanceAccountSearchOption[];
  transactions: Array<
    FinanceSearchDocument & {
      effectiveAt?: string;
      pending?: boolean;
      amountMinor?: number;
      currency?: string;
      currencyExponent?: number;
    }
  >;
  merchants: FinanceMerchantSearchDocument[];
}

const createIndex = () =>
  new MiniSearch<FinanceSearchDocument>({
    fields: ['description', 'payee', 'memo', 'merchantName'],
    storeFields: ['id', 'accountId'],
    idField: 'id',
  });

export {
  registerFinanceSearchIndex,
  clearFinanceSearchIndexes,
} from './finance-index-lifecycle.js';

const createMerchantIndex = () =>
  new MiniSearch<FinanceMerchantSearchDocument>({
    fields: ['name', 'city', 'region'],
    storeFields: ['id'],
    idField: 'id',
  });

/** Combined Finance index. Documents and aggregate state remain in memory only. */
export class FinanceSearchIndex {
  private transactions = new FinanceTransactionIndex();
  private transactionDocuments = new Map<string, FinanceSearchSource['transactions'][number]>();
  private merchants = createMerchantIndex();
  private merchantDocuments = new Map<string, FinanceMerchantSearchDocument>();
  private accounts = new Map<string, FinanceAccountSearchOption>();
  private generation = 0;

  async replaceProgressively(
    source: FinanceSearchSource,
    options: {
      batchSize?: number;
      onProgress?: (progress: FinanceIndexProgress) => void;
      yieldToMain?: () => Promise<void>;
    } = {},
  ) {
    const generation = ++this.generation;
    this.clear(false);
    this.generation = generation;
    this.accounts = new Map(source.accounts.map((account) => [account.id, account]));
    const allowed = new Set(this.accounts.keys());
    const transactions = source.transactions.filter((document) => allowed.has(document.accountId));
    const total = transactions.length + source.merchants.length;
    const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 2_000);
    const yieldToMain =
      options.yieldToMain ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    options.onProgress?.({ indexed: 0, total, complete: total === 0 });
    let indexed = 0;
    for (let start = 0; start < transactions.length; start += batchSize) {
      if (generation !== this.generation) return;
      const batch = transactions.slice(start, start + batchSize);
      for (const document of batch) this.transactionDocuments.set(document.id, document);
      this.transactions.addDocuments(batch);
      indexed += batch.length;
      options.onProgress?.({ indexed, total, complete: indexed === total });
      if (indexed < total) await yieldToMain();
    }
    for (let start = 0; start < source.merchants.length; start += batchSize) {
      if (generation !== this.generation) return;
      const batch = source.merchants.slice(start, start + batchSize);
      for (const document of batch) this.merchantDocuments.set(document.id, document);
      this.merchants.addAll(batch);
      indexed += batch.length;
      options.onProgress?.({ indexed, total, complete: indexed === total });
      if (indexed < total) await yieldToMain();
    }
  }

  search(
    query: string,
    options: {
      includeTransactions: boolean;
      includeMerchants: boolean;
      accountId?: string;
      limit?: number;
    },
  ): FinanceSearchHit[] {
    const limit = options.limit ?? 200;
    const hits: FinanceSearchHit[] = [];
    if (options.includeTransactions) {
      for (const id of this.transactions.search(query, {
        ...(options.accountId && options.accountId !== 'all'
          ? { accountId: options.accountId }
          : {}),
        limit,
      })) {
        const document = this.transactionDocuments.get(id);
        const account = document ? this.accounts.get(document.accountId) : undefined;
        if (!document || !account) continue;
        hits.push({
          id,
          kind: 'transaction',
          title: document.description,
          accountId: account.id,
          accountName: account.friendlyName,
          ...(document.memo ? { memo: document.memo } : {}),
          ...(document.effectiveAt ? { effectiveAt: document.effectiveAt } : {}),
          pending: document.pending === true,
          ...(document.amountMinor === undefined ? {} : { amountMinor: document.amountMinor }),
          ...(document.currency ? { currency: document.currency } : {}),
          ...(document.currencyExponent === undefined
            ? {}
            : { currencyExponent: document.currencyExponent }),
        });
      }
    }
    if (options.includeMerchants) {
      const normalized = query.normalize('NFC').trim();
      const ids = normalized
        ? this.merchants
            .search(normalized, { prefix: true, fuzzy: 0.2 })
            .map(({ id }) => String(id))
        : [...this.merchantDocuments.keys()];
      for (const id of ids.slice(0, Math.max(0, limit - hits.length))) {
        const merchant = this.merchantDocuments.get(id);
        if (!merchant) continue;
        hits.push({
          id,
          kind: 'merchant',
          title: merchant.name,
          ...(merchant.city ? { city: merchant.city } : {}),
          ...(merchant.region ? { region: merchant.region } : {}),
        });
      }
    }
    return hits.slice(0, limit);
  }

  removeAccount(accountId: string) {
    this.generation += 1;
    this.accounts.delete(accountId);
    this.transactions.removeAccount(accountId);
    for (const [id, document] of this.transactionDocuments) {
      if (document.accountId === accountId) this.transactionDocuments.delete(id);
    }
  }

  upsertTransaction(document: FinanceSearchSource['transactions'][number]) {
    if (!this.accounts.has(document.accountId)) return false;
    if (this.transactionDocuments.has(document.id)) this.transactions.remove(document.id);
    this.transactionDocuments.set(document.id, document);
    this.transactions.addDocuments([document]);
    return true;
  }

  upsertMerchant(document: FinanceMerchantSearchDocument) {
    if (this.merchantDocuments.has(document.id)) this.merchants.discard(document.id);
    this.merchantDocuments.set(document.id, document);
    this.merchants.add(document);
  }

  clear(incrementGeneration = true) {
    if (incrementGeneration) this.generation += 1;
    this.transactions.clear();
    this.transactionDocuments.clear();
    this.merchants = createMerchantIndex();
    this.merchantDocuments.clear();
    this.accounts.clear();
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

/** Decrypts only authorized local projections, then returns short-lived indexing documents. */
export async function loadAuthorizedFinanceSearchSource(): Promise<FinanceSearchSource> {
  const records = await db.secureFinanceRecords
    .filter(({ entityType }) =>
      ['financeAccount', 'financeTransaction', 'financeMerchant'].includes(entityType),
    )
    .toArray();
  if (!records.length) return { accounts: [], transactions: [], merchants: [] };
  const key = await financeDeviceKey();
  const decrypted = await Promise.all(
    records.map(async (record) => ({ record, value: await decryptFinanceRecord(record, key) })),
  );
  const accounts = decrypted
    .filter(({ record }) => record.entityType === 'financeAccount')
    .flatMap(({ value }) => {
      if (!isRecord(value) || typeof value.id !== 'string') return [];
      const friendlyName =
        typeof value.friendlyName === 'string'
          ? value.friendlyName
          : typeof value.accountName === 'string'
            ? value.accountName
            : undefined;
      return friendlyName ? [{ id: value.id, friendlyName }] : [];
    });
  const accountIds = new Set(accounts.map(({ id }) => id));
  const transactions = decrypted
    .filter(({ record }) => record.entityType === 'financeTransaction')
    .flatMap(({ value }) => {
      const transaction = value as Partial<FinancialTransaction>;
      if (
        !isRecord(value) ||
        typeof transaction.id !== 'string' ||
        typeof transaction.accountId !== 'string' ||
        typeof transaction.description !== 'string' ||
        transaction.status !== 'active' ||
        !accountIds.has(transaction.accountId)
      )
        return [];
      return [
        {
          id: transaction.id,
          accountId: transaction.accountId,
          description: transaction.description,
          ...(transaction.payee ? { payee: transaction.payee } : {}),
          ...(transaction.memo ? { memo: transaction.memo } : {}),
          ...(transaction.effectiveAt ? { effectiveAt: transaction.effectiveAt } : {}),
          pending: transaction.pending === true,
          ...(transaction.amountMinor === undefined
            ? {}
            : { amountMinor: transaction.amountMinor }),
          ...(transaction.currency ? { currency: transaction.currency } : {}),
          ...(transaction.currencyExponent === undefined
            ? {}
            : { currencyExponent: transaction.currencyExponent }),
        },
      ];
    });
  const merchants = decrypted
    .filter(({ record }) => record.entityType === 'financeMerchant')
    .flatMap(({ value }) => {
      const merchant = value as Partial<FinanceMerchant>;
      if (
        !isRecord(value) ||
        typeof merchant.id !== 'string' ||
        typeof merchant.name !== 'string' ||
        merchant.status !== 'active'
      )
        return [];
      return [
        {
          id: merchant.id,
          name: merchant.name,
          ...(merchant.city ? { city: merchant.city } : {}),
          ...(merchant.region ? { region: merchant.region } : {}),
        },
      ];
    });
  return { accounts, transactions, merchants };
}

/** Plaintext Finance search state. This class intentionally has no serialization API. */
export class FinanceTransactionIndex {
  private index = createIndex();
  private documents = new Map<string, FinanceSearchDocument>();
  private generation = 0;

  async replaceProgressively(
    documents: readonly FinanceSearchDocument[],
    options: {
      batchSize?: number;
      onProgress?: (progress: FinanceIndexProgress) => void;
      yieldToMain?: () => Promise<void>;
    } = {},
  ) {
    const generation = ++this.generation;
    this.index = createIndex();
    this.documents.clear();
    const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 2_000);
    const yieldToMain =
      options.yieldToMain ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    options.onProgress?.({ indexed: 0, total: documents.length, complete: documents.length === 0 });
    for (let start = 0; start < documents.length; start += batchSize) {
      if (generation !== this.generation) return;
      const batch = documents.slice(start, start + batchSize);
      for (const document of batch) this.documents.set(document.id, document);
      this.index.addAll([...batch]);
      const indexed = Math.min(start + batch.length, documents.length);
      options.onProgress?.({
        indexed,
        total: documents.length,
        complete: indexed === documents.length,
      });
      if (indexed < documents.length) {
        await yieldToMain();
        if (generation !== this.generation) return;
      }
    }
  }

  addDocuments(documents: readonly FinanceSearchDocument[]) {
    for (const document of documents) this.documents.set(document.id, document);
    this.index.addAll([...documents]);
  }

  remove(id: string) {
    if (!this.documents.has(id)) return;
    this.index.discard(id);
    this.documents.delete(id);
  }

  search(query: string, options: { accountId?: string; limit?: number } = {}) {
    const normalized = query.normalize('NFC').trim();
    if (!normalized)
      return [...this.documents.values()]
        .filter(({ accountId }) => !options.accountId || accountId === options.accountId)
        .slice(0, options.limit ?? 200)
        .map(({ id }) => id);
    return this.index
      .search(normalized, {
        prefix: true,
        fuzzy: 0.2,
        filter: (result) => !options.accountId || result.accountId === options.accountId,
      })
      .slice(0, options.limit ?? 200)
      .map((result) => String(result.id));
  }

  removeAccount(accountId: string) {
    this.generation += 1;
    for (const [id, document] of this.documents) {
      if (document.accountId !== accountId) continue;
      this.index.discard(id);
      this.documents.delete(id);
    }
  }

  clear() {
    this.generation += 1;
    this.index = createIndex();
    this.documents.clear();
  }
}
