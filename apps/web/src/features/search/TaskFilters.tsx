import type { CategoryRecord, Project } from '@naaseh/domain';
import type { Filters } from '../../search/task-search.js';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
import { PriorityFilter } from '../../components/PriorityFilter.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';

export type DatePreset = 'today' | 'tomorrow' | 'week' | 'month';

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
  } else if (preset === 'week') {
    start.setDate(start.getDate() - start.getDay());
    end.setDate(start.getDate() + 6);
  } else if (preset === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  return { from: localDate(start), to: localDate(end) };
}

export function TaskFilters({
  value,
  change,
  resultCount,
  categories = [],
  projects = [],
  assignees = [],
}: {
  value: Filters;
  change: (next: Filters) => void;
  resultCount?: number;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  assignees?: readonly AssigneeOption[];
}) {
  const selectedUrgencies = value.urgencies ?? [];
  const active = [
    ['from', value.from],
    ['to', value.to],
    ['assigneeId', value.assigneeId],
    ['categoryId', value.categoryId],
    ['projectId', value.projectId ?? ''],
  ] as const;
  const filterLabels: Record<(typeof active)[number][0], string> = {
    from: 'From',
    to: 'To',
    assigneeId: 'Assignee',
    categoryId: 'Category',
    projectId: 'Project',
  };
  const displayFilterValue = (key: (typeof active)[number][0], current: string) => {
    if (key === 'assigneeId')
      return assignees.find((assignee) => assignee.id === current)?.displayName ?? current;
    if (key === 'categoryId')
      return categories.find((category) => category.id === current)?.name ?? current;
    if (key === 'projectId')
      return projects.find((project) => project.id === current)?.name ?? current;
    return current;
  };

  return (
    <fieldset className="filter-fields">
      <legend>Filters</legend>
      <PriorityFilter
        value={selectedUrgencies}
        change={(urgencies) => change({ ...value, urgencies })}
        {...(resultCount === undefined ? {} : { resultCount })}
      />
      <ProjectPicker
        categories={categories}
        projects={projects}
        value={value.projectId ?? ''}
        categoryId={value.categoryId}
        allLabel="All projects"
        onChange={(projectId) => change({ ...value, projectId })}
      />
      <label>
        <span>Scope</span>
        <select
          value={value.lifecycle ?? 'active'}
          onChange={(event) =>
            change({ ...value, lifecycle: event.target.value as 'active' | 'archive' | 'all' })
          }
        >
          <option value="active">Active</option>
          <option value="archive">Archive</option>
          <option value="all">Active and archive</option>
        </select>
      </label>
      <label>
        <span>Content</span>
        <select
          value={value.contentType ?? 'all'}
          onChange={(event) =>
            change({ ...value, contentType: event.target.value as 'all' | 'lists' | 'todos' })
          }
        >
          <option value="all">All</option>
          <option value="lists">Lists</option>
          <option value="todos">To-do lists</option>
        </select>
      </label>
      <label>
        <span>Progress</span>
        <select
          value={value.progress ?? 'all'}
          onChange={(event) =>
            change({
              ...value,
              progress: event.currentTarget.value as Exclude<Filters['progress'], undefined>,
            })
          }
        >
          <option value="all">Any progress</option>
          <option value="not-started">Not started</option>
          <option value="in-progress">In progress</option>
          <option value="complete">100% complete</option>
        </select>
      </label>
      <label>
        <span>From</span>
        <input
          type="date"
          value={value.from}
          onChange={(event) => change({ ...value, from: event.target.value })}
        />
      </label>
      <label>
        <span>To</span>
        <input
          type="date"
          value={value.to}
          onChange={(event) => change({ ...value, to: event.target.value })}
        />
      </label>
      <div className="date-filter-presets" role="group" aria-label="Due date shortcuts">
        {(
          [
            ['today', 'Today'],
            ['tomorrow', 'Tomorrow'],
            ['week', 'This week'],
            ['month', 'This month'],
          ] as const
        ).map(([preset, label]) => (
          <button
            type="button"
            className="quiet"
            key={preset}
            onClick={() => change({ ...value, ...dateRangeForPreset(preset) })}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        <span>Filter by assignee</span>
        <AssigneePicker
          assignees={assignees}
          value={value.assigneeId}
          allLabel="All assignees"
          ariaLabel="Assignee"
          onChange={(assigneeId) => change({ ...value, assigneeId })}
        />
      </label>
      <label>
        <span>Category</span>
        <CategoryPicker
          categories={categories}
          value={value.categoryId}
          allLabel="All categories"
          onChange={(categoryId) =>
            change({
              ...value,
              categoryId,
              projectId:
                value.projectId &&
                projects.find((project) => project.id === value.projectId)?.categoryId !==
                  categoryId
                  ? ''
                  : (value.projectId ?? ''),
            })
          }
        />
      </label>
      <div className="filter-chips" role="group" aria-label="Active filters">
        {active
          .filter(([, current]) => current)
          .map(([key, current]) => (
            <button
              className="quiet"
              key={key}
              onClick={() => change({ ...value, [key]: '' })}
              aria-label={`Remove ${key} filter`}
            >
              {filterLabels[key]}: {displayFilterValue(key, current)} ×
            </button>
          ))}
      </div>
    </fieldset>
  );
}
