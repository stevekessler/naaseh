import type { FinancialTransaction } from './transaction.js';

export function normalizeReconciliationText(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const calendarDate = (transaction: FinancialTransaction) => {
  const value = transaction.transactedAt ?? transaction.postedAt;
  return value ? Date.parse(new Date(value).toISOString().slice(0, 10)) : Number.NaN;
};

const correspondingTextMatches = (left: FinancialTransaction, right: FinancialTransaction) => {
  const payeeLeft = normalizeReconciliationText(left.payee ?? '');
  const payeeRight = normalizeReconciliationText(right.payee ?? '');
  if (payeeLeft && payeeRight && payeeLeft === payeeRight) return true;
  const descriptionLeft = normalizeReconciliationText(left.description);
  const descriptionRight = normalizeReconciliationText(right.description);
  return Boolean(descriptionLeft && descriptionRight && descriptionLeft === descriptionRight);
};

export function isExactProviderCandidate(
  provisional: FinancialTransaction,
  provider: FinancialTransaction,
) {
  if (provisional.reconciliationState !== 'provisional' || provider.origin !== 'simplefin')
    return false;
  if (
    provisional.accountId !== provider.accountId ||
    provisional.currency !== provider.currency ||
    provisional.amountMinor !== provider.amountMinor ||
    !correspondingTextMatches(provisional, provider)
  )
    return false;
  const days = Math.abs(calendarDate(provisional) - calendarDate(provider)) / 86_400_000;
  return Number.isFinite(days) && days <= 3;
}

export function exactProviderCandidates(
  provisional: readonly FinancialTransaction[],
  provider: FinancialTransaction,
) {
  return provisional.filter((candidate) => isExactProviderCandidate(candidate, provider));
}

export function reconcileProviderTransaction(
  provisional: FinancialTransaction,
  provider: FinancialTransaction,
  actorId: string,
  now = new Date(),
) {
  if (!isExactProviderCandidate(provisional, provider))
    throw new Error('Transactions are not an exact reconciliation match.');
  if (
    !provider.providerConnectionId ||
    !provider.providerAccountId ||
    !provider.sourceTransactionId ||
    !provider.providerSnapshot
  ) {
    throw new Error('Provider identity is incomplete.');
  }
  const transaction: FinancialTransaction = {
    ...provisional,
    amountMinor: provider.amountMinor,
    ...(provider.postedAt ? { postedAt: provider.postedAt } : {}),
    ...(provider.transactedAt ? { transactedAt: provider.transactedAt } : {}),
    effectiveAt: provider.effectiveAt,
    description: provider.description,
    ...(provider.payee ? { payee: provider.payee } : {}),
    pending: provider.pending,
    providerConnectionId: provider.providerConnectionId,
    providerAccountId: provider.providerAccountId,
    sourceTransactionId: provider.sourceTransactionId,
    providerSnapshot: provider.providerSnapshot,
    reconciliationState: 'reconciled' as const,
    reconciledAt: now.toISOString(),
    reconciledBy: actorId,
    reviewState: 'none' as const,
    version: provisional.version + 1,
  };
  if (!provider.postedAt) delete transaction.postedAt;
  if (!provider.transactedAt) delete transaction.transactedAt;
  return {
    transaction,
    identityTransfer: {
      fromTransactionId: provider.id,
      toTransactionId: provisional.id,
      connectionId: provider.providerConnectionId,
      providerAccountId: provider.providerAccountId,
      sourceTransactionId: provider.sourceTransactionId,
    },
  };
}

export function reconciliationPairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join(':');
}

export function shouldSuppressReconciliationReview(
  keys: ReadonlySet<string>,
  leftId: string,
  rightId: string,
) {
  return keys.has(reconciliationPairKey(leftId, rightId));
}
