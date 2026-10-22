import {
  memoDocumentText,
  plainMemoDocument,
  type ListItem,
  type MemoDocument,
} from '@naaseh/domain';
import { useEffect, useState } from 'react';
import { Fragment } from 'react';
import { useCompletionFeedback } from '../tasks/useCompletionFeedback.js';
import type { NewListItem } from './ListItems.js';
import { formatCalendarDate } from '../tasks/due-value.js';
import { CompactLink } from '../../components/CompactLink.js';
import { MemoEditor } from '../memos/MemoEditor.js';
import { LinkifiedText, MemoDocumentView } from '../memos/MemoDocumentView.js';
import type { ListColumnId } from './ListColumnSettings.js';
export function ListItemRow({
  item,
  name,
  visibleColumns,
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
  destinationLists,
  onMove,
  editable = true,
  reorderable = true,
}: {
  item: ListItem;
  name: string;
  visibleColumns: ReadonlySet<ListColumnId>;
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
  destinationLists: { id: string; name: string }[];
  onMove: (destinationListId: string) => void;
  editable?: boolean;
  reorderable?: boolean;
}) {
  const done = item.status === 'completed';
  const feedback = useCompletionFeedback();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDueDate, setDraftDueDate] = useState(item.dueDate ?? '');
  const [draftLink, setDraftLink] = useState(item.fileLinks?.[0] ?? '');
  const [draftMemoDocument, setDraftMemoDocument] = useState<MemoDocument>(
    item.memoDocument ?? plainMemoDocument(item.memo ?? ''),
  );
  const [editorError, setEditorError] = useState('');
  const [destinationListId, setDestinationListId] = useState('');
  useEffect(() => {
    if (editing) return;
    setDraftName(name);
    setDraftDueDate(item.dueDate ?? '');
    setDraftLink(item.fileLinks?.[0] ?? '');
    setDraftMemoDocument(item.memoDocument ?? plainMemoDocument(item.memo ?? ''));
  }, [editing, item.dueDate, item.fileLinks, item.memo, item.memoDocument, name]);
  const toggleEditor = () => {
    if (!editing) {
      setDraftName(name);
      setDraftDueDate(item.dueDate ?? '');
      setDraftLink(item.fileLinks?.[0] ?? '');
      setDraftMemoDocument(item.memoDocument ?? plainMemoDocument(item.memo ?? ''));
      setEditorError('');
    }
    setEditing((open) => !open);
  };
  return (
    <Fragment>
      <tr
        ref={rowRef}
        className={`list-item ${done ? 'completed' : ''}${dragging ? ' list-item--dragging' : ''}${dropTarget ? ' list-item--drop-target' : ''}`}
      >
        <td className="list-item-status-cell">
          {editable ? (
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
          ) : (
            <span aria-label={done ? 'Completed' : 'Open'}>{done ? '✓' : '○'}</span>
          )}
        </td>
        <th className="list-item-name-cell" scope="row">
          {editable ? (
            <button
              type="button"
              className="quiet list-item-title-button completion-label"
              aria-expanded={editing}
              onClick={toggleEditor}
            >
              {name}
            </button>
          ) : (
            <span className="completion-label">{name}</span>
          )}
        </th>
        {visibleColumns.has('due') && (
          <td className="list-item-due-cell" data-label="Due">
            {item.dueDate ? formatCalendarDate(item.dueDate) : <span aria-hidden="true">—</span>}
          </td>
        )}
        {visibleColumns.has('memo') && (
          <td className="list-item-memo-cell" data-label="Memo">
            {item.memoDocument ? (
              <MemoDocumentView document={item.memoDocument} />
            ) : item.memo ? (
              <p>
                <LinkifiedText text={item.memo} />
              </p>
            ) : (
              <span aria-hidden="true">—</span>
            )}
          </td>
        )}
        {visibleColumns.has('fileLinks') && (
          <td className="list-item-file-links-cell" data-label="Link">
            {item.fileLinks?.[0] ? (
              <CompactLink href={item.fileLinks[0]} />
            ) : (
              <span aria-hidden="true">—</span>
            )}
          </td>
        )}
        {editable && visibleColumns.has('actions') && (
          <td className="list-item-actions" aria-label={`Actions for ${name}`}>
            <div className="list-item-action-buttons">
              {handleRef && reorderable ? (
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
              <button className="quiet" type="button" onClick={toggleEditor}>
                {editing ? 'Close editor' : 'Edit'}
              </button>
              <button className="quiet" aria-label={`Archive ${name}`} onClick={onRemove}>
                Archive
              </button>
            </div>
            <span className="visually-hidden" role="status" aria-live="polite">
              {feedback.announcement}
            </span>
          </td>
        )}
      </tr>
      {editing && (
        <tr className="list-item-expanded-row">
          <td colSpan={2 + visibleColumns.size}>
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
              <div className="list-item-memo-editor">
                <span>Memo</span>
                <MemoEditor value={draftMemoDocument} onChange={setDraftMemoDocument} />
              </div>
              <label className="list-item-link-editor">
                Link
                <input
                  type="url"
                  inputMode="url"
                  pattern="https://.*"
                  title="Use an HTTPS link."
                  placeholder="https://example.com"
                  value={draftLink}
                  onChange={(event) => setDraftLink(event.target.value)}
                />
              </label>
              {destinationLists.length > 0 && (
                <div className="list-item-move-control">
                  <label>
                    Move to list
                    <select
                      value={destinationListId}
                      onChange={(event) => setDestinationListId(event.target.value)}
                    >
                      <option value="">Choose a list</option>
                      {destinationLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!destinationListId}
                    onClick={() => {
                      if (!destinationListId) return;
                      onMove(destinationListId);
                      setEditing(false);
                    }}
                  >
                    Move item
                  </button>
                </div>
              )}
              {attachments}
              <div className="list-item-save-actions">
                <button
                  className="list-item-save"
                  type="button"
                  disabled={!draftName.trim()}
                  onClick={() => {
                    const memo = memoDocumentText(draftMemoDocument);
                    if (memo.length > 2000) {
                      setEditorError('List item memos cannot exceed 2,000 characters.');
                      return;
                    }
                    setEditorError('');
                    onEdit({
                      name: draftName.trim(),
                      ...(draftDueDate ? { dueDate: draftDueDate } : {}),
                      ...(memo ? { memo, memoDocument: draftMemoDocument } : {}),
                      ...(draftLink ? { fileLinks: [draftLink] } : {}),
                    });
                    setEditing(false);
                  }}
                >
                  Save item
                </button>
                {!item.directoryItemId && (
                  <button className="quiet" type="button" onClick={onPromote}>
                    Add to directory
                  </button>
                )}
              </div>
              {editorError && <p role="alert">{editorError}</p>}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
