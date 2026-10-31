import { describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import { taskPatchSchema } from '@naaseh/contracts';
import { prepareTaskUpdate, sanitizeTaskPatch } from '../../src/tasks/task-service.js';
import { saveTaskMutation } from '../../src/tasks/task-repository.js';

describe('post-it color task mutation', () => {
  it('validates the fixed enum and supports explicitly clearing an override', () => {
    expect(taskPatchSchema.safeParse({ postItColor: 'purple' }).success).toBe(true);
    expect(taskPatchSchema.safeParse({ postItColor: null }).success).toBe(true);
    expect(taskPatchSchema.safeParse({ postItColor: '#123456' }).success).toBe(false);
    expect(sanitizeTaskPatch({ postItColor: null })).toEqual({ postItColor: undefined });
    expect(taskPatchSchema.safeParse({ memoDocument: null }).success).toBe(true);
    expect(sanitizeTaskPatch({ memoDocument: null })).toEqual({ memoDocument: undefined });
    expect(taskPatchSchema.safeParse({ categoryId: null }).success).toBe(true);
    const before = createTask(
      {
        label: 'Note',
        memo: 'Formatted',
        memoDocument: {
          version: 1,
          blocks: [{ type: 'paragraph', runs: [{ text: 'Formatted', marks: ['bold'] }] }],
        },
        categoryId: '01J00000000000000000000001',
      },
      'owner',
    );
    const prepared = prepareTaskUpdate(
      before,
      sanitizeTaskPatch({ memoDocument: null, categoryId: null }),
      'owner',
      new Map([[before.id, before]]),
    );
    expect(prepared.task.memoDocument).toBeUndefined();
    expect(prepared.task.categoryId).toBeUndefined();
    expect(prepared.task.memo).toBe('Formatted');
    expect(prepared.changedFields).toEqual(['memoDocument', 'categoryId']);
  });

  it('records the color in the same task revision transaction', async () => {
    const before = createTask({ label: 'Note', postItColor: 'yellow' }, 'owner');
    const prepared = prepareTaskUpdate(
      before,
      { postItColor: 'blue' },
      'owner',
      new Map([[before.id, before]]),
    );
    const commit = vi.fn(async () => undefined);
    const saved = await saveTaskMutation(
      prepared.task,
      'owner',
      '01J00000000000000000000009',
      'update',
      prepared.changedFields,
      before,
      {
        prepareChange: vi.fn(async (value) => value as never),
        commit,
        findResult: vi.fn(async () => undefined),
      },
    );
    expect(saved.revision.before).toMatchObject({ postItColor: 'yellow' });
    expect(saved.revision.after).toMatchObject({ postItColor: 'blue' });
    expect(commit).toHaveBeenCalledOnce();
  });
});
