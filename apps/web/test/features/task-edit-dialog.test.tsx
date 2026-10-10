import { createTask } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  fiveMinuteTimeOptions,
  splitTimeForDisplay,
  timeFromDisplay,
} from '../../src/features/tasks/due-value.js';
import { taskEditPatch } from '../../src/features/tasks/TaskEditDialog.js';

describe('task edit controls', () => {
  it('provides a dense five-minute time list', () => {
    expect(fiveMinuteTimeOptions()).toHaveLength(288);
    expect(fiveMinuteTimeOptions()).toContain('10:05');
  });

  it('converts stored times to and from an AM/PM display', () => {
    expect(splitTimeForDisplay('00:05')).toEqual({ hour: '12', minute: '05', meridiem: 'AM' });
    expect(splitTimeForDisplay('15:30')).toEqual({ hour: '3', minute: '30', meridiem: 'PM' });
    expect(timeFromDisplay('12', '00', 'PM')).toBe('12:00');
    expect(timeFromDisplay('12', '00', 'AM')).toBe('00:00');
    expect(timeFromDisplay('3', '30', 'PM')).toBe('15:30');
  });

  it('clears a date-only value when a time is added to an edited task', () => {
    const task = createTask(
      { label: 'Date-only task', dueKind: 'date', dueDate: '2026-10-13' },
      'owner',
    );

    expect(
      taskEditPatch(
        {
          label: task.label,
          urgency: task.urgency,
          dueKind: 'timed',
          dueAt: '2026-10-13T23:00:00.000Z',
        },
        task,
      ),
    ).toMatchObject({
      dueKind: 'timed',
      dueAt: '2026-10-13T23:00:00.000Z',
      dueDate: null,
    });
  });

  it('clears a timed value when an edited task becomes date-only', () => {
    const task = createTask(
      { label: 'Timed task', dueKind: 'timed', dueAt: '2026-10-13T23:00:00.000Z' },
      'owner',
    );

    expect(
      taskEditPatch(
        {
          label: task.label,
          urgency: task.urgency,
          dueKind: 'date',
          dueDate: '2026-10-13',
        },
        task,
      ),
    ).toMatchObject({
      dueKind: 'date',
      dueDate: '2026-10-13',
      dueAt: null,
    });
  });
});
