import { describe, expect, it } from 'vitest';
import {
  advanceDeletionExecution,
  createDeletionPreview,
  type DeletionPreview,
} from '../../apps/api/src/finance/deletion-service.js';

const now = new Date('2026-10-28T12:00:00.000Z');
const secret = 'finance-deletion-secret';
const recordTypes: DeletionPreview['recordType'][] = [
  'account',
  'transaction',
  'budget',
  'reusable-item',
  'match',
  'task-link',
  'merchant',
  'category',
];

describe('Finance destructive execution', () => {
  it.each(recordTypes)(
    'creates a current impact preview and durable audit tombstone for %s',
    (recordType) => {
      const preview = createDeletionPreview({
        recordType,
        recordId: `${recordType}-1`,
        expectedVersion: 3,
        visibleDependentCounts: { visible: 1 },
        hasReferences: true,
        isMistake: false,
        now,
        signingSecret: secret,
      });
      const result = advanceDeletionExecution({
        preview,
        confirmation: { expectedVersion: 3, confirmationToken: preview.confirmationToken },
        actualDependentCount: 1,
        now: new Date(now.getTime() + 1_000),
        signingSecret: secret,
      });
      expect(result).toMatchObject({
        completed: true,
        nextDependent: 1,
        auditTombstone: { recordType, recordId: `${recordType}-1`, outcome: preview.outcome },
      });
      expect(result.auditTombstone).not.toHaveProperty('dependentIds');
    },
  );

  it('checkpoints bounded cascades and makes completed retries idempotent', () => {
    const preview = createDeletionPreview({
      recordType: 'account',
      recordId: 'account-1',
      expectedVersion: 2,
      visibleDependentCounts: { transactions: 2 },
      hasReferences: true,
      isMistake: false,
      now,
      signingSecret: secret,
    });
    const confirmation = { expectedVersion: 2, confirmationToken: preview.confirmationToken };
    const first = advanceDeletionExecution({
      preview,
      confirmation,
      actualDependentCount: 225,
      maxPerBatch: 100,
      now: new Date(now.getTime() + 1_000),
      signingSecret: secret,
    });
    const second = advanceDeletionExecution({
      preview,
      confirmation,
      actualDependentCount: 225,
      checkpoint: first,
      maxPerBatch: 100,
      now: new Date(now.getTime() + 2_000),
      signingSecret: secret,
    });
    const complete = advanceDeletionExecution({
      preview,
      confirmation,
      actualDependentCount: 225,
      checkpoint: second,
      maxPerBatch: 100,
      now: new Date(now.getTime() + 3_000),
      signingSecret: secret,
    });
    const retry = advanceDeletionExecution({
      preview,
      confirmation,
      actualDependentCount: 225,
      checkpoint: complete,
      maxPerBatch: 100,
      now: new Date(now.getTime() + 4_000),
      signingSecret: secret,
    });
    expect([first.nextDependent, second.nextDependent, complete.nextDependent]).toEqual([
      100, 200, 225,
    ]);
    expect(retry).toEqual(complete);
  });
});
