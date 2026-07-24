import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { effectiveDirectoryFields, type ListItem, type Task } from '@naaseh/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { listLocalTasks, saveNewTask, updateTask } from '../db/task-repository.js';
import { listCategories, listRevisions } from '../db/reminder-repository.js';
import { filterTasks, type Filters } from '../search/task-search.js';
import { Login } from '../features/auth/Login.js';
import { TaskForm } from '../features/tasks/TaskForm.js';
import { TaskListPage } from '../features/tasks/TaskListPage.js';
import { PostItBoard } from '../features/postit/PostItBoard.js';
import { SyncStatus } from '../features/sync/SyncStatus.js';
import { drainSequentially } from '../sync/sync-engine.js';
import { filtersFromSearch, safeSearchState } from '../features/search/search-state.js';
import { TaskSearchBar } from '../features/search/TaskSearchBar.js';
import { TaskFilters } from '../features/search/TaskFilters.js';
import { UpdatePrompt } from './UpdatePrompt.js';
import { safeToActivateUpdate } from './service-worker-update.js';
import { ViewSwitcher } from '../features/tasks/ViewSwitcher.js';
import { loadView, saveView } from '../db/preferences-repository.js';
import { listLocalGroups } from '../db/group-repository.js';
import { GroupPage } from '../features/groups/GroupPage.js';
import {
  createRemoteGroup,
  joinRemoteGroup,
  refreshGroups,
} from '../features/groups/group-client.js';
import { HiddenMemoTestHarness } from '../features/memos/HiddenMemoTestHarness.js';
import { UsersAdminPage, type AdminUser } from '../features/admin/UsersAdminPage.js';
import {
  changeAdminUserStatus,
  createAdminUser,
  listAdminUsers,
} from '../features/admin/admin-client.js';
import { ReminderSettings } from '../features/reminders/ReminderSettings.js';
import { ListPage } from '../features/lists/ListPage.js';
import {
  addLocalListItem,
  editLocalListItem,
  linkLocalListItemToDirectory,
  listLocalListItems,
  listLocalLists,
  reorderLocalListItems,
  resetLocalListItemOverrides,
  saveNewList,
  updateLocalList,
  updateLocalListItem,
} from '../db/list-repository.js';
import { listLocalDirectoryItems, saveDirectoryItem } from '../db/directory-repository.js';
import { CompletionSoundSetting } from '../features/tasks/CompletionSoundSetting.js';
import { SearchResults } from '../features/search/SearchResults.js';
import { navigate, parseAppRoute } from './router.js';

const emptyFilters: Filters = {
  query: '',
  assigneeId: '',
  categoryId: '',
  from: '',
  to: '',
  contentType: 'all',
};

