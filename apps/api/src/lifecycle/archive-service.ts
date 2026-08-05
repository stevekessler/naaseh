import {
  canReadTaskAs,
  matchesUrgencySet,
  zeroUrgencyCounts,
  type ContentActor,
  type Urgency,
} from '@naaseh/domain';
import { authorizeList } from '../lists/list-authorization.js';
import type { PaginationCursorCodec } from '../shared/persistent-pagination-cursor.js';
import { queryArchivedWork, queryArchivedWorkPage } from './archive-repository.js';

export interface ArchiveFilters {
  query?: string;
  categoryId?: string;
  projectId?: string;
  urgencies?: Urgency[];
  cursor?: string;
  limit?: number;
  accessEpoch?: number;
  cursorCodec?: PaginationCursorCodec;
}

export async function listAuthorizedArchive(actor: ContentActor, filters: ArchiveFilters = {}) {
  if (filters.cursorCodec) {
    const query = filters.query?.normalize('NFKC').trim().toLocaleLowerCase();
    const page = await queryArchivedWorkPage({
      actor,
      ...(filters.urgencies?.length ? { urgencies: filters.urgencies } : {}),
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
      limit: filters.limit ?? 50,
      accessEpoch: filters.accessEpoch ?? 0,
      cursorCodec: filters.cursorCodec,
      filters: {
        lifecycle: 'archived',
        contentType: 'all',
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.urgencies?.length ? { urgencies: filters.urgencies } : {}),
        ...(query ? { query } : {}),
      },
      accept: async (work, workType) => {
        if (filters.projectId && work.projectId !== filters.projectId) return false;
        if (workType === 'task') {
          const task = work as Extract<typeof work, { label: string }>;
          return (
            (!filters.categoryId || task.categoryId === filters.categoryId) &&
            (!query || task.label.toLocaleLowerCase().includes(query))
          );
        }
        if (filters.categoryId) return false;
        if (!query) return true;
        if ((work as { name: string }).name.toLocaleLowerCase().includes(query)) return true;
        const { listItemsForList } = await import('../lists/list-repository.js');
        return (await listItemsForList(work.id)).some((item) =>
          item.directorySnapshot.name.toLocaleLowerCase().includes(query),
        );
      },
    });
    const urgencyCounts = zeroUrgencyCounts();
    for (const task of page.tasks) urgencyCounts[task.urgency] += 1;
    for (const { list } of page.lists) urgencyCounts[list.urgency] += 1;
    return {
      tasks: page.tasks,
      lists: page.lists,
      urgencyCounts,
      nextCursor: page.nextCursor,
      asOf: page.asOf,
      rankSemantics: 'inactive_work_has_no_stack_rank' as const,
    };
  }
  const archive = await queryArchivedWork(actor, filters.urgencies);
  const query = filters.query?.normalize('NFKC').trim().toLocaleLowerCase();
  const tasks = archive.tasks.filter(
    (task) =>
      canReadTaskAs(task, actor).allowed &&
      matchesUrgencySet(task.urgency, filters.urgencies) &&
      (!filters.categoryId || task.categoryId === filters.categoryId) &&
      (!filters.projectId || task.projectId === filters.projectId) &&
      (!query || task.label.toLocaleLowerCase().includes(query)),
  );
  const lists = archive.lists.filter(
    ({ list, items }) =>
      authorizeList(list, actor).allowed &&
      matchesUrgencySet(list.urgency, filters.urgencies) &&
      (!filters.projectId || list.projectId === filters.projectId) &&
      (!query ||
        list.name.toLocaleLowerCase().includes(query) ||
        items.some((item) => item.directorySnapshot.name.toLocaleLowerCase().includes(query))),
  );
  const urgencyCounts = zeroUrgencyCounts();
  for (const task of tasks) urgencyCounts[task.urgency] += 1;
  for (const { list } of lists) urgencyCounts[list.urgency] += 1;
  return {
    tasks,
    lists,
    urgencyCounts,
    rankSemantics: 'inactive_work_has_no_stack_rank' as const,
  };
}
