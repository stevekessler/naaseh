import {
  matchesUrgencySet,
  type List,
  type ListItem,
  type Task,
  type Urgency,
} from '@naaseh/domain';
import { db } from './database.js';
import { listLocalListItems, listLocalLists } from './list-repository.js';
import { listLocalTasks } from './task-repository.js';

export interface LocalArchiveEntry {
  kind: 'task' | 'list';
  task?: Task;
  list?: List;
  items?: ListItem[];
  pending: boolean;
  conflicted: boolean;
}

export async function listLocalArchive(
  query = '',
  urgencies: readonly Urgency[] = [],
): Promise<LocalArchiveEntry[]> {
  const [tasks, lists, mutations, conflicts] = await Promise.all([
    listLocalTasks(),
    listLocalLists(),
    db.outbox.toArray(),
    db.secureConflicts.toArray(),
  ]);
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  const pending = new Set(mutations.map((item) => item.entityId));
  const conflicted = new Set(conflicts.map((item) => item.taskId ?? item.id));
  const taskEntries: LocalArchiveEntry[] = tasks
    .filter(
      (task) =>
        task.lifecycle === 'archived' &&
        matchesUrgencySet(task.urgency, urgencies) &&
        (!normalized ||
          task.label.toLocaleLowerCase().includes(normalized) ||
          (!task.memoHidden && task.memo.toLocaleLowerCase().includes(normalized))),
    )
    .map((task) => ({
      kind: 'task',
      task,
      pending: pending.has(task.id),
      conflicted: conflicted.has(task.id),
    }));
  const listEntries = await Promise.all(
    lists
      .filter((list) => list.lifecycle === 'archived' && matchesUrgencySet(list.urgency, urgencies))
      .map(async (list): Promise<LocalArchiveEntry | undefined> => {
        const items = await listLocalListItems(list.id);
        if (
          normalized &&
          !list.name.toLocaleLowerCase().includes(normalized) &&
          !items.some((item) =>
            item.directorySnapshot.name.toLocaleLowerCase().includes(normalized),
          )
        )
          return undefined;
        return {
          kind: 'list',
          list,
          items,
          pending: pending.has(list.id),
          conflicted: conflicted.has(list.id),
        };
      }),
  );
  return [...taskEntries, ...listEntries.filter((entry) => entry !== undefined)].sort((a, b) => {
    const aDate = a.task?.archivedAt ?? a.list?.archivedAt ?? '';
    const bDate = b.task?.archivedAt ?? b.list?.archivedAt ?? '';
    return bDate.localeCompare(aDate);
  });
}
