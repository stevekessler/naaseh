import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createTask, type TaskRevision } from '@naaseh/domain';

vi.mock('../../src/features/archive/PermanentDeleteDialog.js', () => ({
  PermanentDeleteDialog: () => <button type="button">Delete permanently</button>,
}));

import { ArchivePage, matchesArchiveFilters } from '../../src/features/archive/ArchivePage.js';
import { RevisionLog } from '../../src/features/tasks/RevisionLog.js';

const now = new Date('2026-08-05T12:00:00.000Z');

describe('archived and revised urgency display', () => {
  it('shows archived work urgency with a full accessible text badge', () => {
    const task = {
      ...createTask({ label: 'Archived release', urgency: 'critical' }, 'owner', now),
      status: 'archived' as const,
      lifecycle: 'archived' as const,
      archivedAt: now.toISOString(),
      archivedBy: 'owner',
    };
    const html = renderToStaticMarkup(
      <ArchivePage
        entries={[{ kind: 'task', task, pending: false, conflicted: false }]}
        restore={vi.fn()}
        csrfToken="csrf"
      />,
    );

    expect(html).toContain('data-urgency="critical"');
    expect(html).toContain('aria-label="Priority: Critical"');
    expect(html).toContain('Priority: Critical');
  });

  it('combines offline archive urgency with Project, assignee, Category, date, and content type', () => {
    const projectId = '01J00000000000000000000009';
    const categoryId = '01J00000000000000000000008';
    const matching = {
      ...createTask(
        {
          label: 'August release',
          urgency: 'high',
          projectId,
          categoryId,
          assigneeId: 'owner',
          dueAt: '2026-08-10T12:00:00.000Z',
          dueTimeZone: 'UTC',
        },
        'owner',
        now,
      ),
      status: 'archived' as const,
      lifecycle: 'archived' as const,
      archivedAt: now.toISOString(),
      archivedBy: 'owner',
    };
    const critical = {
      ...matching,
      id: '01J00000000000000000000020',
      urgency: 'critical' as const,
    };
    const filters = {
      query: '',
      from: '2026-08-01',
      to: '2026-08-31',
      assigneeId: 'owner',
      categoryId,
      projectId,
      lifecycle: 'archive' as const,
      contentType: 'todos' as const,
      urgencies: ['high' as const],
    };

    expect(
      [matching, critical].filter((task) =>
        matchesArchiveFilters(
          { kind: 'task', task, pending: false, conflicted: false },
          filters,
          'release',
        ),
      ),
    ).toEqual([matching]);

    const html = renderToStaticMarkup(
      <ArchivePage
        entries={[
          { kind: 'task', task: matching, pending: false, conflicted: false },
          { kind: 'task', task: critical, pending: false, conflicted: false },
        ]}
        restore={vi.fn()}
        csrfToken="csrf"
        filters={filters}
        changeFilters={vi.fn()}
      />,
    );
    expect(html).toContain('August release');
    expect(html).not.toContain('Urgency: Critical');
    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(4);
  });

  it('renders urgency revision values as full labels instead of wire values alone', () => {
    const revision: TaskRevision = {
      id: '01J00000000000000000000001',
      taskId: '01J00000000000000000000002',
      actorId: 'owner',
      version: 2,
      changedAt: now.toISOString(),
      operation: 'update',
      changedFields: ['urgency'],
      before: { urgency: 'low' },
      after: { urgency: 'critical' },
      syncOutcome: 'applied',
    };
    const html = renderToStaticMarkup(<RevisionLog revisions={[revision]} />);

    expect(html).toContain('Priority changed from');
    expect(html).toContain('<strong>Low</strong>');
    expect(html).toContain('<strong>Critical</strong>');
    expect(html).not.toContain('low');
  });
});
