import { useState, type FormEvent } from 'react';
import {
  effectiveDirectoryFields,
  formatMinor,
  parseSignedMinor,
  type GlobalDirectoryItem,
  type ListItem,
} from '@naaseh/domain';
import { ListItemRow } from './ListItemRow.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';

export type NewListItem = { name: string; amountMinor: number | null };

export function parseInitialListItem(name: string, amount: string, positive: boolean): NewListItem {
  return {
    name: name.trim(),
    amountMinor: amount.trim() ? parseSignedMinor(amount, positive ? 'credit' : 'cost') : null,
  };
}

export function ListItemCreateForm({ add }: { add: (input: NewListItem) => Promise<void> }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [positive, setPositive] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;
    let input: NewListItem;
    try {
      input = parseInitialListItem(name, amount, positive);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid amount.');
      return;
    }
    setError('');
    setPending(true);
    try {
      await add(input);
      setName('');
      setAmount('');
      setPositive(false);
    } catch {
      setError('The item was not saved. Your entry is still here; try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="list-add" onSubmit={(event) => void submit(event)}>
      <label>
        Add an item
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Amount
        <input
          inputMode="decimal"
          placeholder="12.34"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-describedby={error ? 'list-item-amount-error' : undefined}
        />
      </label>
      <label className="inline-choice">
        <input
          type="checkbox"
          checked={positive}
          onChange={(event) => setPositive(event.target.checked)}
        />
        Credit
      </label>
      <button disabled={pending}>{pending ? 'Adding…' : 'Add item'}</button>
      {error && (
        <p id="list-item-amount-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ListItems({
  items,
  toggle,
  remove,
  edit,
  reset,
  promote,
  reorder,
  csrfToken,
  directory,
}: {
  items: ListItem[];
  toggle: (item: ListItem) => void;
  remove: (item: ListItem) => void;
  edit: (item: ListItem, name: string, amountMinor: number | null) => void;
  reset: (item: ListItem) => void;
  promote: (item: ListItem, name: string, amountMinor: number | null) => void;
  reorder: (items: ListItem[]) => void;
  csrfToken: string;
  directory: GlobalDirectoryItem[];
}) {
  if (!items.length) return <p>No items yet.</p>;
  return (
    <ul className="list-items">
      {items.map((item, index) => {
        const current = item.directoryItemId
          ? directory.find((entry) => entry.id === item.directoryItemId)
          : undefined;
        const effective = effectiveDirectoryFields(
          {
            directorySnapshot: item.directorySnapshot,
            ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
            ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
          },
          current,
        );
        const move = (offset: number) => {
          const ordered = [...items];
          const [selected] = ordered.splice(index, 1);
          if (!selected) return;
          ordered.splice(index + offset, 0, selected);
          reorder(ordered);
        };
        return (
          <ListItemRow
            key={item.id}
            item={item}
            name={effective.name}
            {...(effective.amountMinor === null
              ? {}
              : { value: formatMinor(effective.amountMinor, current?.currency ?? 'USD') })}
            onToggle={() => toggle(item)}
            onRemove={() => remove(item)}
            onEdit={(name, amount) => edit(item, name, amount)}
            {...(item.directoryItemId ? { onReset: () => reset(item) } : {})}
            onPromote={() => promote(item, effective.name, effective.amountMinor)}
            {...(index > 0 ? { moveUp: () => move(-1) } : {})}
            {...(index < items.length - 1 ? { moveDown: () => move(1) } : {})}
            attachments={
              <AttachmentPanelForParent
                parentType="listItem"
                parentId={item.id}
                csrfToken={csrfToken}
              />
            }
          />
        );
      })}
    </ul>
  );
}
