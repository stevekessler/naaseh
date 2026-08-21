import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { completeAndArchiveTask, createList, createTask } from '@naaseh/domain';
import { validatePersonalStackRestore } from '../../apps/api/src/crypto-recovery/personal-stack-restore-validator.js';
import { validateUrgencyRestore } from '../../apps/api/src/crypto-recovery/restore-testing-validator.js';

type RestoredRow = { PK: string; SK: string; data: Record<string, unknown> };

const ownerId = 'owner';
const scopePk = `STACK#USER#${ownerId}#OVERALL`;
const acceptedAt = '2026-08-05T12:00:00.000Z';
const taskA = {
  workType: 'task' as const,
  workId: '01J00000000000000000000001',
  membershipEpoch: 'epoch-a',
};
const taskB = {
  workType: 'task' as const,
  workId: '01J00000000000000000000002',
  membershipEpoch: 'epoch-b',
};
const listC = {
  workType: 'list' as const,
  workId: '01J00000000000000000000003',
  membershipEpoch: 'epoch-c',
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const versionKey = (version: number) => String(version).padStart(12, '0');

function operation(version: number, id: string, data: Record<string, unknown>): RestoredRow {
  return {
    PK: scopePk,
    SK: `OP#${versionKey(version)}#${id}`,
    data: {
      id,
      mutationId: id.replace(/.$/u, '9'),
      userId: ownerId,
      scopeType: 'overall',
      baseVersion: version - 1,
      version,
      sourceClientId: 'restore-fixture',
      acceptedAt,
      outcome: 'applied',
      ...data,
    },
  };
}

function validRows(): RestoredRow[] {
  const filteredWork = [listC, taskA, taskB];
  const snapshotWork = [listC, taskA, taskB];
  const firstId = '01J00000000000000000000011';
  const secondId = '01J00000000000000000000012';
  const thirdId = '01J00000000000000000000013';
  return [
    {
      PK: scopePk,
      SK: 'META',
      data: {
        userId: ownerId,
        scopeType: 'overall',
        version: 3,
        currentSnapshotGeneration: 1,
        snapshotThroughVersion: 1,
        operationDepth: 2,
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      },
    },
    ...[taskA, taskB, listC].map(
      (work, index): RestoredRow => ({
        PK: scopePk,
        SK: `MEMBERSHIP#${work.workType}#${work.workId}`,
        data: {
          userId: ownerId,
          scopeType: 'overall',
          ...work,
          admittedSequence: index + 1,
          active: true,
        },
      }),
    ),
    operation(1, firstId, {
      kind: 'simple_move',
      movedWork: listC,
      beforeWork: taskA,
      affectedCount: 1,
      affectedHash: digest([listC]),
      chunkCount: 0,
    }),
    operation(2, secondId, {
      kind: 'filtered_permutation',
      movedWork: taskB,
      destinationIndex: 0,
      filterBasis: { lifecycle: 'active', contentType: 'all' },
      affectedCount: filteredWork.length,
      affectedHash: digest(filteredWork),
      chunkCount: 1,
    }),
    {
      PK: scopePk,
      SK: `OP#${versionKey(2)}#${secondId}#CHUNK#000000000000`,
      data: {
        operationId: secondId,
        index: 0,
        count: filteredWork.length,
        workRefs: filteredWork,
        checksum: digest(filteredWork),
      },
    },
    operation(3, thirdId, {
      kind: 'simple_move',
      movedWork: taskA,
      beforeWork: taskB,
      affectedCount: 1,
      affectedHash: digest([taskA]),
      chunkCount: 0,
    }),
    {
      PK: scopePk,
      SK: 'SNAPSHOT#000000000001#CHUNK#000000000000',
      data: {
        userId: ownerId,
        scopeType: 'overall',
        generation: 1,
        throughVersion: 1,
        index: 0,
        workRefs: snapshotWork,
        membershipEpochs: snapshotWork.map((work) => work.membershipEpoch),
        checksum: digest(snapshotWork),
      },
    },
  ];
}

describe('personal-stack restore validation', () => {
  it('validates canonical continuity and deterministically reconstructs final order', () => {
    const restored = validatePersonalStackRestore(validRows());

    expect(restored.scopes).toEqual([
      expect.objectContaining({
        userId: ownerId,
        scopeType: 'overall',
        version: 3,
        snapshotStatus: 'verified',
        order: [taskA, taskB, listC],
      }),
    ]);
    expect(validatePersonalStackRestore(validRows())).toEqual(restored);
  });

  it('rebuilds a missing or corrupt derived snapshot from canonical operations', () => {
    const withoutSnapshot = validRows().filter((row) => !row.SK.startsWith('SNAPSHOT#'));
    const corruptSnapshot = validRows().map((row) =>
      row.SK.startsWith('SNAPSHOT#')
        ? { ...row, data: { ...row.data, checksum: '0'.repeat(64) } }
        : row,
    );

    for (const rows of [withoutSnapshot, corruptSnapshot]) {
      const [scope] = validatePersonalStackRestore(rows).scopes;
      expect(scope).toMatchObject({
        snapshotStatus: 'rebuilt',
        order: [taskA, taskB, listC],
      });
    }
  });

  it('fails closed for a canonical operation version gap', () => {
    const rows = validRows().filter((row) => !row.SK.startsWith(`OP#${versionKey(2)}#`));
    expect(() => validatePersonalStackRestore(rows)).toThrow(/version gap|continuity/iu);
  });

  it('fails closed for missing, reordered, or corrupt canonical operation chunks', () => {
    const chunkKey = `OP#${versionKey(2)}#01J00000000000000000000012#CHUNK#`;
    const missing = validRows().filter((row) => !row.SK.startsWith(chunkKey));
    const corrupt = validRows().map((row) =>
      row.SK.startsWith(chunkKey)
        ? { ...row, data: { ...row.data, checksum: 'f'.repeat(64) } }
        : row,
    );
    const reordered = validRows().map((row) =>
      row.SK.startsWith(chunkKey)
        ? {
            ...row,
            data: {
              ...row.data,
              workRefs: [taskB, taskA, listC],
            },
          }
        : row,
    );

    for (const rows of [missing, corrupt, reordered])
      expect(() => validatePersonalStackRestore(rows)).toThrow(/chunk|checksum|hash/iu);
  });

  it('rejects snapshot pointers beyond canonical continuity', () => {
    const rows = validRows().map((row) =>
      row.SK === 'META'
        ? {
            ...row,
            data: {
              ...row.data,
              currentSnapshotGeneration: 4,
              snapshotThroughVersion: 4,
            },
          }
        : row,
    );
    expect(() => validatePersonalStackRestore(rows)).toThrow(/snapshot|pointer|version/iu);
  });

  it('rejects chunks, membership, or operations crossing user and Project scope boundaries', () => {
    const crossUser = validRows().map((row) =>
      row.SK.includes('#CHUNK#') && row.SK.startsWith('OP#')
        ? { ...row, PK: 'STACK#USER#other-user#OVERALL' }
        : row,
    );
    const crossProject = validRows().map((row) =>
      row.SK.startsWith('MEMBERSHIP#') && row.data.workId === taskA.workId
        ? { ...row, data: { ...row.data, scopeType: 'project', scopeId: taskA.workId } }
        : row,
    );
    const forgedOwner = validRows().map((row) =>
      row.SK.startsWith(`OP#${versionKey(1)}#`)
        ? { ...row, data: { ...row.data, userId: 'other-user' } }
        : row,
    );

    for (const rows of [crossUser, crossProject, forgedOwner])
      expect(() => validatePersonalStackRestore(rows)).toThrow(/owner|user|scope|project/iu);
  });

  it('restores current urgency and immutable completion urgency, then reconciles urgency totals', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    const task = createTask({ label: 'Current low', urgency: 'critical' }, ownerId, now);
    const completed = completeAndArchiveTask(task, ownerId, {}, now);
    const editedAfterCompletion = { ...completed.task, urgency: 'low' as const };
    const list = createList({ name: 'Current high', urgency: 'high' }, ownerId, now);
    const rows = [
      { PK: `TASK#${task.id}`, SK: 'CURRENT', data: editedAfterCompletion },
      { PK: `LIST#${list.id}`, SK: 'CURRENT', data: list },
      {
        PK: `COMPLETION#${completed.completionEvent.id}`,
        SK: 'EVENT',
        data: completed.completionEvent,
      },
      { PK: 'WORKLOAD#OWNER#owner', SK: 'COUNT#overall#overall#task', count: 1 },
      {
        PK: 'WORKLOAD#OWNER#owner',
        SK: 'COUNT#overall#overall#task#URGENCY#low',
        count: 1,
      },
      {
        PK: 'WORKLOAD#OWNER#owner',
        SK: 'COUNT#overall#overall#list',
        count: 1,
      },
      {
        PK: 'WORKLOAD#OWNER#owner',
        SK: 'COUNT#overall#overall#list#URGENCY#high',
        count: 1,
      },
    ];

    expect(validateUrgencyRestore(rows)).toEqual({
      currentWork: 2,
      completionSnapshots: 1,
      urgencyCounterGroups: 2,
      urgencyTotalsReconciled: true,
    });
    expect(completed.completionEvent.urgencyAtCompletion).toBe('critical');
    expect(editedAfterCompletion.urgency).toBe('low');

    const missingUrgency = rows.map((row) =>
      row.SK === 'CURRENT' && row.PK.startsWith('TASK#')
        ? { ...row, data: { ...(row.data as Record<string, unknown>), urgency: undefined } }
        : row,
    );
    expect(() => validateUrgencyRestore(missingUrgency)).toThrow(/urgency/iu);

    const missingSnapshot = rows.map((row) =>
      row.SK === 'EVENT'
        ? {
            ...row,
            data: {
              ...(row.data as Record<string, unknown>),
              urgencyAtCompletion: undefined,
            },
          }
        : row,
    );
    expect(() => validateUrgencyRestore(missingSnapshot)).toThrow(/completion|urgency/iu);

    const removedCurrentValue = rows.map((row) =>
      row.SK === 'CURRENT' && row.PK.startsWith('TASK#')
        ? { ...row, data: { ...(row.data as Record<string, unknown>), urgency: 'extra_low' } }
        : row,
    );
    expect(() => validateUrgencyRestore(removedCurrentValue)).toThrow(/urgency/iu);

    const removedImmutableValue = rows.map((row) =>
      row.SK === 'EVENT'
        ? {
            ...row,
            data: {
              ...(row.data as Record<string, unknown>),
              urgencyAtCompletion: 'extra_low',
            },
          }
        : row,
    );
    expect(() => validateUrgencyRestore(removedImmutableValue)).toThrow(/completion|urgency/iu);

    const removedCounter = rows.map((row) =>
      row.SK === 'COUNT#overall#overall#task#URGENCY#low'
        ? { ...row, SK: 'COUNT#overall#overall#task#URGENCY#extra_low' }
        : row,
    );
    expect(() => validateUrgencyRestore(removedCounter)).toThrow(/counter/iu);

    const inconsistentTotals = rows.map((row) =>
      row.SK === 'COUNT#overall#overall#task' ? { ...row, count: 2 } : row,
    );
    expect(() => validateUrgencyRestore(inconsistentTotals)).toThrow(/reconciliation/iu);
  });
});
