import { describe, expect, it } from 'vitest';
import { taskPatchSchema } from '@naaseh/contracts';
import { assertNoCycle } from '../../src/tasks/task-policy.js';

describe('atomic modern task edit contract', () => {
  it('accepts one patch containing due and structured memo fields', () => {
    expect(
      taskPatchSchema.safeParse({
        memo: 'One',
        memoDocument: {
          version: 1,
          blocks: [{ type: 'paragraph', runs: [{ text: 'One', marks: ['bold'] }] }],
        },
        dueKind: 'date',
        dueDate: '2026-08-15',
      }).success,
    ).toBe(true);
  });
  it('retains cycle rejection', () => {
    expect(() => assertNoCycle('a', 'a', new Map())).toThrow(/ancestor/);
  });
});
