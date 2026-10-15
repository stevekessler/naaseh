import type { ListItem } from '@naaseh/domain';
import { useEffect, useState } from 'react';
import { Fragment } from 'react';
import { useCompletionFeedback } from '../tasks/useCompletionFeedback.js';
import type { NewListItem } from './ListItems.js';
import { parseFileLinks } from './file-links.js';
import { formatCalendarDate } from '../tasks/due-value.js';
import { CompactLink } from '../../components/CompactLink.js';
export function ListItemRow({
  item,
  name,
  onToggle,
  onRemove,
  onEdit,
  onReset,
  onPromote,
  attachments,
  rowRef,
  handleRef,
  dragging = false,
  dropTarget = false,
}: {
  item: ListItem;
  name: string;
  onToggle: () => void;
  onRemove: () => void;
  onEdit: (input: NewListItem) => void;
  onReset?: () => void;
  onPromote: () => void;
  attachments?: import('react').ReactNode;
  rowRef?: (element: Element | null) => void;
  handleRef?: (element: Element | null) => void;
  dragging?: boolean;
  dropTarget?: boolean;
}) {
  const done = item.status === 'completed';
  const feedback = useCompletionFeedback();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDueDate, setDraftDueDate] = useState(item.dueDate ?? '');
  const [draftMemo, setDraftMemo] = useState(item.memo ?? '');
  const [draftFileLinks, setDraftFileLinks] = useState((item.fileLinks ?? []).join('\n'));
  const [editorError, setEditorError] = useState('');
  useEffect(() => setDraftName(name), [name]);
  return (
    <Fragment>
      <tr
        ref={rowRef}
        className={`list-item ${done ? 'completed' : ''}${dragging ? ' list-item--dragging' : ''}${dropTarget ? ' list-item--drop-target' : ''}`}
      >
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
        <td className="list-item-file-links-cell">
          {item.fileLinks?.length ? (
            <ul className="list-item-file-links">
              {item.fileLinks.map((link) => (
                <li key={link}>
                  <CompactLink href={link} />
                </li>
              ))}
            </ul>
          ) : (
            <span aria-hidden="true">—</span>
          )}
        </td>
        <td className="list-item-actions" aria-label={`Actions for ${name}`}>
          {handleRef ? (
            <button
              ref={handleRef}
              className="stack-drag-handle"
              type="button"
              aria-label={`Drag ${name}`}
              aria-describedby="list-item-drag-instructions"
            >
              <span aria-hidden="true">⋮⋮</span>
            </button>
          ) : null}
          <button className="quiet" type="button" onClick={() => setEditing((open) => !open)}>
            {editing ? 'Close editor' : 'Edit'}
          </button>
          {!item.directoryItemId && (
            <button className="quiet" type="button" onClick={onPromote}>
              Add to global directory
            </button>
          )}
          <button className="quiet" aria-label={`Archive ${name}`} onClick={onRemove}>
            Archive
          </button>
          <span className="visually-hidden" role="status" aria-live="polite">
            {feedback.announcement}
          </span>
        </td>
      </tr>
      {editing && (
        <tr className="list-item-expanded-row">
          <td colSpan={6}>
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
              <label>
                File links (one HTTPS link per line)
                <textarea
                  value={draftFileLinks}
                  onChange={(event) => setDraftFileLinks(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!draftName.trim()}
                onClick={() => {
                  let fileLinks: string[];
                  try {
                    fileLinks = parseFileLinks(draftFileLinks);
                  } catch (cause) {
                    setEditorError(
                      cause instanceof Error ? cause.message : 'Enter valid HTTPS file links.',
                    );
                    return;
                  }
                  setEditorError('');
                  onEdit({
                    name: draftName.trim(),
                    ...(draftDueDate ? { dueDate: draftDueDate } : {}),
                    ...(draftMemo.trim() ? { memo: draftMemo.trim() } : {}),
                    fileLinks,
                  });
                  setEditing(false);
                }}
              >
                Save item
              </button>
              {editorError && <p role="alert">{editorError}</p>}
              {attachments}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
