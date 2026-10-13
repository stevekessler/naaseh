import { type CategoryRecord, type Project, type Urgency } from '@naaseh/domain';
import type { CompletionPeriod } from './completion-bucketing.js';
import { PriorityFilter } from '../../components/PriorityFilter.js';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
import type { TaskReportState, TaskTimeliness } from './task-reporting.js';

export type TaskVisibilityFilter = 'all' | 'public' | 'private';
export type ReportDatePreset = 'today' | 'this-week' | 'last-week' | 'this-month' | 'this-quarter';

export interface CompletionFilterValue {
  period: CompletionPeriod;
  categoryId: string;
  projectId: string;
  groupId: string;
  assigneeId: string;
  visibility: TaskVisibilityFilter;
  timeZone: string;
  weekStartsOn: number;
  urgencies: Urgency[];
  from: string;
  to: string;
  taskState: TaskReportState;
  timeliness: TaskTimeliness;
}

const localDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function reportDateRange(preset: ReportDatePreset, weekStartsOn: number, now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  if (preset === 'this-week' || preset === 'last-week') {
    const offset = (from.getDay() - weekStartsOn + 7) % 7;
    from.setDate(from.getDate() - offset - (preset === 'last-week' ? 7 : 0));
    to.setTime(from.getTime());
    to.setDate(to.getDate() + 6);
  } else if (preset === 'this-month') {
    from.setDate(1);
    to.setMonth(from.getMonth() + 1, 0);
  } else if (preset === 'this-quarter') {
    from.setMonth(Math.floor(from.getMonth() / 3) * 3, 1);
    to.setFullYear(from.getFullYear(), from.getMonth() + 3, 0);
  }
  return { from: localDateKey(from), to: localDateKey(to) };
}

export function CompletionFilters({
  value,
  categories,
  projects,
  groups = [],
  assignees = [],
  change,
}: {
  value: CompletionFilterValue;
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  groups?: readonly { id: string; name: string }[];
  assignees?: readonly AssigneeOption[];
  change: (value: CompletionFilterValue) => void;
}) {
  const categoryProjects = value.categoryId
    ? projects.filter((project) => project.categoryId === value.categoryId)
    : projects;
  const datePresets = [
    ['today', 'Today'],
    ['this-week', 'This week'],
    ['last-week', 'Last week'],
    ['this-month', 'This month'],
    ['this-quarter', 'This quarter'],
  ] as const;
  return (
    <fieldset className="completion-filters">
      <legend className="visually-hidden">Task report filters</legend>
      <div className="completion-filter-heading">
        <strong>Task report filters</strong>
        <button
          type="button"
          className="quiet"
          onClick={() =>
            change({
              ...value,
              period: 'day',
              categoryId: '',
              projectId: '',
              groupId: '',
              assigneeId: '',
              visibility: 'all',
              urgencies: [],
              from: '',
              to: '',
              taskState: 'all',
              timeliness: 'all',
            })
          }
        >
          Clear filters
        </button>
      </div>
      <div className="completion-date-presets" role="group" aria-label="Report date shortcuts">
        {datePresets.map(([preset, label]) => {
          const range = reportDateRange(preset, value.weekStartsOn);
          return (
            <button
              type="button"
              key={preset}
              aria-pressed={value.from === range.from && value.to === range.to}
              onClick={() => change({ ...value, ...range })}
            >
              {label}
            </button>
          );
        })}
      </div>
      <label>
        Task state
        <select
          value={value.taskState}
          onChange={(event) =>
            change({ ...value, taskState: event.target.value as TaskReportState })
          }
        >
          <option value="all">Open and closed</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <label>
        Period
        <select
          value={value.period}
          onChange={(event) => change({ ...value, period: event.target.value as CompletionPeriod })}
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => change({ ...value, from: event.target.value })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => change({ ...value, to: event.target.value })}
        />
      </label>
      <label>
        Category
        <select
          value={value.categoryId}
          onChange={(event) => change({ ...value, categoryId: event.target.value, projectId: '' })}
        >
          <option value="">All categories</option>
          <option value="unassigned">Unassigned</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.lifecycle === 'archived' || category.archived ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project
        <select
          value={value.projectId}
          onChange={(event) => change({ ...value, projectId: event.target.value })}
        >
          <option value="">All projects</option>
          <option value="unassigned">Unassigned</option>
          {categoryProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.lifecycle === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Group
        <select
          value={value.groupId}
          onChange={(event) => change({ ...value, groupId: event.target.value })}
        >
          <option value="">All groups</option>
          <option value="unassigned">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <AssigneePicker
          assignees={assignees}
          value={value.assigneeId}
          allLabel="All assignees"
          onChange={(assigneeId) => change({ ...value, assigneeId })}
        />
      </label>
      <label>
        Privacy
        <select
          value={value.visibility}
          onChange={(event) =>
            change({ ...value, visibility: event.target.value as TaskVisibilityFilter })
          }
        >
          <option value="all">Public and private</option>
          <option value="private">Private tasks</option>
          <option value="public">Public tasks</option>
        </select>
      </label>
      {value.period === 'week' && (
        <label>
          Week starts
          <select
            value={value.weekStartsOn}
            onChange={(event) => change({ ...value, weekStartsOn: Number(event.target.value) })}
          >
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
            <option value={6}>Saturday</option>
          </select>
        </label>
      )}
      <label>
        Closed on time
        <select
          value={value.timeliness}
          onChange={(event) =>
            change({ ...value, timeliness: event.target.value as TaskTimeliness })
          }
        >
          <option value="all">All timing</option>
          <option value="on-time">On time</option>
          <option value="delayed">Delayed</option>
          <option value="no-due-date">No due date</option>
        </select>
      </label>
      <PriorityFilter
        ariaLabel="Completion urgency filters"
        value={value.urgencies}
        change={(urgencies) => change({ ...value, urgencies })}
      />
    </fieldset>
  );
}
