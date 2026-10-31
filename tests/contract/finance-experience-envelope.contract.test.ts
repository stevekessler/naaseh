import { describe, expect, it } from 'vitest';
import { financeSyncEntitySchema } from '@naaseh/contracts';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';
describe('Finance v2 additive protected envelopes', () => {
  it('preserves original calendar context and never admits security verifiers or grants to generic sync', () => {
    const { enteredAt, localDate, timeZone } = buildExperienceFixture().calendarCases[1]!;
    const value = {
      id: experienceId(800),
      version: 1,
      entityType: 'financeUpcomingExpense',
      entryContext: { enteredAt, localDate, timeZone },
    };
    expect(financeSyncEntitySchema.parse(value)).toEqual(value);
    expect(
      financeSyncEntitySchema.safeParse({
        ...value,
        entryContext: { enteredAt, localDate: '2026-10-28', timeZone },
      }).success,
    ).toBe(false);
    for (const entityType of [
      'financeSecurityPreference',
      'financeUnlockGrant',
      'offlineFinanceVerifier',
    ])
      expect(
        financeSyncEntitySchema.safeParse({ id: value.id, version: 1, entityType }).success,
      ).toBe(false);
  });
});
