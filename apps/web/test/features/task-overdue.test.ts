import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import { overdue } from '../../src/notifications/local-reminders.js';

describe('task overdue state', () => {
  const now = new Date(2026, 9, 6, 12).getTime();

  it('marks a date-only task overdue after its calendar day ends', () => {
    const yesterday = createTask(
      { label: 'Yesterday', dueKind: 'date', dueDate: '2026-10-05' },
      'owner',
    );
    const today = createTask({ label: 'Today', dueKind: 'date', dueDate: '2026-10-06' }, 'owner');
    expect(overdue(yesterday, now)).toBe(true);
    expect(overdue(today, now)).toBe(false);
  });
});
