import type { Filters } from '../../search/task-search.js';
const allowed = ['from', 'to', 'assigneeId', 'categoryId', 'contentType'] as const;
export function safeSearchState(_query: string, filters: Filters) {
  const params = new URLSearchParams();
  for (const key of allowed) if (filters[key]) params.set(key, filters[key]);
  return params.toString();
}
export function filtersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  return {
    query: '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    assigneeId: params.get('assigneeId') ?? '',
    categoryId: params.get('categoryId') ?? '',
    contentType:
      params.get('contentType') === 'lists'
        ? 'lists'
        : params.get('contentType') === 'todos'
          ? 'todos'
          : 'all',
  };
}
