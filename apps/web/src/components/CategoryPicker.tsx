import type { CategoryRecord } from '@naaseh/domain';

export function CategoryPicker({
  categories,
  name = 'categoryId',
  value,
  defaultValue,
  allLabel,
  includeArchived = false,
  onChange,
}: {
  categories: readonly CategoryRecord[];
  name?: string;
  value?: string;
  defaultValue?: string;
  allLabel?: string;
  includeArchived?: boolean;
  onChange?: (value: string) => void;
}) {
  const options = includeArchived
    ? categories
    : categories.filter(
        (category) =>
          (category.lifecycle ?? (category.archived ? 'archived' : 'active')) === 'active',
      );
  const selected = value ?? defaultValue ?? '';
  const selectedIsMissing = selected && !options.some((category) => category.id === selected);

  return (
    <select
      name={name}
      {...(value === undefined ? { defaultValue: selected } : { value: selected })}
      {...(onChange ? { onChange: (event) => onChange(event.target.value) } : {})}
    >
      <option value="">{allLabel ?? 'Unassigned'}</option>
      {selectedIsMissing ? <option value={selected}>{selected}</option> : null}
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
          {category.lifecycle === 'archived' || category.archived ? ' (archived)' : ''}
        </option>
      ))}
    </select>
  );
}
