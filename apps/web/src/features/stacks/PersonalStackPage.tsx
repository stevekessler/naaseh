import type { WorkReference } from '@naaseh/domain';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import { StackList } from './StackList.js';
import type { StackDisplayItem } from './StackRow.js';
import { StackScopePicker, type StackProjectOption } from './StackScopePicker.js';
import { TaskFilters } from '../search/TaskFilters.js';
import type { Filters } from '../../search/task-search.js';

export interface PersonalStackPageProps {
  scope: LocalStackScope;
  projects: readonly StackProjectOption[];
  items: readonly StackDisplayItem[];
  announcement: string;
  pendingOperationIds: readonly string[];
  conflictCount: number;
  changeScope: (scope: LocalStackScope) => void;
  move: (work: WorkReference, destinationPosition: number) => void | Promise<void>;
  reapplyConflicts?: () => void | Promise<void>;
  discardConflicts?: () => void | Promise<void>;
  filters?: Filters;
  changeFilters?: (filters: Filters) => void;
}

export function PersonalStackPage({
  scope,
  projects,
  items,
  announcement,
  pendingOperationIds,
  conflictCount,
  changeScope,
  move,
  reapplyConflicts,
  discardConflicts,
  filters,
  changeFilters,
}: PersonalStackPageProps) {
  const pendingCount = pendingOperationIds.length;
  return (
    <section className="personal-stack-page">
      <header className="personal-stack-header">
        <div>
          <p className="eyebrow">My priorities</p>
          <h1>Personal Stack</h1>
          <p>Order your active work independently of its urgency.</p>
        </div>
        <StackScopePicker scope={scope} projects={projects} change={changeScope} />
      </header>

      {filters && changeFilters ? (
        <section className="filters" aria-label="Search and filters">
          <TaskFilters value={filters} change={changeFilters} resultCount={items.length} />
        </section>
      ) : null}

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div className="stack-sync-state" aria-live="polite">
        {pendingCount > 0
          ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending synchronization`
          : 'Stack changes synced'}
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

      <StackList items={items} scope={scope} move={move} />
    </section>
  );
}
