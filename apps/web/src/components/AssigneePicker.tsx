export interface AssigneeOption {
  id: string;
  displayName: string;
  username?: string;
}

const excludedUsername = 'naaseh-smoke';

export function visibleAssignees(assignees: readonly AssigneeOption[]) {
  return assignees.filter(
    (assignee) =>
      assignee.id.replace(/^@/, '').toLocaleLowerCase() !== excludedUsername &&
      assignee.username?.replace(/^@/, '').toLocaleLowerCase() !== excludedUsername,
  );
}

export function AssigneePicker({
  assignees,
  name = 'assigneeId',
  value,
  defaultValue,
  allLabel,
  ariaLabel,
  onChange,
}: {
  assignees: readonly AssigneeOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  allLabel?: string;
  ariaLabel?: string;
  onChange?: (value: string) => void;
}) {
  const options = visibleAssignees(assignees);
  const selected = value ?? defaultValue ?? '';
  const selectedIsMissing = selected && !options.some((assignee) => assignee.id === selected);

  return (
    <select
      name={name}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      {...(value === undefined ? { defaultValue: selected } : { value: selected })}
      {...(onChange ? { onChange: (event) => onChange(event.target.value) } : {})}
    >
      <option value="">{allLabel ?? 'Unassigned'}</option>
      {selectedIsMissing ? <option value={selected}>{selected}</option> : null}
      {options.map((assignee) => (
        <option key={assignee.id} value={assignee.id}>
          {assignee.displayName}
          {assignee.username ? ` (@${assignee.username.replace(/^@/, '')})` : ''}
        </option>
      ))}
    </select>
  );
}
