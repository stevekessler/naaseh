import { useState } from 'react';
import {
  effectiveDirectoryFields,
  type GlobalDirectoryItem,
  type List,
  type ListItem,
} from '@naaseh/domain';
import { ListIndexPage } from './ListIndexPage.js';
import { ListForm } from './ListForm.js';
import { ListItems } from './ListItems.js';
import { GlobalDirectory } from './GlobalDirectory.js';
import { ListTotal } from './ListTotal.js';
import { ListVisibilityControl } from './ListVisibilityControl.js';
import { CopyListAction } from './CopyListAction.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { listLocalDirectoryItems } from '../../db/directory-repository.js';
import { PermanentDeleteDialog } from '../archive/PermanentDeleteDialog.js';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UrgencyField } from '../../components/UrgencyField.js';
export function ListPage({
  lists,
  items,
  createList,
  addItem,
  toggle,
  remove,
  actorId,
  addDirectoryItem,
  csrfToken,
  changeList,
  groups,
  editItem,
  resetItem,
  promoteItem,
  reorderItems,
  copyReady,
  selectedId,
  openList,
  categories,
  projects,
}: {
  lists: List[];
  items: Map<string, ListItem[]>;
  createList: (
    name: string,
    projectId?: string,
    urgency?: import('@naaseh/domain').Urgency,
  ) => Promise<void>;
  addItem: (listId: string, name: string) => Promise<void>;
  toggle: (item: ListItem) => void;
  remove: (item: ListItem) => void;
  actorId: string;
  addDirectoryItem: (listId: string, item: GlobalDirectoryItem) => Promise<void>;
  csrfToken: string;
  changeList: (list: List, patch: Partial<List>) => Promise<void>;
  groups: { id: string; name: string }[];
  editItem: (item: ListItem, name: string, amountMinor: number | null) => void;
  resetItem: (item: ListItem) => void;
  promoteItem: (item: ListItem, name: string, amountMinor: number | null) => void;
  reorderItems: (items: ListItem[]) => void;
  copyReady: (id: string) => void;
  selectedId?: string;
  openList: (list: List) => void;
  categories: import('@naaseh/domain').CategoryRecord[];
  projects: import('@naaseh/domain').Project[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const directory = useLiveQuery(() => listLocalDirectoryItems(), []) ?? [];
  return (
    <section>
      <header className="welcome">
        <div>
          <p className="eyebrow">My lists</p>
          <h1>Lists</h1>
        </div>
      </header>
      <ListForm save={createList} categories={categories} projects={projects} />
      <ListIndexPage lists={lists} {...(selectedId ? { selectedId } : {})} open={openList} />
      <GlobalDirectory actorId={actorId} lists={lists} addToList={addDirectoryItem} />
      {lists.length === 0 ? (
        <p>No lists yet. Create one above.</p>
      ) : (
        lists
          .filter((list) => !selectedId || list.id === selectedId)
          .map((list) => (
            <article className="named-list" key={list.id}>
              <h2>{list.name}</h2>
              <UrgencyBadge urgency={list.urgency} />
              <UrgencyField
                value={list.urgency}
                onChange={(urgency) => void changeList(list, { urgency })}
              />
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  const name = prompt('List name', list.name)?.trim();
                  if (name && name !== list.name) void changeList(list, { name });
                }}
              >
                Rename list
              </button>
              <PermanentDeleteDialog
                target={{ resourceType: 'list', resourceId: list.id, version: list.version }}
                label={list.name}
                csrfToken={csrfToken}
                disabled={list.lifecycle === 'deleting'}
              />
              <ListVisibilityControl
                list={list}
                groups={groups}
                change={(patch) => void changeList(list, patch)}
              />
              <CopyListAction listId={list.id} csrfToken={csrfToken} ready={copyReady} />
              <button
                type="button"
                onClick={() =>
                  void changeList(list, {
                    status: 'archived',
                    lifecycle: 'archived',
                    archiveReason: 'finished',
                  })
                }
              >
                Finish and archive list
              </button>
              <form
                className="list-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = drafts[list.id]?.trim();
                  if (name)
                    void addItem(list.id, name).then(() => setDrafts({ ...drafts, [list.id]: '' }));
                }}
              >
                <label>
                  Add an item
                  <input
                    value={drafts[list.id] ?? ''}
                    onChange={(event) => setDrafts({ ...drafts, [list.id]: event.target.value })}
                  />
                </label>
                <button>Add item</button>
              </form>
              <ListItems
                items={items.get(list.id) ?? []}
                toggle={toggle}
                remove={remove}
                edit={editItem}
                reset={resetItem}
                promote={promoteItem}
                reorder={reorderItems}
                csrfToken={csrfToken}
                directory={directory}
              />
              <ListTotal
                values={(items.get(list.id) ?? []).map(
                  (item) =>
                    effectiveDirectoryFields(
                      {
                        directorySnapshot: item.directorySnapshot,
                        ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
                        ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
                      },
                      item.directoryItemId
                        ? directory.find((entry) => entry.id === item.directoryItemId)
                        : undefined,
                    ).amountMinor,
                )}
              />
            </article>
          ))
      )}
    </section>
  );
}
