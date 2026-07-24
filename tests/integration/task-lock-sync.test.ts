import { describe, expect, it } from 'vitest';
import { createTask, setTaskLocked } from '@naaseh/domain';
import {
  administratorTaskFeedChange,
  privacyFeedChanges,
} from '../../apps/api/src/tasks/privacy-transition.js';
describe('task lock feeds', () => {
  it('tombstones public, upserts owner, and retains the admin feed', () => {
    const task = createTask({ label: 'Lock' }, 'owner');
    const locked = setTaskLocked(task, true, 'owner');
    const changes = privacyFeedChanges(task, locked);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ audience: 'PUBLIC', operation: 'tombstone' }),
        expect.objectContaining({ audience: 'OWNER#owner', operation: 'upsert' }),
      ]),
    );
    expect(administratorTaskFeedChange(locked)).toMatchObject({
      operation: 'upsert',
      entityType: 'task',
    });
  });
});
