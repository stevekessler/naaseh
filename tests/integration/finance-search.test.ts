import { describe, expect, it, vi } from 'vitest';
import {
  FinanceSearchIndex,
  type FinanceSearchSource,
} from '../../apps/web/src/search/finance-index.js';
import {
  financeSearchPreferencesFromSearch,
  safeFinanceSearchState,
} from '../../apps/web/src/features/search/search-state.js';
import { buildCombinedSearchRows } from '../../apps/web/src/features/search/combined-search.js';

const source: FinanceSearchSource = {
  accounts: [
    { id: 'account-a', friendlyName: 'Household checking' },
    { id: 'account-b', friendlyName: 'Private savings' },
  ],
  transactions: [
    {
      id: 'transaction-a',
      accountId: 'account-a',
      description: 'Juniper Market',
      effectiveAt: '2026-10-20T12:00:00.000Z',
      amountMinor: -1299,
      currency: 'USD',
    },
    { id: 'transaction-b', accountId: 'account-b', description: 'Juniper Hardware' },
    { id: 'transaction-inaccessible', accountId: 'account-secret', description: 'Juniper Secret' },
  ],
  merchants: [{ id: 'merchant-a', name: 'Juniper Coffee', city: 'Denver', region: 'CO' }],
};

describe('Finance-aware combined search', () => {
  it('keeps tasks and lists on while Finance types default off', () => {
    expect(financeSearchPreferencesFromSearch('')).toEqual({
      includeTasks: true,
      includeLists: true,
      includeTransactions: false,
      includeMerchants: false,
      accountId: 'all',
    });
  });

  it('round-trips only safe toggle and account state without search text', () => {
    const params = safeFinanceSearchState({
      includeTasks: false,
      includeLists: true,
      includeTransactions: true,
      includeMerchants: true,
      accountId: 'account-a',
    });
    expect(params.toString()).toBe('tasks=0&transactions=1&merchants=1&financeAccount=account-a');
    expect(params.has('query')).toBe(false);
    expect(financeSearchPreferencesFromSearch(params.toString())).toMatchObject({
      includeTasks: false,
      includeLists: true,
      includeTransactions: true,
      includeMerchants: true,
      accountId: 'account-a',
    });
  });

  it('indexes incrementally and filters transactions by authorized and selected accounts', async () => {
    const index = new FinanceSearchIndex();
    const onProgress = vi.fn();
    await index.replaceProgressively(source, {
      batchSize: 1,
      onProgress,
      yieldToMain: async () => undefined,
    });
    expect(onProgress).toHaveBeenLastCalledWith({ indexed: 3, total: 3, complete: true });
    expect(
      index.search('juniper', {
        includeTransactions: true,
        includeMerchants: false,
        accountId: 'account-a',
      }),
    ).toEqual([
      expect.objectContaining({ id: 'transaction-a', accountName: 'Household checking' }),
    ]);
    expect(index.search('secret', { includeTransactions: true, includeMerchants: true })).toEqual(
      [],
    );
    expect(
      index.upsertTransaction({
        id: 'incremental',
        accountId: 'account-a',
        description: 'Juniper pharmacy',
      }),
    ).toBe(true);
    expect(
      index.upsertTransaction({
        id: 'rejected',
        accountId: 'account-secret',
        description: 'Juniper private',
      }),
    ).toBe(false);
    expect(
      index.search('pharmacy', { includeTransactions: true, includeMerchants: false }),
    ).toEqual([expect.objectContaining({ id: 'incremental' })]);
  });

  it('adds global merchant identities without activity aggregates or relationship signals', async () => {
    const index = new FinanceSearchIndex();
    await index.replaceProgressively(source, { yieldToMain: async () => undefined });
    const [merchant] = index.search('coffee', {
      includeTransactions: false,
      includeMerchants: true,
    });
    expect(merchant).toEqual({
      id: 'merchant-a',
      kind: 'merchant',
      title: 'Juniper Coffee',
      city: 'Denver',
      region: 'CO',
    });
    expect(merchant).not.toHaveProperty('transactionCount');
    expect(merchant).not.toHaveProperty('hasActivity');
  });

  it('mixes only enabled Finance rows into ordinary results', async () => {
    const index = new FinanceSearchIndex();
    await index.replaceProgressively(source, { yieldToMain: async () => undefined });
    const financeHits = index.search('juniper', {
      includeTransactions: true,
      includeMerchants: true,
    });
    const rows = buildCombinedSearchRows({
      query: 'juniper',
      tasks: [],
      lists: [],
      items: new Map(),
      directory: [],
      categories: [],
      projects: [],
      financeHits,
      preferences: {
        includeTasks: true,
        includeLists: true,
        includeTransactions: true,
        includeMerchants: true,
        accountId: 'all',
      },
    });
    expect(rows.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      'merchant:merchant-a',
      'transaction:transaction-b',
      'transaction:transaction-a',
    ]);
  });
});
