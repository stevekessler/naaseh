import type { List, ListItem } from '@naaseh/domain';
import { ListIndexPage } from './ListIndexPage.js';
import { ListForm } from './ListForm.js';
import { ListItemCreateForm, ListItems, type NewListItem } from './ListItems.js';
import { ListVisibilityControl } from './ListVisibilityControl.js';
import { CopyListAction } from './CopyListAction.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { listLocalDirectoryItems } from '../../db/directory-repository.js';
import { PermanentDeleteDialog } from '../archive/PermanentDeleteDialog.js';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UrgencyField } from '../../components/UrgencyField.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import type { LocalListPatch } from '../../db/list-repository.js';
export function ListPage({
  lists,
  items,
  createList,
  addItem,
  toggle,
  remove,
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
    categoryId?: string,
  ) => Promise<void>;
  addItem: (listId: string, input: NewListItem) => Promise<void>;
  toggle: (item: ListItem) => void;
  remove: (item: ListItem) => void;
  csrfToken: string;
  changeList: (list: List, patch: LocalListPatch) => Promise<void>;
  groups: { id: string; name: string }[];
  editItem: (item: ListItem, input: NewListItem) => void;
  resetItem: (item: ListItem) => void;
  promoteItem: (item: ListItem, name: string) => void;
  reorderItems: (items: ListItem[]) => void;
  copyReady: (id: string) => void;
  selectedId?: string;
  openList: (list: List) => void;
  categories: import('@naaseh/domain').CategoryRecord[];
  projects: import('@naaseh/domain').Project[];
}) {
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
      {lists.length === 0 ? (
        <p>No lists yet. Create one above.</p>
      ) : (
        lists
          .filter((list) => !selectedId || list.id === selectedId)
          .map((list) => (
            <article className="named-list" key={list.id}>
              <header className="named-list-header">
                <p className="eyebrow">List</p>
                <h2>{list.name}</h2>
              </header>
              <div className="list-settings">
                <UrgencyBadge urgency={list.urgency} />
                <UrgencyField
                  value={list.urgency}
                  label="Priority"
                  onChange={(urgency) => void changeList(list, { urgency })}
                />
                <label>
                  Category
                  <CategoryPicker
                    categories={categories}
                    value={list.categoryId ?? ''}
                    onChange={(categoryId) =>
                      void changeList(list, {
                        categoryId: categoryId || null,
                        ...(list.projectId &&
                        projects.find((project) => project.id === list.projectId)?.categoryId !==
                          categoryId
                          ? { projectId: null }
                          : {}),
                      })
                    }
                  />
                </label>
                <ProjectPicker
                  categories={categories}
                  projects={projects}
                  value={list.projectId ?? ''}
                  {...(list.categoryId ? { categoryId: list.categoryId } : {})}
                  onChange={(projectId) => {
                    const categoryId = projects.find(
                      (project) => project.id === projectId,
                    )?.categoryId;
                    void changeList(list, {
                      projectId: projectId || null,
                      ...(categoryId ? { categoryId } : {}),
                    });
                  }}
                />
              </div>
              <details className="list-management">
                <summary>List settings</summary>
                <div className="list-management-fields">
                  <form
                    className="list-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = String(new FormData(event.currentTarget).get('listName')).trim();
                      if (name && name !== list.name) void changeList(list, { name });
                    }}
                  >
                    <label>
                      List name
                      <input name="listName" defaultValue={list.name} maxLength={300} required />
                    </label>
                    <button type="submit">Save name</button>
                  </form>
                  <ListVisibilityControl
                    list={list}
                    groups={groups}
                    change={(patch) => void changeList(list, patch)}
                  />
                </div>
              </details>
              <div className="list-actions" aria-label="List actions">
                <PermanentDeleteDialog
                  target={{ resourceType: 'list', resourceId: list.id, version: list.version }}
                  label={list.name}
                  csrfToken={csrfToken}
                  disabled={list.lifecycle === 'deleting'}
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
              </div>
              <ListItemCreateForm add={(input) => addItem(list.id, input)} />
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
            </article>
          ))
      )}
    </section>
  );
}
