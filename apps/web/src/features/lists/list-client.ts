import type { List } from '@naaseh/domain';
import { listLocalLists } from '../../db/list-repository.js';
import { navigate } from '../../app/router.js';

export class ListRouteNotFoundError extends Error {
  constructor() {
    super('List not found.');
    this.name = 'ListRouteNotFoundError';
  }
}

export async function loadAuthorizedLocalList(id: string): Promise<List> {
  const list = (await listLocalLists()).find(
    (candidate) => candidate.id === id && candidate.status === 'active',
  );
  if (!list) throw new ListRouteNotFoundError();
  return list;
}

export const openList = (id: string) => navigate({ section: 'lists', listId: id });
export const openLists = () => navigate({ section: 'lists' });
