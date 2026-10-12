import type { Filters } from '../../search/task-search.js';
import { parseUrgencySet, serializeUrgencySet } from '@naaseh/domain';
import type { DatePreset } from '../../search/task-filters.js';
const allowed = [
  'from',
  'to',
  'assigneeId',
  'categoryId',
  'projectId',
  'contentType',
  'lifecycle',
  'progress',
  'datePresets',
] as const;
const datePresets: readonly DatePreset[] = [
  'today',
  'tomorrow',
  'week',
  'nextWeek',
  'nextNextWeek',
  'month',
];
export function safeSearchState(_query: string, filters: Filters) {
  const params = new URLSearchParams();
  for (const key of allowed) {
    const current = filters[key];
    if (Array.isArray(current)) {
      if (current.length) params.set(key, current.join(','));
    } else if (current) params.set(key, current);
  }
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
    progress:
      params.get('progress') === 'not-started' ||
      params.get('progress') === 'in-progress' ||
      params.get('progress') === 'complete'
        ? (params.get('progress') as 'not-started' | 'in-progress' | 'complete')
        : 'all',
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
    datePresets: (params.get('datePresets') ?? '')
      .split(',')
      .filter((preset): preset is DatePreset => datePresets.includes(preset as DatePreset)),
  };
}
