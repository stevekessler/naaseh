import { describe, expect, it } from 'vitest';
import { googleRestoreSafetyPlan } from '../../apps/api/src/crypto-recovery/restore-testing-validator.js';

describe('Google synchronization restore controls', () => {
  it('requires restored credentials to be invalidated and queued effects to be cancelled', () => {
    expect(
      googleRestoreSafetyPlan([
        {
          PK: 'USER#owner',
          SK: 'GOOGLE#CONNECTION',
          data: { state: 'active', encryptedRefreshToken: 'ciphertext' },
        },
        {
          PK: 'GOOGLECONN#connection',
          SK: 'OP#pending#2026-07-25T00:00:00.000Z#operation',
          data: { state: 'pending' },
        },
      ]),
    ).toEqual({
      connectionsRequiringReauthorization: 1,
      operationsToCancel: 1,
      safeToExpose: false,
    });
  });

  it('does not classify completed provider effects as replayable work', () => {
    expect(
      googleRestoreSafetyPlan([
        {
          PK: 'GOOGLECONN#connection',
          SK: 'OP#succeeded#time#operation',
          data: { state: 'succeeded' },
        },
      ]).safeToExpose,
    ).toBe(true);
  });
});
