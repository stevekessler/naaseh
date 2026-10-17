import { useMemo, useRef, useState, type FormEvent } from 'react';
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
  const [link, setLink] = useState('');
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
        ...(link ? { fileLinks: [link] } : {}),
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
      setLink('');
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
          <label>
            Link (optional)
            <input
              type="url"
              inputMode="url"
              pattern="https://.*"
              title="Use an HTTPS link."
              placeholder="https://example.com"
              value={link}
              onChange={(event) => setLink(event.target.value)}
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
  move,
  csrfToken,
  directory,
  destinationLists,
  editable = true,
}: {
  items: ListItem[];
  toggle: (item: ListItem) => void;
  remove: (item: ListItem) => void;
  edit: (item: ListItem, input: NewListItem) => void;
  reset: (item: ListItem) => void;
  promote: (item: ListItem, name: string) => void;
  reorder: (items: ListItem[]) => void;
  move: (item: ListItem, destinationListId: string) => void;
  csrfToken: string;
  directory: GlobalDirectoryItem[];
  destinationLists: { id: string; name: string }[];
  editable?: boolean;
}) {
  const lastDragTarget = useRef<string | undefined>(undefined);
  const columns = useListColumns();
  const [query, setQuery] = useState('');
  const effectiveItems = useMemo(
    () =>
      items.map((item) => {
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
        return { item, name: effective.name };
      }),
    [directory, items],
  );
  const visibleItems = filterListItems(effectiveItems, query);
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
    const sourceIndex = visibleItems.findIndex(({ item }) => item.id === sourceId);
    const targetIndex = visibleItems.findIndex(({ item }) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const orderedVisible = visibleItems.map(({ item }) => item);
    const ordered = [...orderedVisible];
    const [selected] = ordered.splice(sourceIndex, 1);
    if (!selected) return;
    ordered.splice(targetIndex, 0, selected);
    if (visibleItems.length === items.length) reorder(ordered);
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
        <label className="list-filter-field">
          <span>Search list items</span>
          <input
            type="search"
            value={query}
            placeholder="Search item names and memos"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="list-item-count" role="status">
          {query.trim() ? `${visibleItems.length} of ` : ''}
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
              {columns.visible.has('fileLinks') && <th scope="col">Link</th>}
              {columns.visible.has('actions') && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(({ item, name }, index) => {
              return (
                <SortableListItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  group={`list-items:${item.listId}`}
                  name={name}
                  visibleColumns={columns.visible}
                  editable={editable}
                  onToggle={() => toggle(item)}
                  onRemove={() => remove(item)}
                  onEdit={(input) => edit(item, input)}
                  {...(item.directoryItemId ? { onReset: () => reset(item) } : {})}
                  onPromote={() => promote(item, name)}
                  destinationLists={destinationLists.filter((list) => list.id !== item.listId)}
                  onMove={(destinationListId) => move(item, destinationListId)}
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
        {!visibleItems.length && (
          <p className="list-filter-empty">No items match “{query.trim()}”.</p>
        )}
      </div>
    </DragDropProvider>
  );
}

export function filterListItems(items: readonly { item: ListItem; name: string }[], query: string) {
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  if (!normalized) return [...items];
  return items.filter(({ item, name }) =>
    [name, item.memo ?? '', ...(item.fileLinks ?? [])].some((value) =>
      value.normalize('NFKC').toLocaleLowerCase().includes(normalized),
    ),
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
