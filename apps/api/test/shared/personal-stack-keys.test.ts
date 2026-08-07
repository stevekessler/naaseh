import { describe, expect, it } from 'vitest';
import { keys } from '../../src/shared/keys.js';

const overall = { userId: 'owner-a', scopeType: 'overall' as const };
const project = {
  userId: 'owner-a',
  scopeType: 'project' as const,
  scopeId: '01K00000000000000000000010',
};
const operationId = '01K00000000000000000000900';
const mutationId = '01K00000000000000000000901';

describe('owner-private personal stack keys', () => {
  it('isolates overall and Project metadata in distinct owner partitions', () => {
    expect(keys.personalStackMetadata(overall)).toEqual({
      PK: 'STACK#USER#owner-a#OVERALL',
      SK: 'META',
    });
    expect(keys.personalStackMetadata(project)).toEqual({
      PK: 'STACK#USER#owner-a#PROJECT#01K00000000000000000000010',
      SK: 'META',
    });
    expect(keys.personalStackMetadata({ ...overall, userId: 'owner-b' }).PK).not.toBe(
      keys.personalStackMetadata(overall).PK,
    );
  });

  it('orders canonical operations and chunks by fixed-width version and index', () => {
    expect(keys.personalStackOperation(overall, 12, operationId)).toEqual({
      PK: 'STACK#USER#owner-a#OVERALL',
      SK: `OP#000000000012#${operationId}`,
    });
    expect(keys.personalStackOperationChunk(overall, 12, operationId, 3)).toEqual({
      PK: 'STACK#USER#owner-a#OVERALL',
      SK: `OP#000000000012#${operationId}#CHUNK#000000000003`,
    });
    expect(
      keys
        .personalStackOperation(overall, 9, operationId)
        .SK.localeCompare(keys.personalStackOperation(overall, 10, operationId).SK),
    ).toBeLessThan(0);
  });

  it('keeps receipts user-wide while snapshots and private audit stay in their scope', () => {
    expect(keys.personalStackMutationReceipt('owner-a', mutationId)).toEqual({
      PK: 'USER#owner-a',
      SK: `MUTATION#${mutationId}`,
    });
    expect(keys.personalStackMutationReceipt('owner-b', mutationId).PK).not.toBe(
      keys.personalStackMutationReceipt('owner-a', mutationId).PK,
    );
    expect(keys.personalStackSnapshotChunk(project, 4, 2)).toEqual({
      PK: keys.personalStackMetadata(project).PK,
      SK: 'SNAPSHOT#000000000004#CHUNK#000000000002',
    });
    expect(keys.personalStackAudit(project, '2026-08-05T12:00:00.000Z', operationId)).toEqual({
      PK: keys.personalStackMetadata(project).PK,
      SK: `AUDIT#2026-08-05T12:00:00.000Z#${operationId}`,
    });
  });

  it('publishes stack changes only to the owning user feed', () => {
    expect(keys.personalStackOwnerFeedCounter('owner-a')).toEqual({
      PK: 'FEED#OWNER#owner-a',
      SK: 'COUNTER',
    });
    expect(keys.personalStackOwnerFeedEntry('owner-a', 7)).toEqual({
      PK: 'FEED#OWNER#owner-a',
      SK: 'CHANGE#00000000000000000007',
    });
    for (const key of [
      keys.personalStackOwnerFeedCounter('owner-a'),
      keys.personalStackOwnerFeedEntry('owner-a', 7),
    ]) {
      expect(key.PK).not.toContain('PUBLIC');
      expect(key.PK).not.toContain('GROUP#');
      expect(key.PK).not.toContain('ADMIN#');
    }
  });
});
