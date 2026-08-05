import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  effectiveDirectoryFields,
  matchesUrgencySet,
  workReferenceIdentity,
  type ListItem,
  type Task,
} from '@naaseh/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database.js';
import { listLocalTasks, saveNewTask, updateTask } from '../db/task-repository.js';
import { listCategories, listRevisions } from '../db/reminder-repository.js';
import { filterTasks, normalizeSearch, type Filters } from '../search/task-search.js';
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
import { listLocalArchive } from '../db/archive-repository.js';
import { ArchivePage } from '../features/archive/ArchivePage.js';
import { listLocalProjects } from '../db/project-repository.js';
import {
  changeLocalProjectLifecycle,
  saveNewLocalProject,
  updateLocalProject,
} from '../db/project-repository.js';
import {
  changeLocalCategoryLifecycle,
  saveNewLocalCategory,
  updateLocalCategory,
} from '../db/category-repository.js';
import { CategoriesAdminPage } from '../features/admin/CategoriesAdminPage.js';
import { ProjectTree } from '../features/projects/ProjectTree.js';
import { useWorkloadTree } from '../features/projects/useWorkloadTree.js';
import { listLocalCompletionEvents } from '../db/completion-event-repository.js';
import { CompletionDashboard } from '../features/reports/CompletionDashboard.js';
import { GoogleSyncPage } from '../features/google-sync/GoogleSyncPage.js';
import { purgePrivateStackStateForSession } from '../sync/privacy-purge.js';
import {
  initializeLocalStack,
  listLocalStackConflicts,
  listPendingStackOperations,
  readLocalStack,
  resolveLocalStackConflict,
  type LocalStackScope,
} from '../db/personal-stack-repository.js';
import { selectLocalStackItems } from '../features/stacks/stack-selectors.js';
import { queuePersonalStackReorder } from '../sync/sync-engine.js';
import { PersonalStackPage } from '../features/stacks/PersonalStackPage.js';

const emptyFilters: Filters = {
  query: '',
  assigneeId: '',
  categoryId: '',
  projectId: '',
  from: '',
  to: '',
  contentType: 'all',
  lifecycle: 'active',
  urgencies: [],
};

