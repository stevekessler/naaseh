import type { Budget, BudgetItem } from './budget.js';
import type { FinancialTransaction } from './transaction.js';

export type TransactionMatchKind = 'exact' | 'near' | 'manual';
export type TransactionMatchStatus =
  | 'suggested'
  | 'accepted'
  | 'rejected'
  | 'undone'
  | 'invalidated'
  | 'tombstone';

export interface TransactionMatchScoreBasis {
  merchant: boolean;
  date: boolean;
  account: boolean;
  amountDifferencePercent: number;
}

export interface TransactionMatch {
  id: string;
  transactionId: string;
  budgetItemId: string;
  kind: TransactionMatchKind;
  scoreBasis: TransactionMatchScoreBasis;
  status: TransactionMatchStatus;
  decidedBy?: string;
  decidedAt?: string;
  version: number;
}

export interface MatchCandidate {
  budgetItemId: string;
  kind: 'exact' | 'near';
  scoreBasis: TransactionMatchScoreBasis;
}

export function createTransactionMatch(
  input: Omit<TransactionMatch, 'status' | 'version'>,
): TransactionMatch {
  if (!input.transactionId || !input.budgetItemId)
    throw new Error('A transaction match requires both records.');
  if (
    !Number.isFinite(input.scoreBasis.amountDifferencePercent) ||
    input.scoreBasis.amountDifferencePercent < 0 ||
    input.scoreBasis.amountDifferencePercent > 100_000
  ) {
    throw new Error('Transaction match amount difference is invalid.');
  }
  return { ...input, status: 'suggested', version: 1 };
}

const budgetContains = (budget: Budget, date: string) =>
  date >= budget.startDate && (budget.endDate === null || date <= budget.endDate);

export function scoreTransactionMatch(
  transaction: FinancialTransaction,
  item: BudgetItem,
  budget: Budget,
): MatchCandidate | undefined {
  if (
    transaction.status !== 'active' ||
    transaction.pending ||
    item.status !== 'active' ||
    budget.status === 'archived' ||
    budget.status === 'tombstone' ||
    transaction.currency !== item.currency ||
    Math.sign(transaction.amountMinor) !== Math.sign(item.plannedAmountMinor)
  )
    return undefined;
  const merchant = Boolean(item.merchantId && transaction.merchantId === item.merchantId);
  const date = budgetContains(budget, transaction.effectiveAt.slice(0, 10));
  const account = item.relatedAccountIds.includes(transaction.accountId);
  if (!merchant || !date || !account) return undefined;
  const amountDifferencePercent =
    (Math.abs(Math.abs(transaction.amountMinor) - Math.abs(item.plannedAmountMinor)) /
      Math.abs(item.plannedAmountMinor)) *
    100;
  const roundedDifference = Number(amountDifferencePercent.toFixed(4));
  if (roundedDifference === 0)
    return {
      budgetItemId: item.id,
      kind: 'exact',
      scoreBasis: { merchant, date, account, amountDifferencePercent: 0 },
    };
  if (amountDifferencePercent <= 20)
    return {
      budgetItemId: item.id,
      kind: 'near',
      scoreBasis: { merchant, date, account, amountDifferencePercent: roundedDifference },
    };
  return undefined;
}

export function chooseTransactionMatchCandidates(
  transaction: FinancialTransaction,
  items: readonly BudgetItem[],
  budgets: readonly Budget[],
) {
  const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));
  const candidates = items.flatMap((item) => {
    const budget = budgetById.get(item.budgetId);
    const scored = budget ? scoreTransactionMatch(transaction, item, budget) : undefined;
    return scored ? [scored] : [];
  });
  const exact = candidates.filter(({ kind }) => kind === 'exact');
  return exact.length === 1
    ? {
        automaticBudgetItemId: exact[0]!.budgetItemId,
        suggestions: candidates.filter(({ kind }) => kind === 'near'),
      }
    : { suggestions: candidates };
}

export function decideTransactionMatch(
  match: TransactionMatch,
  status: 'accepted' | 'rejected',
  actorId: string,
  now = new Date(),
): TransactionMatch {
  if (match.status !== 'suggested' && match.status !== 'undone') {
    throw new Error('Only a suggested or undone match can be decided.');
  }
  return {
    ...match,
    status,
    decidedBy: actorId,
    decidedAt: now.toISOString(),
    version: match.version + 1,
  };
}

export function acceptAutomaticTransactionMatch(match: TransactionMatch): TransactionMatch {
  if (match.kind !== 'exact' || match.status !== 'suggested')
    throw new Error('Only an exact suggestion can auto-match.');
  return { ...match, status: 'accepted' };
}

export function undoTransactionMatch(
  match: TransactionMatch,
  actorId: string,
  now = new Date(),
): TransactionMatch {
  if (match.status !== 'accepted') throw new Error('Only an accepted match can be undone.');
  return {
    ...match,
    status: 'undone',
    decidedBy: actorId,
    decidedAt: now.toISOString(),
    version: match.version + 1,
  };
}

export function invalidateTransactionMatch(match: TransactionMatch): TransactionMatch {
  if (match.status === 'invalidated' || match.status === 'tombstone') return match;
  return { ...match, status: 'invalidated', version: match.version + 1 };
}

export function tombstoneTransactionMatch(match: TransactionMatch): TransactionMatch {
  return match.status === 'tombstone'
    ? match
    : {
        ...match,
        scoreBasis: { merchant: false, date: false, account: false, amountDifferencePercent: 0 },
        status: 'tombstone',
        version: match.version + 1,
      };
}
