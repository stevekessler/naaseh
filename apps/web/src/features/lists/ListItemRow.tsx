import type { ListItem } from '@naaseh/domain';
import { useEffect, useState } from 'react';
import { Fragment } from 'react';
import { useCompletionFeedback } from '../tasks/useCompletionFeedback.js';
import type { NewListItem } from './ListItems.js';
import { formatCalendarDate } from '../tasks/due-value.js';
export function ListItemRow({
  item,
  name,
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
  useEffect(() => setDraftName(name), [name]);
  return (
    <Fragment>
      <tr className={`list-item ${done ? 'completed' : ''}`}>
        <td className="list-item-status-cell">
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
        </td>
        <th className="list-item-name-cell" scope="row">
          <span className="completion-label">{name}</span>
        </th>
        <td className="list-item-due-cell">
          {item.dueDate ? formatCalendarDate(item.dueDate) : <span aria-hidden="true">—</span>}
        </td>
        <td className="list-item-memo-cell">
          {item.memo ? <p>{item.memo}</p> : <span aria-hidden="true">—</span>}
        </td>
        <td className="list-item-actions" aria-label={`Actions for ${name}`}>
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
        </td>
      </tr>
      {editing && (
        <tr className="list-item-expanded-row">
          <td colSpan={5}>
            <div className="list-item-editor">
              <label>
                Item name
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              {onReset && (
                <button type="button" className="quiet" onClick={onReset}>
                  Reset to global item name
                </button>
              )}
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
                    ...(draftDueDate ? { dueDate: draftDueDate } : {}),
                    ...(draftMemo.trim() ? { memo: draftMemo.trim() } : {}),
                  });
                  setEditing(false);
                }}
              >
                Save item
              </button>
            </div>
          </td>
        </tr>
      )}
      {(feedback.announcement || attachments) && (
        <tr className="list-item-expanded-row">
          <td colSpan={5}>
            <span className="visually-hidden" role="status" aria-live="polite">
              {feedback.announcement}
            </span>
            {attachments}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
