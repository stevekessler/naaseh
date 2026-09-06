import { describe, expect, it } from 'vitest';
import { validateCrisisPlanRestore } from '../../apps/api/src/journal/crisis-plan-restore-validator.js';
import { crisisPlanBackupFixture } from './fixtures/crisis-plan-backup.js';

describe('Crisis Plan encrypted restore', () => {
  it('validates ciphertext/share generations without decrypting content', () => {
    const fixture = crisisPlanBackupFixture();
    expect(validateCrisisPlanRestore({ plans: [fixture.plan], shares: fixture.shares })).toEqual({
      planCount: 1,
      shareCount: 1,
      plaintextInspected: false,
    });
  });
  it('rejects key rollback and revoked grants', () => {
    const fixture = crisisPlanBackupFixture();
    expect(() =>
      validateCrisisPlanRestore({
        plans: [fixture.plan],
        shares: fixture.shares,
        priorKeyGenerations: { [fixture.plan.planId]: 2 },
      }),
    ).toThrow('rollback');
    expect(() =>
      validateCrisisPlanRestore({
        plans: [fixture.plan],
        shares: [{ ...fixture.shares[0], state: 'revoked' }],
      }),
    ).toThrow('cannot restore');
  });
});
