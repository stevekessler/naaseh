import type { Filters } from '../../search/task-search.js';
import { parseUrgencySet, serializeUrgencySet } from '@naaseh/domain';
import type { DatePreset } from '../../search/task-filters.js';

export interface FinanceSearchPreferences {
  includeTasks: boolean;
  includeLists: boolean;
  includeTransactions: boolean;
  includeMerchants: boolean;
  accountId: 'all' | string;
}

export const defaultFinanceSearchPreferences: FinanceSearchPreferences = {
  includeTasks: true,
  includeLists: true,
  includeTransactions: false,
  includeMerchants: false,
  accountId: 'all',
};

const financePreferenceStorageKey = 'naaseh.combined-search-finance.v1';

const boundedAccountId = (value: string | null) =>
  value && /^[A-Za-z0-9:_-]{1,128}$/u.test(value) ? value : 'all';

/** Search text is deliberately excluded so protected queries never enter history or storage. */
export function financeSearchPreferencesFromSearch(search: string): FinanceSearchPreferences {
  const params = new URLSearchParams(search);
  return {
    includeTasks: params.get('tasks') !== '0',
    includeLists: params.get('lists') !== '0',
    includeTransactions: params.get('transactions') === '1',
    includeMerchants: params.get('merchants') === '1',
    accountId: boundedAccountId(params.get('financeAccount')),
  };
}

export function safeFinanceSearchState(preferences: FinanceSearchPreferences) {
  const params = new URLSearchParams();
  if (!preferences.includeTasks) params.set('tasks', '0');
  if (!preferences.includeLists) params.set('lists', '0');
  if (preferences.includeTransactions) params.set('transactions', '1');
  if (preferences.includeMerchants) params.set('merchants', '1');
  if (preferences.includeTransactions && preferences.accountId !== 'all') {
    const accountId = boundedAccountId(preferences.accountId);
    if (accountId !== 'all') params.set('financeAccount', accountId);
  }
  return params;
}

export function readFinanceSearchPreferences(): FinanceSearchPreferences {
  const fromUrl = financeSearchPreferencesFromSearch(globalThis.location?.search ?? '');
  if (globalThis.location?.search) return fromUrl;
  try {
    const stored = JSON.parse(
      localStorage.getItem(financePreferenceStorageKey) ?? 'null',
    ) as unknown;
    if (stored && typeof stored === 'object') {
      const value = stored as Partial<FinanceSearchPreferences>;
      return {
        includeTasks: value.includeTasks !== false,
        includeLists: value.includeLists !== false,
        includeTransactions: value.includeTransactions === true,
        includeMerchants: value.includeMerchants === true,
        accountId: boundedAccountId(typeof value.accountId === 'string' ? value.accountId : null),
      };
    }
  } catch {
    // Defaults remain safe when device-local preferences are unavailable or malformed.
  }
  return fromUrl;
}

export function persistFinanceSearchPreferences(preferences: FinanceSearchPreferences) {
  try {
    localStorage.setItem(financePreferenceStorageKey, JSON.stringify(preferences));
  } catch {
    // The selection still applies for this visit.
  }
}

export function clearFinanceSearchPreferences() {
  try {
    localStorage.removeItem(financePreferenceStorageKey);
  } catch {
    // Memory state is cleared independently.
  }
}
const allowed = [
  'from',
  'to',
  'assigneeId',
  'assigneeIds',
  'groupIds',
  'match',
  'scope',
  'categoryId',
  'projectId',
  'parentId',
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
  'quarter',
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
    assigneeIds: (params.get('assigneeIds') ?? params.get('assigneeId') ?? '')
      .split(',')
      .filter(Boolean),
    groupIds: (params.get('groupIds') ?? '').split(',').filter(Boolean),
    match: params.get('match') === 'any' ? 'any' : 'all',
    scope: params.get('scope') === 'all' ? 'all' : 'default',
    categoryId: params.get('categoryId') ?? '',
    projectId: params.get('projectId') ?? '',
    parentId: params.get('parentId') ?? '',
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
