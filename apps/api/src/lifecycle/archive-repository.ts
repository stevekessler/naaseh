import type { ContentActor, List, Urgency } from '@naaseh/domain';
import { listItemsForList } from '../lists/list-repository.js';
import {
  listProjectedWork,
  readProjectedWorkPage,
  type WorkViewReadContext,
} from '../reporting/work-view-repository.js';
import type { PaginationCursorCodec } from '../shared/persistent-pagination-cursor.js';

export interface ArchivedListResult {
  list: List;
  items: Awaited<ReturnType<typeof listItemsForList>>;
}

export async function queryArchivedWork(
  actor: ContentActor,
  urgencies?: readonly Urgency[],
): Promise<{
  tasks: Awaited<ReturnType<typeof listProjectedWork>>['tasks'];
  lists: ArchivedListResult[];
}> {
  const { tasks, lists } = await listProjectedWork({
    actor,
    lifecycle: 'archived',
    ...(urgencies?.length ? { urgencies } : {}),
  });
  return {
    tasks,
    lists: await Promise.all(
      lists.map(async (list) => ({ list, items: await listItemsForList(list.id) })),
    ),
  };
}

export const scanArchivedWork = queryArchivedWork;

export async function queryArchivedWorkPage(input: {
  actor: ContentActor;
  urgencies?: readonly Urgency[];
  cursor?: string;
  limit: number;
  accessEpoch: number;
  filters: WorkViewReadContext['filters'];
  cursorCodec: PaginationCursorCodec;
  accept?: Parameters<typeof readProjectedWorkPage>[0]['accept'];
}) {
  const page = await readProjectedWorkPage({
    actor: input.actor,
    lifecycle: 'archived',
    ...(input.urgencies?.length ? { urgencies: input.urgencies } : {}),
    endpoint: 'archive',
    orderBy: 'source',
    accessEpoch: input.accessEpoch,
    filters: input.filters,
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: input.limit,
    cursorCodec: input.cursorCodec,
    ...(input.accept ? { accept: input.accept } : {}),
  });
  const tasks = page.items.flatMap(({ work, workType }) =>
    workType === 'task' ? [work as Extract<typeof work, { label: string }>] : [],
  );
  const lists = await Promise.all(
    page.items.flatMap(({ work, workType }) =>
      workType === 'list'
        ? [
            (async () => ({
              list: work as List,
              items: await listItemsForList(work.id),
            }))(),
          ]
        : [],
    ),
  );
  return { ...page, tasks, lists };
}
