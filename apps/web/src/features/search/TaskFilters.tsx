import type { Filters } from '../../search/task-search.js';

export function TaskFilters({
  value,
  change,
}: {
  value: Filters;
  change: (next: Filters) => void;
}) {
  const active = [
    ['from', value.from],
    ['to', value.to],
    ['assigneeId', value.assigneeId],
    ['categoryId', value.categoryId],
  ] as const;

  return (
    <fieldset className="filter-fields">
      <legend>Filters</legend>
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
        <span>Assignee</span>
        <input
          value={value.assigneeId}
          onChange={(event) => change({ ...value, assigneeId: event.target.value })}
        />
      </label>
      <label>
        <span>Category</span>
        <input
          value={value.categoryId}
          onChange={(event) => change({ ...value, categoryId: event.target.value })}
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
