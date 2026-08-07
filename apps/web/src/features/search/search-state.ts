import type { Filters } from '../../search/task-search.js';
import { parseUrgencySet, serializeUrgencySet } from '@naaseh/domain';
const allowed = [
  'from',
  'to',
  'assigneeId',
  'categoryId',
  'projectId',
  'contentType',
  'lifecycle',
] as const;
export function safeSearchState(_query: string, filters: Filters) {
  const params = new URLSearchParams();
  for (const key of allowed) if (filters[key]) params.set(key, filters[key]);
  const urgencies = serializeUrgencySet(filters.urgencies);
  if (urgencies) params.set('urgencies', urgencies);
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
    projectId: params.get('projectId') ?? '',
    lifecycle:
      params.get('lifecycle') === 'archive'
        ? 'archive'
        : params.get('lifecycle') === 'all'
          ? 'all'
          : 'active',
    contentType:
      params.get('contentType') === 'lists'
        ? 'lists'
        : params.get('contentType') === 'todos'
          ? 'todos'
          : 'all',
    urgencies: parseUrgencySet(params.get('urgencies')),
  };
}
