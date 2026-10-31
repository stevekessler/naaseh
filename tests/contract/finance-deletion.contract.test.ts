import { describe, expect, it } from 'vitest';
import { financeDeletionConfirmationSchema, financeDeletionPreviewSchema } from '@naaseh/contracts';

describe('shared Finance deletion contract', () => {
  it('supports one role-aware preview schema and preserves categories for transaction deletion', () => {
    const preview = financeDeletionPreviewSchema.parse({
      recordType: 'transaction',
      recordId: '01J00000000000000000000001',
      expectedVersion: 2,
      outcome: 'archive',
      dependentCounts: { allocations: 1 },
      preservedRecordTypes: ['category'],
      confirmationToken: 'signed-preview-token',
      expiresAt: '2026-01-01T00:05:00.000Z',
    });
    expect(preview.preservedRecordTypes).toContain('category');
    expect(
      financeDeletionPreviewSchema.safeParse({ ...preview, hiddenDependentCount: 2 }).success,
    ).toBe(false);
  });

  it('requires the preview token and expected version for confirmation', () => {
    expect(
      financeDeletionConfirmationSchema.safeParse({
        expectedVersion: 1,
        confirmationToken: 'token',
      }).success,
    ).toBe(true);
    expect(financeDeletionConfirmationSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
  });
});
