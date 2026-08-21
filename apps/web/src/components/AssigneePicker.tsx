export interface AssigneeOption {
  id: string;
  displayName: string;
  username?: string;
}

const excludedUsername = 'naaseh-smoke';

const identityKey = (value: string) => value.trim().replace(/^@/, '').toLocaleLowerCase();

export function mergeAssigneeOptions(
  knownAssignees: readonly AssigneeOption[],
  referencedIds: readonly (string | undefined)[] = [],
) {
  const options: AssigneeOption[] = [];
  const aliases = new Set<string>();
  const canonicalFirst = [...knownAssignees].sort(
    (left, right) => Number(Boolean(right.username)) - Number(Boolean(left.username)),
  );
  for (const assignee of canonicalFirst) {
    const id = identityKey(assignee.id);
    const username = assignee.username ? identityKey(assignee.username) : undefined;
    if (id === excludedUsername || username === excludedUsername) continue;
    if (aliases.has(id) || (username && aliases.has(username))) continue;
    options.push(assignee);
    aliases.add(id);
    if (username) aliases.add(username);
  }
  for (const referencedId of referencedIds) {
    if (!referencedId) continue;
    const id = identityKey(referencedId);
    if (id === excludedUsername || aliases.has(id)) continue;
    options.push({ id: referencedId, displayName: referencedId });
    aliases.add(id);
  }
  return options.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function visibleAssignees(assignees: readonly AssigneeOption[]) {
  return mergeAssigneeOptions(assignees);
}

export function canonicalAssigneeId(assignees: readonly AssigneeOption[], id: string) {
  if (!id) return '';
  const key = identityKey(id);
  return (
    assignees.find(
      (assignee) =>
        identityKey(assignee.id) === key ||
        (assignee.username ? identityKey(assignee.username) === key : false),
    )?.id ?? id
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
  const canonicalSelected = canonicalAssigneeId(options, selected);
  const selectedIsMissing =
    canonicalSelected && !options.some((assignee) => assignee.id === canonicalSelected);

  return (
    <select
      name={name}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      {...(value === undefined
        ? { defaultValue: canonicalSelected }
        : { value: canonicalSelected })}
      {...(onChange ? { onChange: (event) => onChange(event.target.value) } : {})}
    >
      <option value="">{allLabel ?? 'Unassigned'}</option>
      {selectedIsMissing ? <option value={canonicalSelected}>{canonicalSelected}</option> : null}
      {options.map((assignee) => (
        <option key={assignee.id} value={assignee.id}>
          {assignee.displayName}
          {assignee.username ? ` (@${assignee.username.replace(/^@/, '')})` : ''}
        </option>
      ))}
    </select>
  );
}
