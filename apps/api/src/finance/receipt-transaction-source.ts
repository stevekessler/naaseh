import { createHash } from 'node:crypto';
import { FinanceUnitOfWork, loadTargetedFinanceEntity } from './unit-of-work.js';
import { SafeApiError } from '../shared/http.js';

const changed = () =>
  new SafeApiError(
    409,
    'receipt_source_changed',
    'The transaction changed. Refresh the receipt and try again.',
    'conflict',
  );

/** Follow aliases only within the original account and canonical scope revision. */
export async function resolveReceiptTransaction(id: string, work = new FinanceUnitOfWork()) {
  const original = await loadTargetedFinanceEntity<Record<string, unknown>>(
    work,
    'transactions',
    id,
  );
  if (!original) return undefined;
  let current = original;
  let canonicalId = id;
  let transferred = false;
  const visited = new Set<string>();
  while (current.value.status === 'tombstone') {
    if (visited.has(canonicalId) || visited.size >= 8) throw changed();
    visited.add(canonicalId);
    const alias = await work.get({
      PK: current.storageKey.PK,
      SK: 'ROW#transactionAliases#' + createHash('sha256').update(canonicalId).digest('hex'),
    });
    if (!alias) break;
    if (
      alias.collection !== 'transactionAliases' ||
      alias.entryKey !== canonicalId ||
      typeof alias.data !== 'string' ||
      !alias.data
    )
      throw changed();
    canonicalId = alias.data;
    const target = await loadTargetedFinanceEntity<Record<string, unknown>>(
      work,
      'transactions',
      canonicalId,
    );
    if (
      !target ||
      target.value.id !== canonicalId ||
      target.value.accountId !== original.value.accountId ||
      target.storageKey.PK !== original.storageKey.PK ||
      target.scopeRevision !== original.scopeRevision
    )
      throw changed();
    current = target;
    transferred = true;
  }
  return {
    id: canonicalId,
    status: current.value.status,
    scopeRevision: current.scopeRevision,
    accountId: current.value.accountId,
    transferred,
  };
}
