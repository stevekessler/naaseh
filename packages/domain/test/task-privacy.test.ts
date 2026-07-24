import { describe, expect, it } from 'vitest';
import { canReadTask, createTask } from '../src/task.js';
import { privacyFeedChanges } from '../../../apps/api/src/tasks/privacy-transition.js';

describe('task privacy transitions', () => {
  it('keeps public tasks visible independently of group membership', () => {
    const task = createTask({ label: 'Shared', groupId: 'family' }, 'steve');
    expect(canReadTask(task, 'non-member')).toBe(true);
  });

  it('restricts private tasks and emits the old-audience tombstone before the owner upsert', () => {
    const before = createTask({ label: 'Private later' }, 'steve');
    const after = {
      ...before,
      visibility: 'private' as const,
      version: 2,
      updatedAt: new Date().toISOString(),
    };
    expect(canReadTask(after, 'other-user')).toBe(false);
    const changes = privacyFeedChanges(before, after);
    expect(changes).toMatchObject([
      { audience: 'PUBLIC', operation: 'tombstone' },
      { audience: 'OWNER#steve', operation: 'upsert' },
    ]);
    expect(changes[0]).not.toHaveProperty('payload');
  });
});
