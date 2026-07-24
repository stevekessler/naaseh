import { describe, expect, it } from 'vitest';
import { canReadTaskAs, taskLockState } from '../src/task.js';
const task = {
  ownerId: 'owner',
  visibility: 'private',
  memoHidden: true,
  encryptedMemo: 'cipher',
} as any;
describe('task lock mapping', () => {
  it('maps privacy and allows audited administrator reads', () => {
    expect(taskLockState(task)).toBe('locked');
    expect(canReadTaskAs(task, { id: 'admin', role: 'admin', active: true })).toEqual({
      allowed: true,
      privileged: true,
    });
    expect(canReadTaskAs(task, { id: 'other', role: 'user', active: true }).allowed).toBe(false);
  });
});
