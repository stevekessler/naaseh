import { describe, expect, it } from 'vitest';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { createTask, type TaskRevision } from '@naaseh/domain';
import { buildTaskTransaction } from '../../apps/api/src/shared/store.js';

type Item = Record<string, unknown> & { PK: string; SK: string };

function itemKey(item: { PK?: unknown; SK?: unknown }) {
  return `${String(item.PK)}|${String(item.SK)}`;
}

/** Minimal DynamoDB transaction model used to verify all-or-nothing invariants. */
function transact(table: Map<string, Item>, input: TransactWriteCommandInput) {
  const staged = new Map(table);
  for (const operation of input.TransactItems ?? []) {
    if (operation.Put?.Item) {
      const item = operation.Put.Item as Item;
      const current = staged.get(itemKey(item));
      const expected = operation.Put.ExpressionAttributeValues?.[':base'];
      const condition = operation.Put.ConditionExpression ?? '';
      const allowed = condition.includes(' OR ')
        ? !current || (current.data as { version?: number } | undefined)?.version === expected
        : !condition.includes('attribute_not_exists') || !current;
      if (!allowed) throw new Error('TransactionCanceledException');
      staged.set(itemKey(item), structuredClone(item));
      continue;
    }
    if (operation.Update?.Key) {
      const key = operation.Update.Key as { PK: string; SK: string };
      const current = staged.get(itemKey(key));
      const expected = operation.Update.ExpressionAttributeValues?.[':expected'];
      const actual = current?.value;
      if (actual !== undefined ? actual !== expected : expected !== 0)
        throw new Error('TransactionCanceledException');
      staged.set(itemKey(key), {
        ...key,
        value: operation.Update.ExpressionAttributeValues?.[':next'],
      });
    }
  }
  table.clear();
  for (const [key, value] of staged) table.set(key, value);
}

function revision(task: ReturnType<typeof createTask>, mutationId: string): TaskRevision {
  return {
    id: `revision-${mutationId}`,
    taskId: task.id,
    mutationId,
    actorId: task.ownerId,
    version: task.version,
    changedAt: task.updatedAt,
    operation: 'create',
    changedFields: ['label'],
  };
}

function publicChange(task: ReturnType<typeof createTask>, expectedSequence: number) {
  return {
    expectedSequence,
    change: {
      audience: 'PUBLIC',
      sequence: expectedSequence + 1,
      entityId: task.id,
      operation: 'upsert' as const,
      payload: task,
      changedAt: task.updatedAt,
    },
  };
}

describe('DynamoDB task transaction contention and replay', () => {
  it('rolls back every task artifact when a feed counter loses contention', () => {
    const table = new Map<string, Item>();
    const first = createTask({ label: 'First' }, 'steve');
    const contender = createTask({ label: 'Contender' }, 'steve');
    transact(
      table,
      buildTaskTransaction(first, revision(first, 'first'), 'first', [publicChange(first, 0)]),
    );
    const committedSnapshot = structuredClone([...table.entries()]);

    expect(() =>
      transact(
        table,
        buildTaskTransaction(contender, revision(contender, 'contender'), 'contender', [
          publicChange(contender, 0),
        ]),
      ),
    ).toThrow('TransactionCanceledException');
    expect([...table.entries()]).toEqual(committedSnapshot);
    expect(table.has(`TASK#${contender.id}|CURRENT`)).toBe(false);
    expect(table.has('USER#steve|MUTATION#contender')).toBe(false);

    transact(
      table,
      buildTaskTransaction(contender, revision(contender, 'contender'), 'contender', [
        publicChange(contender, 1),
      ]),
    );
    expect(table.get('FEED#PUBLIC|COUNTER')?.value).toBe(2);
    expect(table.has(`TASK#${contender.id}|CURRENT`)).toBe(true);
  });

  it('keeps the original stable result and creates no duplicate revision on replay', () => {
    const table = new Map<string, Item>();
    const task = createTask({ label: 'Replay once' }, 'steve');
    const input = buildTaskTransaction(task, revision(task, 'same'), 'same', [
      publicChange(task, 0),
    ]);
    transact(table, input);
    const committedSnapshot = structuredClone([...table.entries()]);

    expect(() => transact(table, input)).toThrow('TransactionCanceledException');
    expect([...table.entries()]).toEqual(committedSnapshot);
    expect(table.get('USER#steve|MUTATION#same')?.data).toMatchObject({
      mutationId: 'same',
      status: 'applied',
      entityVersion: 1,
      entity: task,
    });
    expect([...table.keys()].filter((key) => key.startsWith(`TASK#${task.id}|REV#`))).toHaveLength(
      1,
    );
  });

  it('rolls back both sides of a privacy transition when either audience counter conflicts', () => {
    const table = new Map<string, Item>();
    const before = createTask({ label: 'Private transition' }, 'steve');
    const after = {
      ...before,
      visibility: 'private' as const,
      version: 2,
      updatedAt: '2026-07-22T13:00:00.000Z',
    };
    table.set(`TASK#${before.id}|CURRENT`, {
      PK: `TASK#${before.id}`,
      SK: 'CURRENT',
      data: before,
    });
    table.set('FEED#OWNER#steve|COUNTER', {
      PK: 'FEED#OWNER#steve',
      SK: 'COUNTER',
      value: 1,
    });
    const privacyRevision: TaskRevision = {
      ...revision(after, 'privacy'),
      operation: 'privacy',
      changedFields: ['visibility'],
    };
    const changes = [
      {
        expectedSequence: 0,
        change: {
          audience: 'PUBLIC',
          sequence: 1,
          entityId: after.id,
          operation: 'tombstone' as const,
          changedAt: after.updatedAt,
        },
      },
      {
        expectedSequence: 0,
        change: {
          audience: 'OWNER#steve',
          sequence: 1,
          entityId: after.id,
          operation: 'upsert' as const,
          payload: after,
          changedAt: after.updatedAt,
        },
      },
    ];
    const snapshot = structuredClone([...table.entries()]);
    expect(() =>
      transact(table, buildTaskTransaction(after, privacyRevision, 'privacy', changes)),
    ).toThrow('TransactionCanceledException');
    expect([...table.entries()]).toEqual(snapshot);
    expect(table.has('FEED#PUBLIC|CHANGE#00000000000000000001')).toBe(false);
    expect(table.has('USER#steve|MUTATION#privacy')).toBe(false);

    transact(
      table,
      buildTaskTransaction(after, privacyRevision, 'privacy', [
        changes[0]!,
        {
          ...changes[1]!,
          expectedSequence: 1,
          change: { ...changes[1]!.change, sequence: 2 },
        },
      ]),
    );
    expect(table.has('FEED#PUBLIC|CHANGE#00000000000000000001')).toBe(true);
    expect(table.has('FEED#OWNER#steve|CHANGE#00000000000000000002')).toBe(true);
    expect((table.get(`TASK#${after.id}|CURRENT`)?.data as { visibility: string }).visibility).toBe(
      'private',
    );
  });
});
