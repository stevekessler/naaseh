import type { CategoryRecord, Project, Task, UrgencyCounts } from '@naaseh/domain';
import { matchesUrgencySet, zeroUrgencyCounts } from '@naaseh/domain';
import type { CompletionFilterValue } from './CompletionFilters.js';
import { localDateKey, periodKey } from './completion-bucketing.js';

export type TaskReportState = 'all' | 'open' | 'closed';
export type TaskTimeliness = 'all' | 'on-time' | 'delayed' | 'no-due-date';

export interface TaskReportRow {
  task: Task;
  state: Exclude<TaskReportState, 'all'>;
  timeliness: Exclude<TaskTimeliness, 'all'> | 'not-closed';
  categoryName: string;
  projectName: string;
}

export interface TaskReportGroup {
  key: string;
  category: string;
  project: string;
  total: number;
  open: number;
  closed: number;
}

export interface TaskReport {
  rows: TaskReportRow[];
  total: number;
  open: number;
  closed: number;
  onTime: number;
  delayed: number;
  withoutDueDate: number;
  urgencyCounts: UrgencyCounts;
  groups: TaskReportGroup[];
  buckets: Array<{ key: string; opened: number; closed: number }>;
}

const stateForTask = (task: Task): TaskReportRow['state'] =>
  task.completionState === 'completed' || task.status === 'completed' ? 'closed' : 'open';

function completionDueDate(task: Task, timeZone: string) {
  if (!task.completedAt) return undefined;
  return localDateKey(task.completedAt, timeZone);
}

export function taskTimeliness(
  task: Task,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
): TaskReportRow['timeliness'] {
  if (stateForTask(task) === 'open') return 'not-closed';
  if (!task.dueAt && !task.dueDate) return 'no-due-date';
  if (!task.completedAt) return 'not-closed';
  if (task.dueKind === 'date' && task.dueDate)
    return completionDueDate(task, timeZone)! <= task.dueDate ? 'on-time' : 'delayed';
  return task.dueAt && task.completedAt <= task.dueAt ? 'on-time' : 'delayed';
}

const relevantDate = (task: Task, state: TaskReportRow['state'], timeZone: string) =>
  state === 'closed' && task.completedAt
    ? localDateKey(task.completedAt, timeZone)
    : localDateKey(task.createdAt, timeZone);

const inRange = (date: string, from: string, to: string) =>
  (!from || date >= from) && (!to || date <= to);

export function buildTaskReport(
  tasks: readonly Task[],
  categories: readonly CategoryRecord[],
  projects: readonly Project[],
  filters: CompletionFilterValue,
): TaskReport {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projectRecords = new Map(projects.map((project) => [project.id, project]));
  const rows = tasks.flatMap((task): TaskReportRow[] => {
    const state = stateForTask(task);
    const project = task.projectId ? projectRecords.get(task.projectId) : undefined;
    const categoryId = task.categoryId ?? project?.categoryId;
    const timeliness = taskTimeliness(task, filters.timeZone);
    if (filters.taskState !== 'all' && state !== filters.taskState) return [];
    if (filters.timeliness !== 'all' && timeliness !== filters.timeliness) return [];
    if (!matchesUrgencySet(task.urgency, filters.urgencies)) return [];
    if (
      filters.projectId &&
      (filters.projectId === 'unassigned'
        ? Boolean(task.projectId)
        : task.projectId !== filters.projectId)
    )
      return [];
    if (
      filters.categoryId &&
      (filters.categoryId === 'unassigned'
        ? Boolean(categoryId)
        : categoryId !== filters.categoryId)
    )
      return [];
    if (!inRange(relevantDate(task, state, filters.timeZone), filters.from, filters.to)) return [];
    return [
      {
        task,
        state,
        timeliness,
        categoryName: categoryId
          ? (categoryNames.get(categoryId) ?? 'Unknown category')
          : 'Unassigned',
        projectName: project?.name ?? 'Unassigned',
      },
    ];
  });

  const urgencyCounts = zeroUrgencyCounts();
  const groups = new Map<string, TaskReportGroup>();
  const buckets = new Map<string, { key: string; opened: number; closed: number }>();
  for (const row of rows) {
    urgencyCounts[row.task.urgency] += 1;
    const groupKey = `${row.categoryName}\u0000${row.projectName}`;
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      category: row.categoryName,
      project: row.projectName,
      total: 0,
      open: 0,
      closed: 0,
    };
    group.total += 1;
    group[row.state] += 1;
    groups.set(groupKey, group);
    const date = relevantDate(row.task, row.state, filters.timeZone);
    const key = periodKey(date, filters.period, filters.weekStartsOn);
    const bucket = buckets.get(key) ?? { key, opened: 0, closed: 0 };
    bucket[row.state === 'closed' ? 'closed' : 'opened'] += 1;
    buckets.set(key, bucket);
  }
  return {
    rows,
    total: rows.length,
    open: rows.filter((row) => row.state === 'open').length,
    closed: rows.filter((row) => row.state === 'closed').length,
    onTime: rows.filter((row) => row.state === 'closed' && row.timeliness === 'on-time').length,
    delayed: rows.filter((row) => row.state === 'closed' && row.timeliness === 'delayed').length,
    withoutDueDate: rows.filter((row) => row.state === 'closed' && row.timeliness === 'no-due-date')
      .length,
    urgencyCounts,
    groups: [...groups.values()].sort(
      (left, right) =>
        left.category.localeCompare(right.category) || left.project.localeCompare(right.project),
    ),
    buckets: [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

const csvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  const first = [...text].find(
    (character) => !/\s/u.test(character) && character.charCodeAt(0) > 31,
  );
  const safe = first && '=+-@'.includes(first) ? `'${text}` : text;
  return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const taskReportHeaders = [
  'task_id',
  'label',
  'state',
  'priority',
  'category',
  'project',
  'created_at',
  'due_date',
  'due_at',
  'completed_at',
  'timeliness',
  'archived_at',
  'archive_reason',
  'assignee_user_id',
  'owner_user_id',
  'visibility',
  'lifecycle',
] as const;

export function taskReportCsv(rows: readonly TaskReportRow[]) {
  const records = rows.map((row) => {
    const values = {
      task_id: row.task.id,
      label: row.task.label,
      state: row.state,
      priority: row.task.urgency,
      category: row.categoryName,
      project: row.projectName,
      created_at: row.task.createdAt,
      due_date: row.task.dueDate,
      due_at: row.task.dueAt,
      completed_at: row.task.completedAt,
      timeliness: row.timeliness,
      archived_at: row.task.archivedAt,
      archive_reason: row.task.archiveReason,
      assignee_user_id: row.task.assigneeId,
      owner_user_id: row.task.ownerId,
      visibility: row.task.visibility,
      lifecycle: row.task.lifecycle,
    } satisfies Record<(typeof taskReportHeaders)[number], unknown>;
    return taskReportHeaders.map((header) => csvCell(values[header])).join(',');
  });
  return `${[taskReportHeaders.join(','), ...records].join('\r\n')}\r\n`;
}

export function downloadTaskReportCsv(rows: readonly TaskReportRow[], filename: string) {
  const url = URL.createObjectURL(
    new Blob([taskReportCsv(rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
