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

export interface CombinedSearchRow {
  id: string;
  kind: 'task' | 'listItem';
  title: string;
  listId?: string;
  listName?: string;
  categoryName?: string;
  projectName?: string;
  memo?: string;
  dueAt?: string;
  dueDate?: string;
  urgency: Urgency;
  status: string;
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
}: {
  query: string;
  tasks: readonly Task[];
  lists: readonly List[];
  items: ReadonlyMap<string, readonly ListItem[]>;
  directory: readonly GlobalDirectoryItem[];
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
}): CombinedSearchRow[] {
  const normalized = searchable(query.trim());
  if (!normalized) return [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projectRecords = new Map(projects.map((project) => [project.id, project]));
  const directoryRecords = new Map(directory.map((item) => [item.id, item]));
  const matches = (values: Array<string | undefined>) =>
    values.some((value) => value && searchable(value).includes(normalized));

  const taskRows = tasks
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
      matches([row.title, row.memo, row.categoryName, row.projectName, urgencyLabels[row.urgency]]),
    );

  const listRows = lists
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
            urgencyLabels[row.urgency],
          ]),
        );
    });

  return [...taskRows, ...listRows].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }),
  );
}
