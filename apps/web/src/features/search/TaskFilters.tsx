import type { CategoryRecord, Project } from '@naaseh/domain';
import type { Filters } from '../../search/task-search.js';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
import { PriorityFilter } from '../../components/PriorityFilter.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';

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
              {key}: {current} ×
            </button>
          ))}
      </div>
    </fieldset>
  );
}
