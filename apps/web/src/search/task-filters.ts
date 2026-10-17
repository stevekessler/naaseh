import { matchesUrgencySet, type Task, type Urgency } from '@naaseh/domain';

export type DatePreset = 'today' | 'tomorrow' | 'week' | 'nextWeek' | 'nextNextWeek' | 'month';

const localDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function dateRangeForPreset(preset: DatePreset, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (preset === 'tomorrow') {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
  } else if (preset === 'week' || preset === 'nextWeek' || preset === 'nextNextWeek') {
    const weekOffset = preset === 'week' ? 0 : preset === 'nextWeek' ? 1 : 2;
    start.setDate(start.getDate() - start.getDay() + weekOffset * 7);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (preset === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  return { from: localDate(start), to: localDate(end) };
}

export function dateRangeForPresets(presets: readonly DatePreset[], now = new Date()) {
  const ranges = presets.map((preset) => dateRangeForPreset(preset, now));
  return {
    from: ranges.map(({ from }) => from).sort()[0] ?? '',
    to:
      ranges
        .map(({ to }) => to)
        .sort()
        .at(-1) ?? '',
  };
}

export function matchesDatePresets(
  dueDate: string | undefined,
  presets: readonly DatePreset[] | undefined,
  now = new Date(),
) {
  return (
    !presets?.length ||
    Boolean(
      dueDate &&
        presets.some((preset) => {
          const range = dateRangeForPreset(preset, now);
          return dueDate >= range.from && dueDate <= range.to;
        }),
    )
  );
}
export interface TaskFilters {
  from?: string;
  to?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  groupIds?: string[];
  match?: 'all' | 'any';
  categoryId?: string;
  projectId?: string;
  status?: Task['status'];
  urgencies?: Urgency[];
  datePresets?: DatePreset[];
}
export function taskDueDateKey(task: Pick<Task, 'dueAt' | 'dueDate'>) {
  if (task.dueDate) return task.dueDate;
  if (!task.dueAt) return undefined;
  const due = new Date(task.dueAt);
  const year = due.getFullYear();
  const month = String(due.getMonth() + 1).padStart(2, '0');
  const day = String(due.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function matchesFilters(task: Task, filters: TaskFilters) {
  const dueDate = taskDueDateKey(task);
  return (
    (!filters.from || Boolean(dueDate && dueDate >= filters.from)) &&
    (!filters.to || Boolean(dueDate && dueDate <= filters.to)) &&
    matchesDatePresets(dueDate, filters.datePresets) &&
    (!(filters.assigneeIds?.length ?? 0) || filters.assigneeIds!.includes(task.assigneeId)) &&
    (!filters.assigneeId || task.assigneeId === filters.assigneeId) &&
    (!(filters.groupIds?.length ?? 0) ||
      Boolean(task.groupId && filters.groupIds!.includes(task.groupId))) &&
    (!filters.categoryId || task.categoryId === filters.categoryId) &&
    (!filters.projectId ||
      (filters.projectId === 'unassigned'
        ? !task.projectId
        : task.projectId === filters.projectId)) &&
    (!filters.status || task.status === filters.status) &&
    matchesUrgencySet(task.urgency, filters.urgencies)
  );
}
