import { describe, expect, it } from 'vitest';
import { taskLockRequestSchema } from '@naaseh/contracts';
import { createTask, setTaskLocked } from '@naaseh/domain';
describe('task lock contract', () => {
  it('maps lock to private visibility with a new version', () => {
    const task = createTask({ label: 'Private' }, 'owner');
    const request = taskLockRequestSchema.parse({ locked: true });
    const locked = setTaskLocked(task, request.locked, 'owner');
    expect(locked).toMatchObject({ visibility: 'private', version: 2 });
    expect(setTaskLocked(locked, false, 'owner')).toMatchObject({
      visibility: 'public',
      version: 3,
    });
  });
  it('rejects unknown fields', () =>
    expect(() => taskLockRequestSchema.parse({ locked: true, ownerId: 'attacker' })).toThrow());
});
