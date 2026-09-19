import type { ListItem } from '@naaseh/domain';
import { useEffect, useState } from 'react';
import { useCompletionFeedback } from '../tasks/useCompletionFeedback.js';
import { ListItemValueEditor } from './ListItemValueEditor.js';
import type { NewListItem } from './ListItems.js';
export function ListItemRow({
  item,
  name,
  value,
  onToggle,
  onRemove,
  onEdit,
  onReset,
  onPromote,
  moveUp,
  moveDown,
  attachments,
}: {
  item: ListItem;
  name: string;
  value?: string;
  onToggle: () => void;
  onRemove: () => void;
  onEdit: (input: NewListItem) => void;
  onReset?: () => void;
  onPromote: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
  attachments?: import('react').ReactNode;
}) {
  const done = item.status === 'completed';
  const feedback = useCompletionFeedback();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDueDate, setDraftDueDate] = useState(item.dueDate ?? '');
  const [draftMemo, setDraftMemo] = useState(item.memo ?? '');
  const [draftAmount, setDraftAmount] = useState<number | null>(
    item.valueOverride?.kind === 'amount'
      ? item.valueOverride.amountMinor
      : item.valueOverride?.kind === 'none'
        ? null
        : item.directorySnapshot.amountMinor,
  );
  useEffect(() => setDraftName(name), [name]);
  return (
    <li className={`list-item ${done ? 'completed' : ''}`}>
      <div className="list-item-summary">
        <button
          className="check"
          aria-label={`${done ? 'Reopen' : 'Complete'} ${name}`}
          onClick={() => {
            feedback.complete(name, !done);
            onToggle();
          }}
        >
          {done ? '✓' : ''}
        </button>
        <span className="completion-label">{name}</span>
        {value && <output>{value}</output>}
      </div>
      {(item.dueDate || item.memo) && (
        <div className="list-item-details">
          {item.dueDate && <small>Due {item.dueDate}</small>}
          {item.memo && <p>{item.memo}</p>}
        </div>
      )}
      <div className="list-item-actions" aria-label={`Actions for ${name}`}>
        <button
          className="quiet"
          type="button"
          disabled={!moveUp}
          onClick={moveUp}
          aria-label={`Move ${name} up`}
        >
          ↑
        </button>
        <button
          className="quiet"
          type="button"
          disabled={!moveDown}
          onClick={moveDown}
          aria-label={`Move ${name} down`}
        >
          ↓
        </button>
        <button className="quiet" type="button" onClick={() => setEditing((open) => !open)}>
          {editing ? 'Close editor' : 'Edit'}
        </button>
        {!item.directoryItemId && (
          <button className="quiet" type="button" onClick={onPromote}>
            Add to global directory
          </button>
        )}
        <button className="quiet" aria-label={`Remove ${name}`} onClick={onRemove}>
          Remove
        </button>
      </div>
      {editing && (
        <div className="list-item-editor">
          <label>
            Item name
            <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </label>
          <ListItemValueEditor
            value={draftAmount}
            save={setDraftAmount}
            {...(onReset ? { reset: onReset } : {})}
          />
          <label>
            Due date
            <input
              type="date"
              value={draftDueDate}
              onChange={(event) => setDraftDueDate(event.target.value)}
            />
          </label>
          <label>
            Memo
            <textarea
              maxLength={2000}
              value={draftMemo}
              onChange={(event) => setDraftMemo(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!draftName.trim()}
            onClick={() => {
              onEdit({
                name: draftName.trim(),
                amountMinor: draftAmount,
                ...(draftDueDate ? { dueDate: draftDueDate } : {}),
                ...(draftMemo.trim() ? { memo: draftMemo.trim() } : {}),
              });
              setEditing(false);
            }}
          >
            Save item
          </button>
        </div>
      )}
      <span className="visually-hidden" role="status" aria-live="polite">
        {feedback.announcement}
      </span>
      {attachments}
    </li>
  );
}
