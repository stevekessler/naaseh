import { describe, expect, it } from 'vitest';
import {
  CRISIS_PLAN_MAX_RECIPIENTS,
  assertCrisisPlanRecipientLimit,
  assertCrisisPlanVersion,
  crisisPlanOperations,
  crisisPlanRecordSchema,
  crisisPlanShareSchema,
} from '../src/crisis-plan.js';
import {
  crisisPlanGrantFixture,
  crisisPlanRecordFixture,
} from '../../../tests/fixtures/crisis-plan.js';

describe('Crisis Plan domain', () => {
  it('validates ciphertext-only generations, versions, and rotation state', () => {
    expect(crisisPlanRecordSchema.parse(crisisPlanRecordFixture()).version).toBe(1);
    expect(
      crisisPlanRecordSchema.safeParse({ ...crisisPlanRecordFixture(), content: '<p>unsafe</p>' })
        .success,
    ).toBe(false);
    expect(
      crisisPlanRecordSchema.safeParse({ ...crisisPlanRecordFixture(), keyGeneration: 0 }).success,
    ).toBe(false);
    expect(
      crisisPlanRecordSchema.parse(crisisPlanRecordFixture({ rotationState: 'rotation_required' }))
        .rotationState,
    ).toBe('rotation_required');
  });

  it('bounds recipients and requires a grant for an active share', () => {
    expect(() => assertCrisisPlanRecipientLimit(CRISIS_PLAN_MAX_RECIPIENTS)).not.toThrow();
    expect(() => assertCrisisPlanRecipientLimit(CRISIS_PLAN_MAX_RECIPIENTS + 1)).toThrow(
      'at most 90',
    );
    expect(
      crisisPlanShareSchema.safeParse({
        planId: crisisPlanRecordFixture().planId,
        ownerId: 'owner',
        recipientId: 'recipient',
        version: 1,
        state: 'active',
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      crisisPlanShareSchema.safeParse({
        planId: crisisPlanRecordFixture().planId,
        ownerId: 'owner-1',
        recipientId: 'recipient-1',
        version: 1,
        state: 'active',
        grant: crisisPlanGrantFixture(),
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it('enforces optimistic versions and has no delete transition', () => {
    expect(() => assertCrisisPlanVersion(3, 2)).toThrow('changed on another device');
    expect(crisisPlanOperations).not.toContain('delete');
  });
});
