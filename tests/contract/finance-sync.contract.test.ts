import { describe, expect, it } from 'vitest';
import {
  currentSyncContractVersion,
  entityTypeSchema,
  supportedSyncContractVersionSchema,
} from '@naaseh/domain';

describe('Finance sync contract', () => {
  it('negotiates sync v7 and recognizes every foundational Finance entity family', () => {
    expect(currentSyncContractVersion).toBe(7);
    expect(supportedSyncContractVersionSchema.parse(7)).toBe(7);
    for (const entityType of [
      'financeAccount',
      'financeBalanceSnapshot',
      'financeTransaction',
      'financeCategory',
      'financeMerchant',
      'financeBudget',
      'financeBudgetItem',
      'financeReviewIssue',
    ]) {
      expect(entityTypeSchema.parse(entityType)).toBe(entityType);
    }
  });
});
