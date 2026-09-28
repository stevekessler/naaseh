import { useState, type FormEvent } from 'react';
import { effectiveDirectoryFields, type GlobalDirectoryItem, type ListItem } from '@naaseh/domain';
import { ListItemRow } from './ListItemRow.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';

export type NewListItem = {
  name: string;
  dueDate?: string;
  memo?: string;
};

export const parseInitialListItem = (name: string): NewListItem => ({ name: name.trim() });

export function ListItemCreateForm({ add }: { add: (input: NewListItem) => Promise<void> }) {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;
    let input: NewListItem;
    try {
      input = {
        ...parseInitialListItem(name),
        ...(dueDate ? { dueDate } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid amount.');
      return;
    }
    setError('');
    setPending(true);
    try {
      await add(input);
      setName('');
      setDueDate('');
      setMemo('');
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
      <details className="list-item-options">
        <summary>Optional details</summary>
        <div className="list-item-option-fields">
          <label>
            Due date (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label>
            Memo (optional)
            <textarea
              maxLength={2000}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>
        </div>
      </details>
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
  edit: (item: ListItem, input: NewListItem) => void;
  reset: (item: ListItem) => void;
  promote: (item: ListItem, name: string) => void;
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
            onToggle={() => toggle(item)}
            onRemove={() => remove(item)}
            onEdit={(input) => edit(item, input)}
            {...(item.directoryItemId ? { onReset: () => reset(item) } : {})}
            onPromote={() => promote(item, effective.name)}
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
