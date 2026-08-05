import { urgencyLabels, urgencyValues, type Urgency } from '@naaseh/domain';
import type { Filters } from '../../search/task-search.js';

export function TaskFilters({
  value,
  change,
  resultCount,
}: {
  value: Filters;
  change: (next: Filters) => void;
  resultCount?: number;
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
      <fieldset aria-label="Urgency levels" className="urgency-filter-group">
        <legend>Urgency</legend>
        {urgencyValues.map((urgency) => (
          <label key={urgency}>
            <input
              type="checkbox"
              value={urgency}
              checked={selectedUrgencies.includes(urgency)}
              onChange={(event) => {
                const selected = event.currentTarget.checked
                  ? [...selectedUrgencies, urgency]
                  : selectedUrgencies.filter((item) => item !== urgency);
                change({
                  ...value,
                  urgencies: urgencyValues.filter((item) => selected.includes(item)),
                });
              }}
            />
            <span>{urgencyLabels[urgency]}</span>
          </label>
        ))}
        {selectedUrgencies.length ? (
          <>
            <p>
              {selectedUrgencies.length} urgency level{selectedUrgencies.length === 1 ? '' : 's'}{' '}
              selected:{' '}
              {selectedUrgencies.map((urgency: Urgency) => urgencyLabels[urgency]).join(', ')}
            </p>
            <button
              type="button"
              className="quiet"
              aria-label="Clear urgency filters"
              onClick={() => change({ ...value, urgencies: [] })}
            >
              Clear urgency filters
            </button>
          </>
        ) : null}
        {selectedUrgencies.length > 0 && resultCount === 0 ? (
          <p role="status">No work matches the selected urgency levels.</p>
        ) : null}
      </fieldset>
      <label>
        <span>Project</span>
        <input
          value={value.projectId ?? ''}
          placeholder="Project ID or unassigned"
          onChange={(event) => change({ ...value, projectId: event.target.value })}
        />
      </label>
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
