import type { CompletionEvent, Task, UrgencyCounts } from '@naaseh/domain';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/archive/PermanentDeleteDialog.js', () => ({
  PermanentDeleteDialog: () => <button type="button">Delete permanently</button>,
}));

import { ArchivePage } from '../../src/features/archive/ArchivePage.js';
import { ProjectTree } from '../../src/features/projects/ProjectTree.js';
import { CompletionDashboard } from '../../src/features/reports/CompletionDashboard.js';

const now = '2026-08-05T12:00:00.000Z';
const projectId = '01J00000000000000000000009';
const zeroFilled: UrgencyCounts = {
  extra_low: 1,
  low: 0,
  medium: 0,
  high: 1,
  critical: 0,
};

type DashboardContractProps = Parameters<typeof CompletionDashboard>[0] & {
  urgencyCounts: UrgencyCounts;
  selectedUrgencies: string[];
  changeUrgencies: (values: string[]) => void;
  detailRows?: Array<{
    id: string;
    label: string;
    urgencyAtCompletion: string;
    overallRank?: number;
    projectRank?: number;
  }>;
  orderBy?: 'completedAt' | 'overallRank' | 'projectRank';
  changeOrder?: (order: string) => void;
  nextCursor?: string | null;
  loadMore?: () => void;
  reportState?: {
    source?: 'network' | 'cache';
    offline?: boolean;
    lastSyncedAt?: string;
    pendingUrgencyChanges?: number;
    stale?: boolean;
    error?: 'calculation_failed' | 'invalid_cursor' | 'expired_cursor' | 'context_changed';
  };
  retry?: () => void;
  restart?: () => void;
  refreshAfterReconnect?: () => void;
};
const ReportingDashboard = CompletionDashboard as ComponentType<DashboardContractProps>;

type ProjectTreeContractProps = Parameters<typeof ProjectTree>[0] & {
  selectedUrgencies?: string[];
  changeUrgencies?: (values: string[]) => void;
  detailRows?: Array<{
    id: string;
    label: string;
    urgency: string;
    overallRank: number;
    projectRank?: number;
  }>;
  detailScope?: 'category' | 'project' | 'unassigned';
  orderBy?: 'overallRank' | 'projectRank';
  changeOrder?: (order: string) => void;
  nextCursor?: string | null;
  loadMore?: () => void;
  cursorError?: 'invalid' | 'expired' | 'context_changed';
  restart?: () => void;
};
const ReportingProjectTree = ProjectTree as ComponentType<ProjectTreeContractProps>;

type ArchiveContractProps = Parameters<typeof ArchivePage>[0] & {
  urgencyCounts: UrgencyCounts;
  exportCsv: () => void;
  exportState?: 'idle' | 'pending' | 'failed';
  retryExport?: () => void;
};
const ReportingArchive = ArchivePage as ComponentType<ArchiveContractProps>;

const historicalEvent = {
  id: '01J00000000000000000000100',
  taskId: '01J00000000000000000000101',
  completedBy: 'viewer',
  occurredAt: now,
  counted: true,
  createdAt: now,
  urgencyAtCompletion: 'extra_low',
} as unknown as CompletionEvent;

const dashboard = (patch: Partial<DashboardContractProps> = {}) => (
  <ReportingDashboard
    events={[historicalEvent]}
    categories={[]}
    projects={[]}
    pending={0}
    urgencyCounts={zeroFilled}
    selectedUrgencies={[]}
    changeUrgencies={vi.fn()}
    {...patch}
  />
);

const workloadTree = {
  categories: [
    {
      category: {
        id: '01J00000000000000000000008',
        name: 'Launch',
        lifecycle: 'active',
      },
      count: { taskCount: 2, listCount: 0, urgencyCounts: zeroFilled },
      projects: [
        {
          project: {
            id: projectId,
            categoryId: '01J00000000000000000000008',
            name: 'Release',
            lifecycle: 'active',
          },
          count: { taskCount: 2, listCount: 0, urgencyCounts: zeroFilled },
        },
      ],
    },
  ],
  unassigned: { taskCount: 0, listCount: 0, urgencyCounts: zeroFilled },
  asOf: now,
};