export function App() {
  if (import.meta.env.MODE === 'test' && location.pathname === '/__test/hidden-memo')
    return <HiddenMemoTestHarness />;
  const [session, setSession] = useState<{
    userId: string;
    displayName: string;
    csrfToken: string;
    role: 'admin' | 'user';
  } | null>(() => {
    const value = sessionStorage.getItem('naaseh-session-view');
    return value ? JSON.parse(value) : null;
  });
  const [view, setView] = useState<'list' | 'postit'>('list');
  const initialRoute = parseAppRoute(location.pathname);
  const [section, setSection] = useState<'tasks' | 'lists' | 'groups' | 'admin'>(
    initialRoute.section,
  );
  const [selectedListId, setSelectedListId] = useState<string | undefined>(
    initialRoute.section === 'lists' ? initialRoute.listId : undefined,
  );
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearch(location.search));
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1],
  );
  const taskResult = useLiveQuery(() => listLocalTasks(), []);
  const tasks = taskResult ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const groups = useLiveQuery(() => listLocalGroups(), []) ?? [];
  const lists = useLiveQuery(() => listLocalLists(), []) ?? [];
  const directoryItems = useLiveQuery(() => listLocalDirectoryItems(), []) ?? [];
  const listItems =
    useLiveQuery(
      async () =>
        new Map(
          await Promise.all(
            lists.map(async (list) => [list.id, await listLocalListItems(list.id)] as const),
          ),
        ),
      [lists.map((list) => list.id).join(',')],
    ) ?? new Map<string, ListItem[]>();
  const revisions =
    useLiveQuery(
      () => (selectedId ? listRevisions(selectedId) : Promise.resolve([])),
      [selectedId],
    ) ?? [];
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const conflicts = useLiveQuery(() => db.secureConflicts.count(), []) ?? 0;
  const [syncError, setSyncError] = useState<string>();
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | undefined>();
  const syncing = useRef(false);
  const visible = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const matchingLists = useMemo(() => {
    if (filters.contentType === 'todos') return [];
    const query = filters.query.normalize('NFKC').trim().toLocaleLowerCase();
    if (!query) return filters.contentType === 'lists' ? lists : [];
    const directory = new Map(directoryItems.map((item) => [item.id, item]));
    return lists.filter(
      (list) =>
        list.name.toLocaleLowerCase().includes(query) ||
        (listItems.get(list.id) ?? []).some((item) =>
          effectiveDirectoryFields(
            {
              directorySnapshot: item.directorySnapshot,
              ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
              ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
            },
            item.directoryItemId ? directory.get(item.directoryItemId) : undefined,
          )
            .name.toLocaleLowerCase()
            .includes(query),
        ),
    );
  }, [filters.contentType, filters.query, lists, listItems, directoryItems]);
  useEffect(() => {
    void loadView().then(setView);
  }, []);
  useEffect(() => {
    if (section === 'groups' && session && navigator.onLine)
      void refreshGroups(session.csrfToken).catch((error) =>
        setSyncError(error instanceof Error ? error.message : 'Unable to refresh groups.'),
      );
  }, [section, session]);
  useEffect(() => {
    if (section === 'admin' && session?.role === 'admin')
      void listAdminUsers(session.csrfToken)
        .then(setAdminUsers)
        .catch(() => setSyncError('Administrative users could not be loaded.'));
  }, [section, session]);
  useEffect(() => {
    const query = safeSearchState(filters.query, filters);
    history.replaceState({}, '', `${location.pathname}${query ? `?${query}` : ''}`);
  }, [filters]);
  const synchronize = useCallback(async () => {
    if (!session || !navigator.onLine || syncing.current) return;
    syncing.current = true;
    setSyncError(undefined);
    try {
      await drainSequentially(session.csrfToken, (delay) => {
        window.setTimeout(() => void synchronize(), delay);
      });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Synchronization failed.');
    } finally {
      syncing.current = false;
    }
  }, [session]);

  useEffect(() => {
    const announce = () => (document.documentElement.dataset.online = String(navigator.onLine));
    announce();
    window.addEventListener('online', announce);
    window.addEventListener('offline', announce);
    return () => {
      window.removeEventListener('online', announce);
      window.removeEventListener('offline', announce);
    };
  }, []);

  useEffect(() => {
    if (pending > 0) void synchronize();
  }, [pending, synchronize]);
  useEffect(() => {
    // Browser automation and some WebKit builds dispatch `online` just before
    // navigator.onLine settles. Defer one turn so the guard sees the new state.
    const online = () => window.setTimeout(() => void synchronize(), 0);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [synchronize]);

  useEffect(() => {
    const syncRoute = () => {
      const route = parseAppRoute(location.pathname);
      setSection(route.section);
      setSelectedId(route.section === 'tasks' ? route.taskId : undefined);
      setSelectedListId(route.section === 'lists' ? route.listId : undefined);
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const ready = (event: Event) => {
      const detail = (event as CustomEvent<{ apply: () => void }>).detail;
      if (detail?.apply) setApplyUpdate(() => detail.apply);
    };
    window.addEventListener('naaseh:update-ready', ready);
    return () => window.removeEventListener('naaseh:update-ready', ready);
  }, []);

  if (!session)
    return (
      <Login
        onAuthenticated={(next) => {
          sessionStorage.setItem('naaseh-session-view', JSON.stringify(next));
          setSession(next);
        }}
      />
    );

  async function addTask(input: import('@naaseh/domain').TaskInput) {
    await saveNewTask(input, session!.userId);
  }
  async function toggle(task: Task) {
    await updateTask(
      task,
      { status: task.status === 'completed' ? 'open' : 'completed' },
      session!.userId,
    );
  }

  return (
    <div className="app-shell">
      <UpdatePrompt
        waiting={Boolean(applyUpdate)}
        apply={() =>
          void (async () => {
            if (await safeToActivateUpdate(false)) {
              applyUpdate?.();
              setApplyUpdate(undefined);
            } else setSyncError('The update is waiting until pending changes synchronize.');
          })()
        }
      />
      <header className="topbar">
        <img src="/naaseh_logo.png" alt="Na'aseh — We will do it" />
        <div className="topbar-actions">
          <div className="sync-state">
            <SyncStatus
              online={navigator.onLine}
              pending={pending}
              conflicts={conflicts}
              error={syncError}
              retry={() => void synchronize()}
            />
          </div>
          <nav aria-label="Main navigation">
            <button
              className="quiet"
              aria-current={section === 'lists' ? 'page' : undefined}
              onClick={() => navigate({ section: 'lists' })}
            >
              Lists
            </button>
            <button
              className="quiet"
              aria-current={section === 'tasks' ? 'page' : undefined}
              onClick={() => navigate({ section: 'tasks' })}
            >
              Tasks
            </button>
            <button
              className="quiet"
              aria-current={section === 'groups' ? 'page' : undefined}
              onClick={() => navigate({ section: 'groups' })}
            >
              Groups
            </button>
            {session.role === 'admin' && (
              <button
                className="quiet"
                aria-current={section === 'admin' ? 'page' : undefined}
                onClick={() => navigate({ section: 'admin' })}
              >
                Admin
              </button>
            )}
          </nav>
          <ReminderSettings csrfToken={session.csrfToken} />
          <CompletionSoundSetting />
          <button
            className="quiet"
            onClick={() => {
              sessionStorage.removeItem('naaseh-session-view');
              setSession(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main>
        {section === 'admin' ? (
          <UsersAdminPage
            users={adminUsers}
            currentUserId={session.userId}
            online={navigator.onLine}
            create={async (input) => {
              const created = await createAdminUser(input, session.csrfToken);
              setAdminUsers((users) => [
                ...users.filter((user) => user.id !== created.id),
                created,
              ]);
            }}
            toggle={async (userId, active) => {
              const updated = await changeAdminUserStatus(userId, active, session.csrfToken);
              setAdminUsers((users) => users.map((user) => (user.id === userId ? updated : user)));
            }}
          />
        ) : section === 'groups' ? (
          <GroupPage
            groups={groups}
            online={navigator.onLine}
            create={async (name, pin) => {
              await createRemoteGroup(name, pin, session.csrfToken);
            }}
            join={async (group, pin) => {
              await joinRemoteGroup(group, pin, session.csrfToken);
            }}
          />
        ) : section === 'lists' ? (
          <ListPage
            actorId={session.userId}
            csrfToken={session.csrfToken}
            lists={lists}
            items={listItems}
            {...(selectedListId ? { selectedId: selectedListId } : {})}
            openList={(list) => navigate({ section: 'lists', listId: list.id })}
            groups={groups.map((group) => ({ id: group.id, name: group.name }))}
            createList={async (name) => {
              await saveNewList(name, session.userId);
            }}
            addItem={async (listId, name) => {
              await addLocalListItem(listId, name, session.userId);
            }}
            addDirectoryItem={async (listId, item) => {
              await addLocalListItem(listId, item.name, session.userId, item);
            }}
            changeList={async (list, patch) => {
              await updateLocalList(list, patch);
            }}
            editItem={(item, name, amountMinor) => {
              void editLocalListItem(item, { name, amountMinor }, session.userId);
            }}
            resetItem={(item) => {
              void resetLocalListItemOverrides(item);
            }}
            promoteItem={(item, name, amountMinor) => {
              void saveDirectoryItem({ name, amountMinor }, session.userId).then((directory) =>
                linkLocalListItemToDirectory(item, directory, session.userId),
              );
            }}
            reorderItems={(ordered) => {
              void reorderLocalListItems(ordered);
            }}
            copyReady={() => {
              void synchronize();
            }}
            toggle={(item) => {
              void updateLocalListItem(
                item,
                { status: item.status === 'completed' ? 'open' : 'completed' },
                session.userId,
              );
            }}
            remove={(item) => {
              void updateLocalListItem(item, { status: 'removed' }, session.userId);
            }}
          />
        ) : (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow">My tasks</p>
                <h1>Ready when you are, {session.displayName}.</h1>
              </div>
              <ViewSwitcher
                view={view}
                change={(next) => {
                  setView(next);
                  void saveView(next);
                }}
              />
            </section>
            <TaskForm save={addTask} categories={categories} />
            <section className="filters" aria-label="Search and filters">
              <TaskSearchBar
                value={filters.query}
                setValue={(query) => setFilters({ ...filters, query })}
                count={visible.length + matchingLists.length}
              />
              <TaskFilters value={filters} change={setFilters} />
              {(filters.query ||
                filters.from ||
                filters.to ||
                filters.assigneeId ||
                filters.categoryId) && (
                <button className="quiet" onClick={() => setFilters(emptyFilters)}>
                  Clear filters
                </button>
              )}
            </section>
            <SearchResults
              lists={matchingLists}
              items={listItems}
              open={(list) => navigate({ section: 'lists', listId: list.id })}
            />
            {view === 'list' ? (
              <TaskListPage
                csrfToken={session.csrfToken}
                tasks={visible}
                loading={taskResult === undefined}
                selected={tasks.find((item) => item.id === selectedId)}
                revisions={revisions}
                onToggle={toggle}
                onSelect={(task) => {
                  history.pushState(
                    {},
                    '',
                    `/tasks/${encodeURIComponent(task.id)}${location.search}`,
                  );
                  setSelectedId(task.id);
                }}
                onClose={() => {
                  history.pushState({}, '', `/${location.search}`);
                  setSelectedId(undefined);
                }}
                onUpdate={async (task, patch) => {
                  await updateTask(task, patch, session.userId);
                }}
              />
            ) : (
              <PostItBoard tasks={visible} categories={categories} onToggle={toggle} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
