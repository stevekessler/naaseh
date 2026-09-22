import { describe, expect, it } from 'vitest';
import { createTask, taskSchema, transitionTask } from '../src/task.js';
import { reminderSchema, updateReminderStatus } from '../src/reminder.js';
import { taskRevisionSchema } from '../src/revision.js';

describe('task domain lifecycle', () => {
  it('validates the complete task surface and HTTP or HTTPS links', () => {
    const task = createTask(
      {
        label: ' Do ',
        link: 'https://example.com',
        dueAt: '2026-08-01T16:00:00.000Z',
        dueTimeZone: 'America/Denver',
        groupId: 'g',
      },
      'owner',
    );
    expect(task.label).toBe('Do');
    expect(task.percentComplete).toBe(0);
    expect(createTask({ label: 'Halfway', percentComplete: 50 }, 'owner').percentComplete).toBe(50);
    expect(() => createTask({ label: 'Too far', percentComplete: 101 }, 'owner')).toThrow();
    expect(createTask({ label: 'HTTP link', link: 'http://example.com' }, 'owner').link).toBe(
      'http://example.com',
    );
    expect(() => createTask({ label: 'bad', link: 'javascript:alert(1)' }, 'owner')).toThrow();
    expect(taskSchema.safeParse({ ...task, dueTimeZone: undefined }).success).toBe(false);
  });
  it('requires mutually exclusive hidden memo representations', () => {
    expect(() =>
      createTask(
        { label: 'hidden', memo: 'plaintext', memoHidden: true, encryptedMemo: 'ciphertext' },
        'owner',
      ),
    ).toThrow();
    expect(
      createTask({ label: 'hidden', memoHidden: true, encryptedMemo: 'ciphertext' }, 'owner').memo,
    ).toBe('');
  });
  it('records semantic completion and clears metadata when reopened', () => {
    const open = createTask({ label: 'Do' }, 'owner', new Date('2026-01-01T00:00:00Z'));
    const completed = transitionTask(open, 'completed', 'owner', new Date('2026-01-02T00:00:00Z'));
    expect(completed).toMatchObject({
      status: 'completed',
      completedBy: 'owner',
      percentComplete: 100,
      version: 2,
    });
    expect(transitionTask(completed, 'open', 'owner')).toMatchObject({
      percentComplete: 0,
      completedAt: undefined,
    });
  });
  it('validates immutable revision metadata and reminder transitions', () => {
    expect(
      taskRevisionSchema.safeParse({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        taskId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
        mutationId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
        sourceClientId: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
        actorId: 'u',
        version: 1,
        changedAt: '2026-01-01T00:00:00.000Z',
        operation: 'create',
        changedFields: ['label'],
      }).success,
    ).toBe(true);
    const reminder = reminderSchema.parse({
      id: 'r',
      taskId: 't',
      dueAt: '2026-01-01T00:00:00.000Z',
      status: 'scheduled',
    });
    expect(updateReminderStatus(reminder, 'shown', new Date('2026-01-01T00:00:00Z'))).toMatchObject(
      { status: 'shown', version: 2 },
    );
  });
});
