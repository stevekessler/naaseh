import { describe, expect, it } from 'vitest';
import { createBudget, createBudgetItem } from './budget.js';
import { createFinancialTransaction } from './transaction.js';
import {
  chooseTransactionMatchCandidates,
  createTransactionMatch,
  decideTransactionMatch,
  undoTransactionMatch,
} from './match.js';

const budget = createBudget({
  id: 'budget-1',
  groupId: 'group-1',
  name: 'September',
  budgetDate: '2027-09-01',
  startDate: '2027-09-01',
  endDate: '2027-09-30',
});
const item = (id: string, amount = -4_100) =>
  createBudgetItem({
    id,
    budgetId: budget.id,
    description: 'Apple storage',
    merchantId: 'merchant-1',
    financeCategoryId: 'category-1',
    plannedAmountMinor: amount,
    currency: 'USD',
    relatedAccountIds: ['account-1'],
    creatorId: 'member-1',
  });
const transaction = (amount: number) =>
  createFinancialTransaction({
    id: `transaction-${amount}`,
    accountId: 'account-1',
    origin: 'manual',
    amountMinor: amount,
    currency: 'USD',
    transactedAt: '2027-09-15T12:00:00.000Z',
    description: 'Apple',
    merchantId: 'merchant-1',
    pending: false,
    connectedAccount: false,
  });

describe('transaction matches', () => {
  it('automatically chooses only one unique exact candidate', () => {
    expect(
      chooseTransactionMatchCandidates(transaction(-4_100), [item('item-1')], [budget]),
    ).toMatchObject({ automaticBudgetItemId: 'item-1', suggestions: [] });
    const ambiguous = chooseTransactionMatchCandidates(
      transaction(-4_100),
      [item('item-1'), item('item-2')],
      [budget],
    );
    expect(ambiguous.automaticBudgetItemId).toBeUndefined();
    expect(ambiguous.suggestions).toHaveLength(2);
  });

  it('includes near differences through exactly twenty percent as suggestions only', () => {
    const near = chooseTransactionMatchCandidates(transaction(-4_920), [item('item-1')], [budget]);
    expect(near.automaticBudgetItemId).toBeUndefined();
    expect(near.suggestions[0]).toMatchObject({ budgetItemId: 'item-1', kind: 'near' });
    expect(near.suggestions[0]?.scoreBasis.amountDifferencePercent).toBe(20);
    expect(
      chooseTransactionMatchCandidates(transaction(-4_921), [item('item-1')], [budget]).suggestions,
    ).toEqual([]);
  });

  it('records decisions and keeps accepted matches undoable', () => {
    const suggested = createTransactionMatch({
      id: 'match-1',
      transactionId: 'transaction-1',
      budgetItemId: 'item-1',
      kind: 'near',
      scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 10 },
    });
    const accepted = decideTransactionMatch(
      suggested,
      'accepted',
      'member-1',
      new Date('2027-09-16T00:00:00Z'),
    );
    expect(accepted).toMatchObject({ status: 'accepted', decidedBy: 'member-1', version: 2 });
    expect(
      undoTransactionMatch(accepted, 'member-1', new Date('2027-09-17T00:00:00Z')),
    ).toMatchObject({ status: 'undone', version: 3 });
  });
});
