import { describe, expect, it } from 'vitest';
import { taskSchema } from '@naaseh/domain';
import { validatePersonalStackRestore } from '../../apps/api/src/crypto-recovery/personal-stack-restore-validator.js';

const now = '2026-08-14T12:00:00.000Z';

describe('Extra Low restore rejection', () => {
  it('rejects the removed value in current and immutable task records', () => {
    const base = {
      id: '01J00000000000000000000001',
      ownerId: 'owner',
      label: 'Restored task',
      memo: '',
      memoHidden: false,
      createdAt: now,
      updatedAt: now,
      visibility: 'private',
      status: 'open',
      lifecycle: 'active',
      completionState: 'open',
      version: 1,
    };
    expect(taskSchema.safeParse({ ...base, urgency: 'extra_low' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, urgency: 'low' }).success).toBe(true);
  });

  it('rejects removed priority values anywhere in restored personal-stack state', () => {
    expect(() =>
      validatePersonalStackRestore([
        {
          PK: 'STACK#USER#owner#OVERALL',
          SK: 'META',
          data: { userId: 'owner', scopeType: 'overall', version: 0, filterBasis: ['extra_low'] },
        },
      ]),
    ).toThrow(/Extra Low/iu);
  });
});
