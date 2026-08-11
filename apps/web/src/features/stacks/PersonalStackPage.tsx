import type { CategoryRecord, Project, Task, TaskInput, WorkReference } from '@naaseh/domain';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import { StackList } from './StackList.js';
import type { StackDisplayItem } from './StackRow.js';
import { StackScopePicker, type StackProjectOption } from './StackScopePicker.js';
import { TaskFilters } from '../search/TaskFilters.js';
import type { Filters } from '../../search/task-search.js';
import { TaskForm } from '../tasks/TaskForm.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';

export interface PersonalStackPageProps {
  scope: LocalStackScope;
  projects: readonly StackProjectOption[];
  projectRecords?: readonly Project[];
  categories?: readonly CategoryRecord[];
  assignees?: readonly AssigneeOption[];
  parentTasks?: readonly Task[];
  defaultAssigneeId?: string;
  items: readonly StackDisplayItem[];
  announcement: string;
  pendingOperationIds: readonly string[];
  conflictCount: number;
  lastSyncedAt?: string;
  changeScope: (scope: LocalStackScope) => void;
  move: (work: WorkReference, destinationPosition: number) => void | Promise<void>;
  reapplyConflicts?: () => void | Promise<void>;
  discardConflicts?: () => void | Promise<void>;
  filters?: Filters;
  changeFilters?: (filters: Filters) => void;
  createTask?: (task: TaskInput) => Promise<void>;
  readError?: 'invalid_cursor' | 'expired_cursor' | 'context_changed' | 'failed' | 'timeout';
  retryRead?: () => void;
  restartRead?: () => void;
}

export function formatStackSyncTime(
  value: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(value));
}

const readErrorCopy = {
  invalid_cursor: 'Invalid filtered stack cursor.',
  expired_cursor: 'The filtered stack cursor expired.',
  context_changed: 'The stack or access context changed; restart the filtered read.',
  failed: 'Unable to read the filtered stack.',
  timeout: 'The filtered stack read timed out.',
} as const;

export function PersonalStackPage({
  scope,
  projects,
  projectRecords = [],
  categories = [],
  assignees = [],
  parentTasks = [],
  defaultAssigneeId,
  items,
  announcement,
  pendingOperationIds,
  conflictCount,
  lastSyncedAt,
  changeScope,
  move,
  reapplyConflicts,
  discardConflicts,
  filters,
  changeFilters,
  createTask,
  readError,
  retryRead,
  restartRead,
}: PersonalStackPageProps) {
  const pendingCount = pendingOperationIds.length;
  return (
    <section className="personal-stack-page">
      <header className="personal-stack-header">
        <div>
          <p className="eyebrow">My priorities</p>
          <h1>Personal Stack</h1>
          <p>Order your active work independently of its priority.</p>
        </div>
        <StackScopePicker scope={scope} projects={projects} change={changeScope} />
      </header>

      {createTask ? (
        <details className="stack-task-composer">
          <summary>New task</summary>
          <TaskForm
            save={createTask}
            categories={categories}
            projects={projectRecords}
            assignees={assignees}
            parentTasks={parentTasks}
            {...(defaultAssigneeId ? { defaultAssigneeId } : {})}
            submitLabel="Add to stack"
          />
        </details>
      ) : null}

      {filters && changeFilters ? (
        <section className="filters" aria-label="Search and filters">
          <TaskFilters
            value={filters}
            change={changeFilters}
            resultCount={items.length}
            categories={categories}
            projects={projectRecords}
            assignees={assignees}
          />
        </section>
      ) : null}

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div className="stack-sync-state" role="status" aria-live="polite">
        {pendingCount > 0
          ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending synchronization`
          : conflictCount > 0
            ? `${conflictCount} stack change${conflictCount === 1 ? '' : 's'} need synchronization attention`
            : lastSyncedAt
              ? `Stack changes synced · Last sync ${formatStackSyncTime(lastSyncedAt)}`
              : 'No stack changes have been synced yet'}
      </div>

      {conflictCount > 0 ? (
        <div className="stack-conflict" role="alert">
          <p>
            {conflictCount} stack conflict{conflictCount === 1 ? '' : 's'} need your attention.
          </p>
          {reapplyConflicts ? (
            <button type="button" onClick={() => void reapplyConflicts()}>
              Reapply
            </button>
          ) : null}
          {discardConflicts ? (
            <button type="button" onClick={() => void discardConflicts()}>
              Discard
            </button>
          ) : null}
        </div>
      ) : null}

      {readError ? (
        <div role="alert">
          <p>{readErrorCopy[readError]}</p>
          {readError === 'failed' || readError === 'timeout' ? (
            retryRead ? (
              <button onClick={retryRead}>Retry filtered read</button>
            ) : null
          ) : restartRead ? (
            <button onClick={restartRead}>Restart filtered read</button>
          ) : null}
        </div>
      ) : null}

      <StackList items={items} scope={scope} move={move} />
    </section>
  );
}
