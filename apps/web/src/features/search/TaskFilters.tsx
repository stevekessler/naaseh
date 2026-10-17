import type { CategoryRecord, Project } from '@naaseh/domain';
import type { Filters } from '../../search/task-search.js';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
import { PriorityFilter } from '../../components/PriorityFilter.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { dateRangeForPresets } from '../../search/task-filters.js';
import { filtersExpandToAllReadable } from '../../search/task-search.js';

export { dateRangeForPreset } from '../../search/task-filters.js';

export function TaskFilters({
  value,
  change,
  resultCount,
  categories = [],
  projects = [],
  assignees = [],
  groups = [],
  currentUserId,
  currentUserGroupIds = [],
  contentType = 'all',
}: {
  value: Filters;
  change: (next: Filters) => void;
  resultCount?: number;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  assignees?: readonly AssigneeOption[];
  groups?: readonly { id: string; name: string }[];
  currentUserId?: string;
  currentUserGroupIds?: readonly string[];
  contentType?: 'all' | 'tasks';
}) {
  const selectedUrgencies = value.urgencies ?? [];
  const active = [
    ['from', value.from],
    ['to', value.to],
    ['categoryId', value.categoryId],
    ['projectId', value.projectId ?? ''],
  ] as const;
  const filterLabels: Record<(typeof active)[number][0], string> = {
    from: 'From',
    to: 'To',
    categoryId: 'Category',
    projectId: 'Project',
  };
  const displayFilterValue = (key: (typeof active)[number][0], current: string) => {
    if (key === 'categoryId')
      return categories.find((category) => category.id === current)?.name ?? current;
    if (key === 'projectId')
      return projects.find((project) => project.id === current)?.name ?? current;
    return current;
  };
  const selectedAssignees = value.assigneeIds?.length
    ? value.assigneeIds
    : value.assigneeId
      ? [value.assigneeId]
      : [];
  const selectedGroups = value.groupIds ?? [];
  const conditionLabels = [
    ...(selectedAssignees.length
      ? [
          `Assignee is ${selectedAssignees
            .map((id) => assignees.find((assignee) => assignee.id === id)?.displayName ?? id)
            .join(' or ')}`,
        ]
      : []),
    ...(selectedGroups.length
      ? [
          `Group is ${selectedGroups
            .map((id) => groups.find((group) => group.id === id)?.name ?? id)
            .join(' or ')}`,
        ]
      : []),
    ...(selectedUrgencies.length ? [`Priority is ${selectedUrgencies.join(' or ')}`] : []),
  ];
  const expanded = Boolean(
    currentUserId &&
      filtersExpandToAllReadable(value, {
        userId: currentUserId,
        groupIds: currentUserGroupIds,
      }),
  );

  return (
    <fieldset className="filter-fields">
      <legend>Filters</legend>
      <PriorityFilter
        value={selectedUrgencies}
        change={(urgencies) => change({ ...value, urgencies })}
        {...(resultCount === undefined ? {} : { resultCount })}
      />
      <fieldset className="filter-match-mode">
        <legend>How should conditions match?</legend>
        <label>
          <input
            type="radio"
            name="filterMatchMode"
            checked={(value.match ?? 'all') === 'all'}
            onChange={() => change({ ...value, match: 'all' })}
          />
          Match all conditions
        </label>
        <label>
          <input
            type="radio"
            name="filterMatchMode"
            checked={value.match === 'any'}
            onChange={() => change({ ...value, match: 'any' })}
          />
          Match any condition
        </label>
      </fieldset>
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
      {contentType === 'all' ? (
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
      ) : null}
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
          onChange={(event) => change({ ...value, from: event.target.value, datePresets: [] })}
        />
      </label>
      <label>
        <span>To</span>
        <input
          type="date"
          value={value.to}
          onChange={(event) => change({ ...value, to: event.target.value, datePresets: [] })}
        />
      </label>
      <div className="date-filter-presets" role="group" aria-label="Due date shortcuts">
        {(
          [
            ['today', 'Today'],
            ['tomorrow', 'Tomorrow'],
            ['week', 'This week'],
            ['nextWeek', 'Next week'],
            ['nextNextWeek', 'Week after next'],
            ['month', 'This month'],
          ] as const
        ).map(([preset, label]) => (
          <button
            type="button"
            className="quiet"
            key={preset}
            aria-pressed={value.datePresets?.includes(preset) ?? false}
            onClick={() => {
              const selected = value.datePresets ?? [];
              const datePresets = selected.includes(preset)
                ? selected.filter((item) => item !== preset)
                : [...selected, preset];
              change({ ...value, datePresets, ...dateRangeForPresets(datePresets) });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        <span>Add assignee filter</span>
        <AssigneePicker
          assignees={assignees.filter((assignee) => !selectedAssignees.includes(assignee.id))}
          value=""
          allLabel="Choose an assignee"
          ariaLabel="Assignee"
          onChange={(assigneeId) =>
            assigneeId &&
            change({
              ...value,
              assigneeId: '',
              assigneeIds: [...selectedAssignees, assigneeId],
            })
          }
        />
      </label>
      {groups.length ? (
        <label>
          <span>Add group filter</span>
          <select
            value=""
            onChange={(event) => {
              const groupId = event.currentTarget.value;
              if (groupId) change({ ...value, groupIds: [...selectedGroups, groupId] });
            }}
          >
            <option value="">Choose a group</option>
            {groups
              .filter((group) => !selectedGroups.includes(group.id))
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
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
        {selectedAssignees.map((id) => (
          <button
            className="quiet"
            key={`assignee:${id}`}
            onClick={() =>
              change({
                ...value,
                assigneeId: '',
                assigneeIds: selectedAssignees.filter((item) => item !== id),
              })
            }
            aria-label="Remove assignee filter"
          >
            Assignee: {assignees.find((assignee) => assignee.id === id)?.displayName ?? id} ×
          </button>
        ))}
        {selectedGroups.map((id) => (
          <button
            className="quiet"
            key={`group:${id}`}
            onClick={() =>
              change({ ...value, groupIds: selectedGroups.filter((item) => item !== id) })
            }
            aria-label="Remove group filter"
          >
            Group: {groups.find((group) => group.id === id)?.name ?? id} ×
          </button>
        ))}
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
      {conditionLabels.length ? (
        <p className="filter-expression-summary">
          {conditionLabels.join(value.match === 'any' ? ' OR ' : ' AND ')}
        </p>
      ) : null}
      {expanded ? <p role="status">Searching all readable content.</p> : null}
    </fieldset>
  );
}
