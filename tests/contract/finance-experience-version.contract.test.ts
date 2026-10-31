import { describe, expect, it } from 'vitest';
import {
  currentSyncContractVersion,
  entityTypeSchema,
  supportedSyncContractVersionSchema,
} from '@naaseh/domain';
import {
  financeContractVersion,
  financeEntryContextSchema,
  financeTaskTargetSchema,
} from '@naaseh/contracts';
import { buildExperienceFixture } from '../fixtures/finance/experience.js';
import { financeDeliveryDecision } from '../../apps/api/src/sync/types.js';

describe('Finance experience additive capabilities', () => {
  it('reserves v8/Finance v2 while retaining earlier non-Finance client versions', () => {
    expect(currentSyncContractVersion).toBe(8);
    expect(financeContractVersion).toBe(2);
    for (const version of [4, 5, 6, 7, 8])
      expect(supportedSyncContractVersionSchema.parse(version)).toBe(version);
    for (const kind of [
      'financeUpcomingExpense',
      'financeFulfillment',
      'financeReceipt',
      'financeDashboardPreference',
      'financeRefundRelationship',
    ])
      expect(entityTypeSchema.parse(kind)).toBe(kind);
    expect(
      financeDeliveryDecision({ contractVersion: 7, requirePin: true, unlocked: true }),
    ).toEqual({ allowed: false, reason: 'finance_upgrade_required' });
    expect(
      financeDeliveryDecision({ contractVersion: 8, requirePin: true, unlocked: false }),
    ).toEqual({ allowed: false, reason: 'finance_unlock_required' });
    expect(
      financeDeliveryDecision({ contractVersion: 7, requirePin: false, unlocked: false }),
    ).toEqual({ allowed: true });
  });

  it('round-trips immutable original calendar contexts and adapts legacy budget-item targets', () => {
    const f = buildExperienceFixture();
    for (const { enteredAt, localDate, timeZone } of f.calendarCases)
      expect(financeEntryContextSchema.parse({ enteredAt, localDate, timeZone })).toEqual({
        enteredAt,
        localDate,
        timeZone,
      });
    expect(
      financeEntryContextSchema.safeParse({
        enteredAt: f.calendarCases[0]!.enteredAt,
        localDate: '2026-10-28',
        timeZone: 'UTC',
      }).success,
    ).toBe(false);
    expect(
      financeTaskTargetSchema.parse({
        budgetId: f.legacyTaskLink.budgetId,
        budgetItemId: f.legacyTaskLink.budgetItemId,
      }),
    ).toEqual({
      targetType: 'budgetItem',
      targetId: f.legacyTaskLink.budgetItemId,
      budgetId: f.legacyTaskLink.budgetId,
    });
  });
});
