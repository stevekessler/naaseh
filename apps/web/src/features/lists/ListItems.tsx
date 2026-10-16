import { useRef, useState, type FormEvent } from 'react';
import { DragDropProvider, KeyboardSensor, PointerSensor, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import {
  effectiveDirectoryFields,
  memoDocumentText,
  plainMemoDocument,
  type GlobalDirectoryItem,
  type ListItem,
  type MemoDocument,
} from '@naaseh/domain';
import { ListItemRow } from './ListItemRow.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';
import { MemoEditor } from '../memos/MemoEditor.js';
import { ListColumnSettings, useListColumns } from './ListColumnSettings.js';

export type NewListItem = {
  name: string;
  dueDate?: string;
  memo?: string;
  memoDocument?: MemoDocument;
  fileLinks?: string[];
};

export const parseInitialListItem = (name: string): NewListItem => ({ name: name.trim() });

export function ListItemCreateForm({ add }: { add: (input: NewListItem) => Promise<void> }) {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [memoDocument, setMemoDocument] = useState(() => plainMemoDocument(''));
  const [memoEditorKey, setMemoEditorKey] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;
    let input: NewListItem;
    try {
      const memo = memoDocumentText(memoDocument);
      if (memo.length > 2000) throw new Error('List item memos cannot exceed 2,000 characters.');
      input = {
        ...parseInitialListItem(name),
        ...(dueDate ? { dueDate } : {}),
        ...(memo ? { memo, memoDocument } : {}),
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
      setMemoDocument(plainMemoDocument(''));
      setMemoEditorKey((value) => value + 1);
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
          <div className="list-item-memo-editor">
            <span>Memo (optional)</span>
            <MemoEditor key={memoEditorKey} value={memoDocument} onChange={setMemoDocument} />
          </div>
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
  const lastDragTarget = useRef<string | undefined>(undefined);
  const columns = useListColumns();
  if (!items.length)
    return (
      <div className="list-empty-state">
        <p className="list-item-count">0 items</p>
        <p>No items yet.</p>
      </div>
    );
  const finishDrag = (event: DragEndEvent) => {
    if (event.canceled || !event.operation.source || !event.operation.target) return;
    const sourceId = String(event.operation.source.id);
    const targetId = lastDragTarget.current ?? String(event.operation.target.id);
    lastDragTarget.current = undefined;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const ordered = [...items];
    const [selected] = ordered.splice(sourceIndex, 1);
    if (!selected) return;
    ordered.splice(targetIndex, 0, selected);
    reorder(ordered);
  };
  return (
    <DragDropProvider
      sensors={[PointerSensor, KeyboardSensor]}
      onDragStart={() => {
        lastDragTarget.current = undefined;
      }}
      onDragOver={(event) => {
        const sourceId = event.operation.source?.id;
        const targetId = event.operation.target?.id;
        if (targetId !== undefined && targetId !== sourceId)
          lastDragTarget.current = String(targetId);
      }}
      onDragEnd={finishDrag}
    >
      <div className="list-table-tools">
        <p className="list-item-count">
          {items.length} item{items.length === 1 ? '' : 's'}
        </p>
        <ListColumnSettings {...columns} />
      </div>
      <div className="task-table-wrap list-item-table-wrap">
        <p id="list-item-drag-instructions" className="visually-hidden">
          Drag to reorder. With a keyboard, press Space on the handle, use the arrow keys, then
          press Space again to drop.
        </p>
        <table className="task-list list-item-table" aria-label="List items">
          <thead>
            <tr>
              <th scope="col" aria-label="Status" />
              <th scope="col">Item</th>
              {columns.visible.has('due') && <th scope="col">Due</th>}
              {columns.visible.has('memo') && <th scope="col">Memo</th>}
              {columns.visible.has('fileLinks') && <th scope="col">Saved links</th>}
              {columns.visible.has('actions') && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
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
              return (
                <SortableListItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  group={`list-items:${item.listId}`}
                  name={effective.name}
                  visibleColumns={columns.visible}
                  onToggle={() => toggle(item)}
                  onRemove={() => remove(item)}
                  onEdit={(input) => edit(item, input)}
                  {...(item.directoryItemId ? { onReset: () => reset(item) } : {})}
                  onPromote={() => promote(item, effective.name)}
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
          </tbody>
        </table>
      </div>
    </DragDropProvider>
  );
}

function SortableListItemRow({
  index,
  group,
  ...props
}: Parameters<typeof ListItemRow>[0] & { index: number; group: string }) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: props.item.id,
    index,
    group,
    type: 'list-item-row',
  });
  return (
    <ListItemRow
      {...props}
      rowRef={ref}
      handleRef={handleRef}
      dragging={isDragging}
      dropTarget={isDropTarget}
    />
  );
}
