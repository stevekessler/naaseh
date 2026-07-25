import { describe, expect, it } from 'vitest';
import {
  canonicalProjectName,
  completeAndArchiveTask,
  completionEventSchema,
  createTask,
  projectNameReservation,
  projectSchema,
  restoreArchivedTask,
  reverseCompletionEvent,
} from '../src/index.js';

const categoryId = '01J00000000000000000000010';
const projectId = '01J00000000000000000000020';

describe('archive/project foundational domain', () => {
  it('models completion independently from archived lifecycle', () => {
    const open = createTask(
      { label: 'Ship', projectId },
      'owner',
      new Date('2026-07-24T10:00:00Z'),
    );
    const { task, completionEvent } = completeAndArchiveTask(
      open,
      'owner',
      { categoryId, categoryName: 'PAAO', projectId, projectName: 'API' },
      new Date('2026-07-24T11:00:00Z'),
    );
    expect(task).toMatchObject({
      lifecycle: 'archived',
      completionState: 'completed',
      archiveReason: 'completed',
      completedBy: 'owner',
      currentCompletionEventId: completionEvent.id,
    });
    expect(restoreArchivedTask(task, completionEvent, 'owner').task).toMatchObject({
      lifecycle: 'active',
      completionState: 'open',
    });
  });

  it('validates Project parent, date-only end date, and parent-scoped name reservations', () => {
    expect(
      projectSchema.parse({
        id: projectId,
        categoryId,
        name: ' API ',
        endDate: '2026-12-31',
        lifecycle: 'active',
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
        version: 1,
      }).name,
    ).toBe('API');
    expect(
      projectSchema.safeParse({ id: projectId, name: 'API', endDate: '12/31/2026' }).success,
    ).toBe(false);
    expect(canonicalProjectName('ＡＰＩ')).toBe('api');
    expect(projectNameReservation(categoryId, 'API')).not.toBe(
      projectNameReservation('01J00000000000000000000011', 'API'),
    );
  });

  it('reverses a completion event once without deleting its historical attribution', () => {
    const event = completionEventSchema.parse({
      id: '01J00000000000000000000050',
      taskId: '01J00000000000000000000030',
      completedBy: 'owner',
      occurredAt: '2026-07-24T11:00:00.000Z',
      categoryIdAtCompletion: categoryId,
      categoryNameAtCompletion: 'PAAO',
      projectIdAtCompletion: projectId,
      projectNameAtCompletion: 'API',
      counted: true,
      createdAt: '2026-07-24T11:00:00.000Z',
    });
    const reversed = reverseCompletionEvent(
      event,
      'owner',
      'mutation-a',
      new Date('2026-07-25T00:00:00Z'),
    );
    expect(reversed).toMatchObject({ counted: false, categoryNameAtCompletion: 'PAAO' });
    expect(() => reverseCompletionEvent(reversed, 'owner', 'mutation-b')).toThrow();
  });
});
