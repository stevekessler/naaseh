import { describe, expect, it } from 'vitest';
import { createTaskTimer } from '@naaseh/domain';
import { validateTaskTimerRestore } from '../../apps/api/src/crypto-recovery/task-timer-restore-validator.js';

const ownerId = 'owner';
const timer = createTaskTimer(
  ownerId,
  '01J00000000000000000000001',
  '2026-08-14T12:00:00.000Z',
  '01J00000000000000000000002',
);
const current = { PK: `USER#${ownerId}`, SK: 'TIMER#CURRENT', data: timer };

describe('task timer restore validation', () => {
  it('validates one current record, monotonic revisions, receipts, and owner feed identity', () => {
    expect(
      validateTaskTimerRestore([
        current,
        {
          PK: `USER#${ownerId}`,
          SK: `TIMER#REV#000000000001#${timer.runId}`,
          data: timer,
        },
        {
          PK: `USER#${ownerId}`,
          SK: 'TIMER#RECEIPT#mutation-1',
          data: { mutationId: 'mutation-1', status: 'applied', version: 1 },
        },
      ]),
    ).toEqual({ owners: 1, currents: 1, revisions: 1, receipts: 1 });
  });

  it('fails closed for invalid field combinations and duplicate current rows', () => {
    expect(() =>
      validateTaskTimerRestore([current, { ...current, data: { ...timer, anchorAt: null } }]),
    ).toThrow();
  });
});