describe('urgency-aware reporting surfaces', () => {
  it('shows five-level completion filters, zero-filled breakdowns, and historical snapshot wording', () => {
    const html = renderToStaticMarkup(dashboard());

    expect(html).toContain('aria-label="Completion urgency filters"');
    for (const label of ['Extra Low', 'Low', 'Medium', 'High', 'Critical']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Low: 0');
    expect(html).toContain('Critical: 0');
    expect(html).toContain('Priority at completion');
    expect(html).toContain('uses the priority captured when each to-do was completed');
  });

  it('renders current urgency breakdowns throughout Category, Project, and unassigned workload tree', () => {
    const html = renderToStaticMarkup(
      <ReportingProjectTree
        tree={workloadTree as Parameters<typeof ProjectTree>[0]['tree']}
        selectedUrgencies={[]}
        changeUrgencies={vi.fn()}
      />,
    );

    expect(html).toContain('Current priority breakdown for Launch');
    expect(html).toContain('Current priority breakdown for Release');
    expect(html).toContain('Current priority breakdown for Unassigned');
    expect(html).toContain('Extra Low: 1');
    expect(html).toContain('Low: 0');
    expect(html).toContain('Critical: 0');
  });

  it('supports authorized drilldown sorting by viewer overall/Project rank with scope constraints', () => {
    const rows = [
      {
        id: 'a',
        label: 'Extra Low first in Project',
        urgency: 'extra_low',
        overallRank: 5,
        projectRank: 1,
      },
      { id: 'b', label: 'High second in Project', urgency: 'high', overallRank: 1, projectRank: 2 },
    ];
    const projectHtml = renderToStaticMarkup(
      <ReportingProjectTree
        tree={workloadTree as Parameters<typeof ProjectTree>[0]['tree']}
        detailRows={rows}
        detailScope="project"
        orderBy="projectRank"
        changeOrder={vi.fn()}
        nextCursor="next-page"
        loadMore={vi.fn()}
      />,
    );
    const categoryHtml = renderToStaticMarkup(
      <ReportingProjectTree
        tree={workloadTree as Parameters<typeof ProjectTree>[0]['tree']}
        detailRows={rows}
        detailScope="category"
        orderBy="projectRank"
        changeOrder={vi.fn()}
      />,
    );

    expect(projectHtml).toContain('Sort by Overall rank');
    expect(projectHtml).toContain('Sort by Project rank');
    expect(projectHtml.indexOf(rows[0]!.label)).toBeLessThan(projectHtml.indexOf(rows[1]!.label));
    expect(projectHtml).toContain('Overall position 5');
    expect(projectHtml).toContain('Project position 1');
    expect(projectHtml).toContain('Load more report rows');
    expect(categoryHtml).toContain('Project rank is available only within one Project.');
  });

  it('shows archive urgency breakdown/filter/export controls while omitting inactive ranks', () => {
    const archived = {
      id: '01J00000000000000000000110',
      ownerId: 'viewer',
      label: 'Archived critical work',
      memo: '',
      memoHidden: false,
      status: 'archived',
      lifecycle: 'archived',
      completionState: 'open',
      urgency: 'critical',
      visibility: 'private',
      version: 2,
      createdAt: now,
      updatedAt: now,
      archivedAt: now,
      archivedBy: 'viewer',
    } as Task;
    const html = renderToStaticMarkup(
      <ReportingArchive
        entries={[{ kind: 'task', task: archived, pending: false, conflicted: false }]}
        restore={vi.fn()}
        csrfToken="csrf"
        filters={{
          query: '',
          from: '',
          to: '',
          assigneeId: '',
          categoryId: '',
          projectId: '',
          lifecycle: 'archive',
          contentType: 'all',
          urgencies: [],
        }}
        changeFilters={vi.fn()}
        urgencyCounts={{ ...zeroFilled, extra_low: 0, critical: 1 }}
        exportCsv={vi.fn()}
      />,
    );

    expect(html).toContain('Archive priority breakdown');
    expect(html).toContain('Critical: 1');
    expect(html).toContain('Export CSV');
    expect(html).toContain('Priority, Overall rank, Project rank');
    expect(html).not.toContain('Overall position');
    expect(html).not.toContain('Project position');
  });

  it('uses previously synchronized reports offline and identifies locally pending urgency changes', () => {
    const html = renderToStaticMarkup(
      dashboard({
        pending: 1,
        reportState: {
          source: 'cache',
          offline: true,
          lastSyncedAt: now,
          pendingUrgencyChanges: 1,
        },
      }),
    );

    expect(html).toContain('Offline · showing previously synchronized report');
    expect(html).toContain('Last synchronized');
    expect(html).toContain('1 local priority change pending');
    expect(html).toContain('Report includes pending local values');
  });

  it('surfaces stale-cache and calculation failures with retry and reconnect refresh actions', () => {
    const staleHtml = renderToStaticMarkup(
      dashboard({
        reportState: { source: 'cache', stale: true, lastSyncedAt: now },
        refreshAfterReconnect: vi.fn(),
      }),
    );
    const failedHtml = renderToStaticMarkup(
      dashboard({ reportState: { error: 'calculation_failed' }, retry: vi.fn() }),
    );

    expect(staleHtml).toContain('This cached report may be out of date.');
    expect(staleHtml).toContain('Refresh after reconnect');
    expect(failedHtml).toContain('Unable to calculate this report.');
    expect(failedHtml).toContain('Retry report');
  });

  it('projects remote periods without zeros while preserving total, detail, and offline status', () => {
    const html = renderToStaticMarkup(
      dashboard({
        pending: 2,
        detailRows: [{ id: 'detail', label: 'Preserved detail', urgencyAtCompletion: 'high' }],
        remoteReport: {
          total: 3,
          urgencyCounts: zeroFilled,
          buckets: [
            { key: 'zero-period', count: 0 },
            { key: 'positive-period', count: 3 },
          ],
        },
        reportState: { source: 'cache', offline: true, stale: true },
      }),
    );

    expect(html).toContain('Completed Tasks');
    expect(html).not.toContain('zero-period');
    expect(html).toContain('positive-period');
    expect(html).toContain('3 completed');
    expect(html).toContain('Preserved detail');
    expect(html).toContain('2 local changes pending sync');
    expect(html).toContain('Offline · showing previously synchronized report');
    expect(html).toContain('This cached report may be out of date.');
  });

  it('shows an empty range state and retains independent status when all periods are zero', () => {
    const html = renderToStaticMarkup(
      dashboard({
        pending: 1,
        remoteReport: {
          total: 0,
          urgencyCounts: zeroFilled,
          buckets: [{ key: 'zero-period', count: 0 }],
        },
      }),
    );
    expect(html).toContain('No completed tasks occurred in the selected range.');
    expect(html).toContain('1 local change pending sync');
    expect(html).not.toContain('Completion totals by period');
  });

  it('uses filtered empty copy when a priority filter is active', () => {
    const html = renderToStaticMarkup(
      dashboard({
        selectedUrgencies: ['critical'],
        remoteReport: { total: 0, urgencyCounts: zeroFilled, buckets: [] },
      }),
    );
    expect(html).toContain('No completed tasks match the current filters.');
  });

  it('uses the safe recovery path for invalid source periods', () => {
    const html = renderToStaticMarkup(
      dashboard({
        retry: vi.fn(),
        remoteReport: {
          total: 1,
          urgencyCounts: zeroFilled,
          buckets: [{ key: 'invalid', count: -1 }],
        },
      }),
    );
    expect(html).toContain('Unable to calculate this report.');
    expect(html).toContain('Retry report');
    expect(html).not.toContain('Completion totals by period');
  });

  it.each([
    ['invalid_cursor', 'invalid'],
    ['expired_cursor', 'expired'],
    ['context_changed', 'changed because access or report context changed'],
  ] as const)('recovers from %s pagination with an explicit restart', (error, message) => {
    const html = renderToStaticMarkup(
      dashboard({ reportState: { error }, restart: vi.fn(), nextCursor: 'stale-cursor' }),
    );

    expect(html).toContain(`Report continuation is ${message}`);
    expect(html).toContain('Restart report');
  });
});
