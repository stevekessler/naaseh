import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JournalTaskReflection } from '../../src/features/journal/JournalTaskReflection.js';
import {
  eligibleJournalTasks,
  resolveJournalTaskLabel,
} from '../../src/features/journal/journal-task-options.js';

describe('journal task reflection eligibility', () => {
  it('uses a searchable long-list combobox for related tasks', () => {
    const html = renderToStaticMarkup(
      <JournalTaskReflection
        tasks={[{ id: 'task-1', label: 'A long-list task', percentComplete: 40 }] as never}
        taskId={null}
        notes={null}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('class="reference-combobox"');
    expect(html).toContain('placeholder="Search tasks"');
    expect(html).not.toContain('<select');
  });

  it('keeps authorized open and recently completed tasks only', () => {
    const tasks = [
      {
        id: 'open',
        ownerId: 'owner',
        status: 'open',
        label: 'Open',
        updatedAt: '2026-08-01T00:00:00Z',
      },
      {
        id: 'recent',
        ownerId: 'owner',
        status: 'completed',
        label: 'Recent',
        updatedAt: '2026-08-25T00:00:00Z',
      },
      {
        id: 'old',
        ownerId: 'owner',
        status: 'completed',
        label: 'Old',
        updatedAt: '2026-08-01T00:00:00Z',
      },
      {
        id: 'foreign',
        ownerId: 'other',
        status: 'open',
        label: 'Foreign',
        updatedAt: '2026-08-29T00:00:00Z',
      },
    ] as never;
    expect(eligibleJournalTasks(tasks, 'owner', '2026-08-29').map((task) => task.id)).toEqual([
      'open',
      'recent',
    ]);
    expect(resolveJournalTaskLabel(tasks, 'missing')).toBe('Task unavailable');
  });
});
