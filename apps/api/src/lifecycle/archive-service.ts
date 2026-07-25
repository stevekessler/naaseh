import { canReadTaskAs, type ContentActor } from '@naaseh/domain';
import { authorizeList } from '../lists/list-authorization.js';
import { scanArchivedWork } from './archive-repository.js';

export interface ArchiveFilters {
  query?: string;
  categoryId?: string;
  projectId?: string;
}

export async function listAuthorizedArchive(actor: ContentActor, filters: ArchiveFilters = {}) {
  const archive = await scanArchivedWork();
  const query = filters.query?.normalize('NFKC').trim().toLocaleLowerCase();
  return {
    tasks: archive.tasks.filter(
      (task) =>
        canReadTaskAs(task, actor).allowed &&
        (!filters.categoryId || task.categoryId === filters.categoryId) &&
        (!filters.projectId || task.projectId === filters.projectId) &&
        (!query || task.label.toLocaleLowerCase().includes(query)),
    ),
    lists: archive.lists.filter(
      ({ list, items }) =>
        authorizeList(list, actor).allowed &&
        (!filters.projectId || list.projectId === filters.projectId) &&
        (!query ||
          list.name.toLocaleLowerCase().includes(query) ||
          items.some((item) => item.directorySnapshot.name.toLocaleLowerCase().includes(query))),
    ),
  };
}
