import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import { redact } from '@naaseh/observability';
import { authorizedTask } from '../../apps/api/src/tasks/task-authorization.js';
import { sanitizeTaskPatch } from '../../apps/api/src/tasks/task-service.js';
import { filterTasks } from '../../apps/web/src/search/task-search.js';

describe('private-task non-disclosure', () => {
  const privateTask = createTask(
    { label: 'Confidential label', memo: 'Confidential memo', visibility: 'private' },
    'owner',
  );

  it('conceals cross-user direct access and prevents ownership reassignment', () => {
    expect(authorizedTask(privateTask, 'attacker')).toBeUndefined();
    expect(() => sanitizeTaskPatch({ ownerId: 'attacker' })).toThrow('protected field');
    expect(() => sanitizeTaskPatch({ version: 999 })).toThrow('protected field');
  });

  it('does not disclose an unauthorized task through search results or counts', () => {
    const authorized = [privateTask].filter((task) => authorizedTask(task, 'attacker'));
    const results = filterTasks(authorized, {
      query: 'Confidential',
      from: '',
      to: '',
      assigneeId: '',
      categoryId: '',
    });
    expect(results).toHaveLength(0);
    expect(authorized).toHaveLength(0);
  });

  it('redacts labels, memos, and cache payloads when explicitly classified', () => {
    expect(
      redact({ taskLabel: privateTask.label, memo: privateTask.memo, cachePayload: privateTask }),
    ).toEqual({ taskLabel: '[REDACTED]', memo: '[REDACTED]', cachePayload: '[REDACTED]' });
  });
});
