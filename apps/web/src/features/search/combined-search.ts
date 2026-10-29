import {
  effectiveDirectoryFields,
  urgencyLabels,
  type CategoryRecord,
  type GlobalDirectoryItem,
  type List,
  type ListItem,
  type Project,
  type Task,
  type Urgency,
} from '@naaseh/domain';
import type { FinanceSearchHit } from '../../search/finance-index.js';
import type { FinanceSearchPreferences } from './search-state.js';

export interface CombinedSearchRow {
  id: string;
  kind: 'task' | 'listItem' | 'transaction' | 'merchant';
  title: string;
  listId?: string;
  listName?: string;
  categoryName?: string;
  projectName?: string;
  memo?: string;
  dueAt?: string;
  dueDate?: string;
  urgency?: Urgency;
  status: string;
  accountName?: string;
  location?: string;
  amountLabel?: string;
}

const combinedSearchKinds = new Set<CombinedSearchRow['kind']>([
  'task',
  'listItem',
  'transaction',
  'merchant',
]);

/**
 * Keep the general search boundary deliberately narrower than the application's
 * full set of content types. In particular, Journal records must remain inside
 * the unlocked Journal experience and must never become /search results.
 */
export function isCombinedSearchKind(value: unknown): value is CombinedSearchRow['kind'] {
  const kind = value;
  return typeof kind === 'string' && combinedSearchKinds.has(kind as CombinedSearchRow['kind']);
}

const searchable = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

export function buildCombinedSearchRows({
  query,
  tasks,
  lists,
  items,
  directory,
  categories,
  projects,
  preferences = {
    includeTasks: true,
    includeLists: true,
    includeTransactions: false,
    includeMerchants: false,
    accountId: 'all',
  },
  financeHits = [],
}: {
  query: string;
  tasks: readonly Task[];
  lists: readonly List[];
  items: ReadonlyMap<string, readonly ListItem[]>;
  directory: readonly GlobalDirectoryItem[];
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  preferences?: FinanceSearchPreferences;
  financeHits?: readonly FinanceSearchHit[];
}): CombinedSearchRow[] {
  const normalized = searchable(query.trim());
  if (!normalized) return [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projectRecords = new Map(projects.map((project) => [project.id, project]));
  const directoryRecords = new Map(directory.map((item) => [item.id, item]));
  const matches = (values: Array<string | undefined>) =>
    values.some((value) => value && searchable(value).includes(normalized));

  const taskRows = preferences.includeTasks
    ? tasks
        .filter(
          (task) =>
            (task.lifecycle ?? (task.status === 'archived' ? 'archived' : 'active')) === 'active',
        )
        .map((task): CombinedSearchRow => {
          const project = task.projectId ? projectRecords.get(task.projectId) : undefined;
          const categoryName = task.categoryId
            ? categoryNames.get(task.categoryId)
            : project?.categoryId
              ? categoryNames.get(project.categoryId)
              : undefined;
          return {
            id: task.id,
            kind: 'task',
            title: task.label,
            ...(categoryName ? { categoryName } : {}),
            ...(project ? { projectName: project.name } : {}),
            ...(task.memo && !task.memoHidden ? { memo: task.memo } : {}),
            ...(task.dueAt ? { dueAt: task.dueAt } : {}),
            ...(task.dueDate ? { dueDate: task.dueDate } : {}),
            urgency: task.urgency,
            status: task.status === 'completed' ? 'Completed' : 'Open',
          };
        })
        .filter((row) =>
          matches([
            row.title,
            row.memo,
            row.categoryName,
            row.projectName,
            row.urgency ? urgencyLabels[row.urgency] : undefined,
          ]),
        )
    : [];

  const listRows = preferences.includeLists
    ? lists
        .filter((list) => (list.lifecycle ?? list.status) === 'active')
        .flatMap((list) => {
          const project = list.projectId ? projectRecords.get(list.projectId) : undefined;
          const categoryName = list.categoryId
            ? categoryNames.get(list.categoryId)
            : project?.categoryId
              ? categoryNames.get(project.categoryId)
              : undefined;
          return (items.get(list.id) ?? [])
            .filter((item) => item.status !== 'removed')
            .map((item): CombinedSearchRow => {
              const effective = effectiveDirectoryFields(
                {
                  directorySnapshot: item.directorySnapshot,
                  ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
                  ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
                },
                item.directoryItemId ? directoryRecords.get(item.directoryItemId) : undefined,
              );
              return {
                id: item.id,
                kind: 'listItem',
                title: effective.name,
                listId: list.id,
                listName: list.name,
                ...(categoryName ? { categoryName } : {}),
                ...(project ? { projectName: project.name } : {}),
                ...(item.memo ? { memo: item.memo } : {}),
                ...(item.dueDate ? { dueDate: item.dueDate } : {}),
                urgency: list.urgency,
                status: item.status === 'completed' ? 'Completed' : 'Open',
              };
            })
            .filter((row) =>
              matches([
                row.title,
                row.listName,
                row.memo,
                row.categoryName,
                row.projectName,
                row.urgency ? urgencyLabels[row.urgency] : undefined,
              ]),
            );
        })
    : [];

  const financeRows = financeHits
    .filter((hit) =>
      hit.kind === 'transaction' ? preferences.includeTransactions : preferences.includeMerchants,
    )
    .map((hit): CombinedSearchRow => {
      if (hit.kind === 'merchant') {
        return {
          id: hit.id,
          kind: 'merchant',
          title: hit.title,
          ...([hit.city, hit.region].filter(Boolean).join(', ')
            ? { location: [hit.city, hit.region].filter(Boolean).join(', ') }
            : {}),
          status: 'Active',
        };
      }
      const amountLabel =
        hit.amountMinor === undefined || !hit.currency
          ? undefined
          : new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: hit.currency,
            }).format(hit.amountMinor / 10 ** (hit.currencyExponent ?? 2));
      return {
        id: hit.id,
        kind: 'transaction',
        title: hit.title,
        accountName: hit.accountName,
        ...(hit.memo ? { memo: hit.memo } : {}),
        ...(hit.effectiveAt ? { dueAt: hit.effectiveAt } : {}),
        ...(amountLabel ? { amountLabel } : {}),
        status: hit.pending ? 'Pending' : 'Posted',
      };
    });

  return [...taskRows, ...listRows, ...financeRows]
    .filter((row) => isCombinedSearchKind(row.kind))
    .sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }),
    );
}
