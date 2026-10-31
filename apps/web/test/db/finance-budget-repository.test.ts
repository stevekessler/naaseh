import { describe, expect, it } from 'vitest';
import type { SyncChange } from '@naaseh/domain';
import { financeBudgetConflictReview, orderFinanceHydration } from '../../src/sync/finance-sync.js';

describe('offline Finance budget projections', () => {
  it('hydrates budgets before links and items so queued edits always have their parent', () => {
    const change = (entityType: SyncChange['entityType'], sequence: number): SyncChange => ({
      audience: 'GROUP#fixture',
      entityId: `${entityType}-${sequence}`,
      entityType,
      sequence,
      operation: 'upsert',
      changedAt: '2026-04-01T00:00:00.000Z',
    });
    const ordered = orderFinanceHydration([
      change('financeTransactionMatch', 1),
      change('financeBudgetItem', 2),
      change('financeBudgetAccountLink', 3),
      change('financeBudget', 4),
      change('financeReusableItem', 5),
      change('financeTransaction', 6),
      change('financeReconciliation', 7),
      change('financeTaskLink', 8),
    ]);
    expect(ordered.map(({ entityType }) => entityType)).toEqual([
      'financeReusableItem',
      'financeBudget',
      'financeBudgetAccountLink',
      'financeBudgetItem',
      'financeTransaction',
      'financeTransactionMatch',
      'financeReconciliation',
      'financeTaskLink',
    ]);
  });

  it('reviews semantic fields without exposing scope or hidden-account metadata', () => {
    const review = financeBudgetConflictReview(
      { name: 'Mine', plannedAmountMinor: -1_000, scopeKey: 'GROUP#secret', hiddenAccountCount: 2 },
      { name: 'Current', plannedAmountMinor: -900, scopeKey: 'OWNER#other', hiddenAccountCount: 5 },
    );
    expect(review.fields).toEqual([
      { field: 'name', local: 'Mine', current: 'Current' },
      { field: 'plannedAmountMinor', local: -1_000, current: -900 },
    ]);
    expect(JSON.stringify(review)).not.toContain('GROUP#secret');
    expect(JSON.stringify(review)).not.toContain('hiddenAccountCount');
    expect(review.resolutions).toEqual(['keep-mine', 'use-current', 'review-later']);
  });
});
