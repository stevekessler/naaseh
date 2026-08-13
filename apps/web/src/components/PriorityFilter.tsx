import { normalizeUrgencySet, urgencyLabels, urgencyValues, type Urgency } from '@naaseh/domain';

export function PriorityFilter({
  value,
  change,
  resultCount,
  ariaLabel = 'Urgency levels',
}: {
  value: readonly Urgency[];
  change: (value: Urgency[]) => void;
  resultCount?: number;
  ariaLabel?: string;
}) {
  return (
    <fieldset aria-label={ariaLabel} className="priority-filter-group">
      <legend>Priority</legend>
      <div className="priority-options">
        {urgencyValues.map((priority) => (
          <label key={priority} data-priority={priority}>
            <input
              type="checkbox"
              value={priority}
              checked={value.includes(priority)}
              onChange={(event) =>
                change(
                  normalizeUrgencySet(
                    event.currentTarget.checked
                      ? [...value, priority]
                      : value.filter((item) => item !== priority),
                  ),
                )
              }
            />
            <span>{urgencyLabels[priority]}</span>
          </label>
        ))}
      </div>
      {value.length ? (
        <>
          <span className="visually-hidden">
            {value.length} urgency level{value.length === 1 ? '' : 's'} selected:{' '}
            {value.map((priority) => urgencyLabels[priority]).join(', ')}
          </span>
          <button
            type="button"
            className="quiet priority-clear"
            aria-label="Clear urgency filters"
            onClick={() => change([])}
          >
            Clear
          </button>
        </>
      ) : null}
      {value.length > 0 && resultCount === 0 ? (
        <p role="status">No work matches the selected urgency levels.</p>
      ) : null}
    </fieldset>
  );
}