async function searchBasisHash(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
  const [section, setSection] = useState<
    | 'tasks'
    | 'lists'
    | 'groups'
    | 'archive'
    | 'projects'
    | 'dashboard'
    | 'stack'
    | 'google'
    | 'admin'
  >(initialRoute.section);
  const [stackScope, setStackScope] = useState<LocalStackScope>({ scopeType: 'overall' });
  const [stackAnnouncement, setStackAnnouncement] = useState('');
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
  const projects = useLiveQuery(() => listLocalProjects(), []) ?? [];
  const groups = useLiveQuery(() => listLocalGroups(), []) ?? [];
  const lists = useLiveQuery(() => listLocalLists(), []) ?? [];
  const archive =
    useLiveQuery(() => listLocalArchive('', filters.urgencies), [filters.urgencies]) ?? [];
  const completionEvents =
    useLiveQuery(
      () => (session ? listLocalCompletionEvents(session.userId) : Promise.resolve([])),
      [session?.userId],
    ) ?? [];
  const directoryItems = useLiveQuery(() => listLocalDirectoryItems(), []) ?? [];
  const workloadTree = useWorkloadTree(categories, projects, tasks, lists);
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
  const eligibleStackWork = useMemo(
    () => [
      ...tasks
        .filter(
          (task) =>
            task.status === 'open' &&
            (task.lifecycle ?? 'active') === 'active' &&
            task.completionState !== 'completed',
        )
        .map((task) => ({
          reference: {
            workType: 'task' as const,
            workId: task.id,
            membershipEpoch: task.createdAt,
          },
          label: task.label,
          urgency: task.urgency,
          ...(task.projectId ? { projectId: task.projectId } : {}),
          ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
          ...(task.categoryId ? { categoryId: task.categoryId } : {}),
          ...(task.dueAt ? { dueAt: task.dueAt } : {}),
          contentType: 'todos' as const,
        })),
      ...lists
        .filter((list) => list.status === 'active' && (list.lifecycle ?? 'active') === 'active')
        .map((list) => ({
          reference: {
            workType: 'list' as const,
            workId: list.id,
            membershipEpoch: list.createdAt,
          },
          label: list.name,
          urgency: list.urgency,
          ...(list.projectId ? { projectId: list.projectId } : {}),
          assigneeId: undefined,
          categoryId: undefined,
          dueAt: undefined,
          contentType: 'lists' as const,
        })),
    ],
    [tasks, lists],
  );
  const allRankedStackItems =
    useLiveQuery(
      () =>
        session
          ? selectLocalStackItems({
              ownerId: session.userId,
              eligibleWork: eligibleStackWork,
              scope: stackScope,
            })
          : Promise.resolve([]),
      [
        session?.userId,
        stackScope.scopeType,
        'scopeId' in stackScope ? stackScope.scopeId : '',
        eligibleStackWork,
      ],
    ) ?? [];
  const rankedStackItems = useMemo(
    () =>
      allRankedStackItems.filter(({ work }) =>
        Boolean(
          matchesUrgencySet(work.urgency, filters.urgencies) &&
            (!filters.query ||
              work.label.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())) &&
            (!filters.assigneeId || work.assigneeId === filters.assigneeId) &&
            (!filters.categoryId || work.categoryId === filters.categoryId) &&
            (!filters.projectId ||
              (filters.projectId === 'unassigned'
                ? !work.projectId
                : work.projectId === filters.projectId)) &&
            (!filters.from || Boolean(work.dueAt && work.dueAt >= filters.from)) &&
            (!filters.to || Boolean(work.dueAt && work.dueAt <= `${filters.to}T23:59:59.999Z`)) &&
            (filters.contentType === 'all' ||
              filters.contentType === undefined ||
              work.contentType === filters.contentType) &&
            filters.lifecycle !== 'archive',
        ),
      ),
    [allRankedStackItems, filters],
  );
  const pendingStackOperations =
    useLiveQuery(
      () => (session ? listPendingStackOperations(session.userId) : Promise.resolve([])),
      [session?.userId],
    ) ?? [];
  const stackConflicts =
    useLiveQuery(
      () => (session ? listLocalStackConflicts(session.userId) : Promise.resolve([])),
      [session?.userId],
    ) ?? [];
  const [syncError, setSyncError] = useState<string>();
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | undefined>();
  const syncing = useRef(false);
  const visible = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const matchingLists = useMemo(() => {
    if (filters.contentType === 'todos') return [];
    const query = filters.query.normalize('NFKC').trim().toLocaleLowerCase();
    const scopedLists = lists.filter(
      (list) =>
        list.lifecycle !== 'archived' &&
        matchesUrgencySet(list.urgency, filters.urgencies) &&
        (!filters.projectId ||
          (filters.projectId === 'unassigned'
            ? !list.projectId
            : list.projectId === filters.projectId)) &&
        !filters.assigneeId &&
        !filters.categoryId &&
        !filters.from &&
        !filters.to,
    );
    if (!query) return filters.contentType === 'lists' ? scopedLists : [];
    const directory = new Map(directoryItems.map((item) => [item.id, item]));
    return scopedLists.filter(
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
  }, [filters, lists, listItems, directoryItems]);
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
              aria-current={section === 'stack' ? 'page' : undefined}
              onClick={() => navigate({ section: 'stack' })}
            >
              Personal Stack
            </button>
            <button
              className="quiet"
              aria-current={section === 'google' ? 'page' : undefined}
              onClick={() => navigate({ section: 'google' })}
            >
              Google
            </button>
            <button
              className="quiet"
              aria-current={section === 'dashboard' ? 'page' : undefined}
              onClick={() => navigate({ section: 'dashboard' })}
            >
              Dashboard
            </button>
            <button
              className="quiet"
              aria-current={section === 'projects' ? 'page' : undefined}
              onClick={() => navigate({ section: 'projects' })}
            >
              Projects
            </button>
            <button
              className="quiet"
              aria-current={section === 'archive' ? 'page' : undefined}
              onClick={() => navigate({ section: 'archive' })}
            >
              Archive
            </button>
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
              void purgePrivateStackStateForSession(session.userId).finally(() => setSession(null));
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main>
        {section === 'stack' ? (
          <PersonalStackPage
            scope={stackScope}
            projects={projects
              .filter((project) => project.lifecycle === 'active')
              .map((project) => ({ id: project.id, name: project.name }))}
            items={rankedStackItems.map(({ work, rank }) => ({
              reference: work.reference,
              label: work.label,
              urgency: work.urgency,
              overallPosition: rank.overallPosition,
              ...(rank.projectPosition === undefined
                ? {}
                : { projectPosition: rank.projectPosition }),
            }))}
            announcement={stackAnnouncement}
            pendingOperationIds={pendingStackOperations.map((operation) => operation.operationId)}
            conflictCount={stackConflicts.length}
            filters={filters}
            changeFilters={setFilters}
            changeScope={setStackScope}
            move={async (work, destinationPosition) => {
              const displayed = rankedStackItems.map((item) => item.work.reference);
              const fullScope = allRankedStackItems.map((item) => item.work.reference);
              const currentPosition =
                displayed.findIndex(
                  (reference) => workReferenceIdentity(reference) === workReferenceIdentity(work),
                ) + 1;
              if (currentPosition < 1 || currentPosition === destinationPosition) return;
              const existing = await readLocalStack(session.userId, stackScope);
              const existingIdentities = new Set(existing?.work.map(workReferenceIdentity) ?? []);
              const needsReconciliation =
                !existing ||
                fullScope.length !== existing.work.length ||
                fullScope.some(
                  (reference) => !existingIdentities.has(workReferenceIdentity(reference)),
                );
              const current = needsReconciliation
                ? await initializeLocalStack({
                    ownerId: session.userId,
                    scope: stackScope,
                    version: existing?.version ?? 0,
                    work: fullScope,
                  })
                : existing;
              const isFiltered = displayed.length !== fullScope.length;
              const destinationIndex = Math.max(
                0,
                Math.min(displayed.length - 1, destinationPosition - 1),
              );
              const remaining = current.work.filter(
                (reference) => workReferenceIdentity(reference) !== workReferenceIdentity(work),
              );
              const fullDestinationIndex = Math.max(
                0,
                Math.min(remaining.length, destinationPosition - 1),
              );
              const beforeWork = remaining[fullDestinationIndex - 1];
              const afterWork = remaining[fullDestinationIndex];
              const queryHash = isFiltered ? await searchBasisHash(filters.query) : undefined;
              await queuePersonalStackReorder({
                ownerId: session.userId,
                scope: stackScope,
                baseVersion: current.version,
                move: isFiltered
                  ? {
                      kind: 'filtered_permutation',
                      movedWork: work,
                      destinationIndex,
                      affectedWork: displayed,
                      filterBasis: {
                        ...(filters.urgencies.length ? { urgencies: filters.urgencies } : {}),
                        ...(filters.from ? { from: filters.from } : {}),
                        ...(filters.to ? { to: filters.to } : {}),
                        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
                        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
                        ...(filters.projectId ? { projectId: filters.projectId } : {}),
                        lifecycle: 'active',
                        contentType: filters.contentType ?? 'all',
                        ...(queryHash ? { searchBasisHash: queryHash } : {}),
                      },
                    }
                  : {
                      kind: 'simple_move',
                      movedWork: work,
                      ...(beforeWork ? { beforeWork } : {}),
                      ...(afterWork ? { afterWork } : {}),
                    },
              });
              const moved = eligibleStackWork.find(
                (item) => workReferenceIdentity(item.reference) === workReferenceIdentity(work),
              );
              const scopeName =
                stackScope.scopeType === 'overall'
                  ? 'Overall stack'
                  : `${projects.find((project) => project.id === stackScope.scopeId)?.name ?? 'Project'} Project stack`;
              setStackAnnouncement(
                `Moved ${moved?.label ?? 'work'} to position ${destinationPosition} of ${displayed.length} in ${scopeName}.`,
              );
            }}
            reapplyConflicts={async () => {
              for (const conflict of stackConflicts)
                await resolveLocalStackConflict(conflict.id, 'reapply');
            }}
            discardConflicts={async () => {
              for (const conflict of stackConflicts)
                await resolveLocalStackConflict(conflict.id, 'discard');
            }}
          />
        ) : section === 'google' ? (
          <GoogleSyncPage csrfToken={session.csrfToken} />
        ) : section === 'admin' ? (
          <>
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
                setAdminUsers((users) =>
                  users.map((user) => (user.id === userId ? updated : user)),
                );
              }}
            />
            <CategoriesAdminPage
              categories={categories}
              projects={projects}
              createCategory={(value) => void saveNewLocalCategory(value)}
              updateCategory={(category, patch) => void updateLocalCategory(category, patch)}
              createProject={(value) => void saveNewLocalProject(value)}
              updateProject={(project, patch) => void updateLocalProject(project, patch)}
              actorId={session.userId}
              csrfToken={session.csrfToken}
              changeCategoryLifecycle={(category, action, actorId) =>
                void changeLocalCategoryLifecycle(category, action, actorId)
              }
              changeProjectLifecycle={(project, action, actorId) =>
                void changeLocalProjectLifecycle(project, action, actorId)
              }
            />
          </>
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
        ) : section === 'projects' ? (
          <ProjectTree tree={workloadTree} />
        ) : section === 'dashboard' ? (
          <CompletionDashboard
            events={completionEvents}
            categories={categories}
            projects={projects}
            pending={pending}
          />
        ) : section === 'archive' ? (
          <ArchivePage
            entries={archive}
            csrfToken={session.csrfToken}
            filters={filters}
            changeFilters={setFilters}
            restore={async (entry) => {
              if (entry.task) await updateTask(entry.task, { status: 'open' }, session.userId);
              if (entry.list)
                await updateLocalList(entry.list, { status: 'active', lifecycle: 'active' });
            }}
          />
        ) : section === 'lists' ? (
          <ListPage
            actorId={session.userId}
            csrfToken={session.csrfToken}
            lists={lists.filter((list) => list.lifecycle !== 'archived')}
            items={listItems}
            {...(selectedListId ? { selectedId: selectedListId } : {})}
            openList={(list) => navigate({ section: 'lists', listId: list.id })}
            groups={groups.map((group) => ({ id: group.id, name: group.name }))}
            categories={categories}
            projects={projects}
            createList={async (name, projectId, urgency) => {
              await saveNewList(name, session.userId, projectId, urgency);
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
            <TaskForm save={addTask} categories={categories} projects={projects} />
            <section className="filters" aria-label="Search and filters">
              <TaskSearchBar
                value={filters.query}
                setValue={(query) => setFilters({ ...filters, query })}
                count={visible.length + matchingLists.length}
              />
              <TaskFilters
                value={filters}
                change={setFilters}
                resultCount={visible.length + matchingLists.length}
              />
              {(filters.query ||
                filters.from ||
                filters.to ||
                filters.assigneeId ||
                filters.categoryId ||
                filters.projectId) && (
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
                categories={categories}
                projects={projects}
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
