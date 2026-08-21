import { useMemo, useState } from 'react';
import { useCombobox } from 'downshift';
import { filterReferenceOptions, type ReferenceOption } from './reference-options.js';

export function ReferenceCombobox({
  label,
  name,
  options,
  value,
  onChange,
  offline = false,
  clearLabel = 'No selection',
}: {
  label: string;
  name: string;
  options: readonly ReferenceOption[];
  value?: string;
  onChange: (id: string) => void;
  offline?: boolean;
  clearLabel?: string;
}) {
  const selected = options.find((option) => option.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? '');
  const items = useMemo(
    () => [{ id: '', label: clearLabel }, ...filterReferenceOptions(options, query)],
    [clearLabel, options, query],
  );
  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } =
    useCombobox({
      items,
      itemToString: (item) => item?.label ?? '',
      selectedItem: selected,
      inputValue: query,
      onInputValueChange: ({ inputValue }) => setQuery(inputValue ?? ''),
      onSelectedItemChange: ({ selectedItem }) => {
        onChange(selectedItem?.id ?? '');
        setQuery(selectedItem?.label === clearLabel ? '' : (selectedItem?.label ?? ''));
      },
    });
  return (
    <div className="reference-combobox">
      <label {...getLabelProps()}>{label}</label>
      <input {...getInputProps({ name, autoComplete: 'off' })} />
      <input type="hidden" name={`${name}Id`} value={value ?? ''} />
      <ul {...getMenuProps()} className={isOpen ? 'combobox-menu' : 'combobox-menu hidden'}>
        {isOpen &&
          items.map((item, index) => (
            <li
              key={item.id || '__clear'}
              {...getItemProps({ item, index })}
              className={highlightedIndex === index ? 'highlighted' : undefined}
            >
              <span>{item.label}</span>
              {item.context && <small>{item.context}</small>}
            </li>
          ))}
      </ul>
      {isOpen && items.length === 1 && query && <p role="status">No matching options.</p>}
      {offline && <small role="status">Showing options cached before going offline.</small>}
    </div>
  );
}
