import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { financeQueryFiltersSchema, type FinanceQueryFilters } from '@naaseh/contracts';
import { filterSpendSlices, localFinanceDate, type SpendSlice } from '@naaseh/domain';
import { normalizeFinanceText } from './text-postings.js';
export { normalizeFinanceText } from './text-postings.js';

export const FINANCE_MAX_EXAMINED = 1_000;
export const FINANCE_MAX_ROWS = 200;
export const FINANCE_QUERY_LIFETIME_MS = 15 * 60_000;
export interface FinanceFact {
  id: string;
  accountId: string;
  effectiveAt: string;
  currency: string;
  currencyExponent: number;
  amountMinor: number;
  description: string;
  payee?: string;
  memo?: string;
  merchantName?: string;
  merchantId?: string;
  checkNumber?: string;
  sourceVersion: number;
  textOrdinal?: number;
  textMonth?: string;
  sourceStatus?: 'active' | 'archived' | 'tombstone';
  pending?: boolean;
  provisional?: boolean;
  slices: SpendSlice[];
  originalSourceAccountIds?: string[];
}
export interface FinanceReadRequest {
  userId: string;
  accountId: string;
  sourceRevision: string;
  securityRevision: number;
  filters: Partial<FinanceQueryFilters>;
  limit?: number;
  cursor?: string | undefined;
}
export type FinanceReadContext = Omit<FinanceReadRequest, 'limit' | 'cursor'>;
export interface FinanceReadResult {
  items: FinanceFact[];
  nextCursor?: string;
  asOf: string;
  projectionRevision: string;
  complete: boolean;
  rowsState: 'searching' | 'ready' | 'confirmed-empty';
  aggregateState: 'pending' | 'exact' | 'failed';
  queryId?: string;
  coverage: { examined: number; scopeComplete: boolean };
  totalCount?: number;
  totalsByCurrency?: Array<{ currency: string; currencyExponent: number; amountMinor: number }>;
}

export function parseFinanceReadRequest(request: FinanceReadRequest) {
  if (
    !request.userId ||
    !request.accountId ||
    !request.sourceRevision ||
    !Number.isSafeInteger(request.securityRevision) ||
    request.securityRevision < 0
  )
    throw new Error('Invalid Finance read context.');
  const limit = request.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > FINANCE_MAX_ROWS)
    throw new Error('Finance row limit must be 1–200.');
  const filters = financeQueryFiltersSchema.parse(request.filters);
  return { ...request, filters, limit };
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return [...new Set(value)].sort().map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
};
export const financeReadFingerprint = (context: FinanceReadContext) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(context)))
    .digest('hex');

export interface FinanceCursorKey {
  PK: string;
  SK: string;
  beforeOrdinal?: number;
}
const cursorKey = (secret: string) => {
  if (secret.length < 32) throw new Error('Finance cursor secret is too short.');
  return createHash('sha256').update(`naaseh-finance-cursor-v2:${secret}`).digest();
};
/** Authenticated encryption conceals private probe keys as well as binding context and expiry. */
export function encodeFinanceCursor(
  key: FinanceCursorKey,
  context: FinanceReadContext,
  secret: string,
  now = Date.now(),
) {
  const iv = randomBytes(12);
  const fingerprint = financeReadFingerprint(context);
  const cipher = createCipheriv('aes-256-gcm', cursorKey(secret), iv);
  cipher.setAAD(Buffer.from(fingerprint));
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({ key, fingerprint, expiresAt: now + FINANCE_QUERY_LIFETIME_MS }),
      'utf8',
    ),
    cipher.final(),
  ]);
  return `v2.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}
export function decodeFinanceCursor(
  cursor: string,
  context: FinanceReadContext,
  secret: string,
  now = Date.now(),
): FinanceCursorKey {
  try {
    if (cursor.length > 4096) throw new Error();
    const [version, nonce, body, signature, extra] = cursor.split('.');
    if (version !== 'v2' || !nonce || !body || !signature || extra) throw new Error();
    const iv = Buffer.from(nonce, 'base64url');
    const tag = Buffer.from(signature, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const fingerprint = financeReadFingerprint(context);
    const decipher = createDecipheriv('aes-256-gcm', cursorKey(secret), iv);
    decipher.setAAD(Buffer.from(fingerprint));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]);
    const data = JSON.parse(plaintext.toString('utf8')) as {
      key?: { PK?: unknown; SK?: unknown; beforeOrdinal?: unknown };
      fingerprint?: unknown;
      expiresAt?: unknown;
    };
    if (
      data.fingerprint !== fingerprint ||
      typeof data.expiresAt !== 'number' ||
      data.expiresAt <= now ||
      typeof data.key?.PK !== 'string' ||
      typeof data.key.SK !== 'string' ||
      data.key.PK.length > 2048 ||
      data.key.SK.length > 1024 ||
      (data.key.beforeOrdinal !== undefined &&
        (typeof data.key.beforeOrdinal !== 'number' ||
          !Number.isSafeInteger(data.key.beforeOrdinal) ||
          data.key.beforeOrdinal < 0))
    )
      throw new Error();
    return {
      PK: data.key.PK,
      SK: data.key.SK,
      ...(typeof data.key.beforeOrdinal === 'number'
        ? { beforeOrdinal: data.key.beforeOrdinal }
        : {}),
    };
  } catch {
    throw new Error('Invalid or expired Finance cursor context.');
  }
}

export function matchesFinanceFact(fact: FinanceFact, filters: FinanceQueryFilters): boolean {
  if (fact.sourceStatus && fact.sourceStatus !== 'active') return false;
  if (filters.postedSpendOnly && !fact.slices.length) return false;
  if (filters.accountIds?.length && !filters.accountIds.includes(fact.accountId)) return false;
  if (
    filters.merchantIds?.length &&
    (!fact.merchantId || !filters.merchantIds.includes(fact.merchantId))
  )
    return false;
  if (filters.currency && filters.currency !== fact.currency) return false;
  if (filters.checkNumber && filters.checkNumber !== fact.checkNumber) return false;
  if (filters.amount !== undefined && filters.amount !== fact.amountMinor) return false;
  if (filters.amountMin !== undefined && fact.amountMinor < filters.amountMin) return false;
  if (filters.amountMax !== undefined && fact.amountMinor > filters.amountMax) return false;
  if (
    filters.text &&
    !normalizeFinanceText(
      [fact.description, fact.payee, fact.memo, fact.merchantName].filter(Boolean).join(' '),
    ).includes(normalizeFinanceText(filters.text))
  )
    return false;
  if (filters.date || filters.dateFrom || filters.dateTo) {
    const day = localFinanceDate(fact.effectiveAt, filters.timeZone);
    if (
      (filters.date && day !== filters.date) ||
      (filters.dateFrom && day < filters.dateFrom) ||
      (filters.dateTo && day > filters.dateTo)
    )
      return false;
  }
  const allocationFiltered = Boolean(
    filters.budgetIds?.length ||
      filters.budgetItemIds?.length ||
      filters.categoryIds?.length ||
      filters.subcategoryIds?.length,
  );
  return !allocationFiltered || filterSpendSlices(fact.slices, filters).length > 0;
}
