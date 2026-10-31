// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinanceSearchIndex,
  registerFinanceSearchIndex,
} from '../../apps/web/src/search/finance-index.js';
import { purgeRevokedFinanceAudience } from '../../apps/web/src/sync/privacy-purge.js';
import {
  persistFinanceSearchPreferences,
  readFinanceSearchPreferences,
  safeFinanceSearchState,
} from '../../apps/web/src/features/search/search-state.js';

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/search');
});

describe('Finance search privacy', () => {
  it('removes a revoked account from results and counts immediately', async () => {
    const index = new FinanceSearchIndex();
    await index.replaceProgressively(
      {
        accounts: [{ id: 'account-a', friendlyName: 'Authorized' }],
        transactions: [
          { id: 'transaction-a', accountId: 'account-a', description: 'Private cedar' },
        ],
        merchants: [],
      },
      { yieldToMain: async () => undefined },
    );
    expect(
      index.search('cedar', { includeTransactions: true, includeMerchants: false }),
    ).toHaveLength(1);
    index.removeAccount('account-a');
    expect(index.search('cedar', { includeTransactions: true, includeMerchants: false })).toEqual(
      [],
    );
  });

  it('purges plaintext indexes and Finance preferences with a revoked audience', async () => {
    const index = new FinanceSearchIndex();
    const unregister = registerFinanceSearchIndex(index);
    await index.replaceProgressively(
      {
        accounts: [{ id: 'account-a', friendlyName: 'Checking' }],
        transactions: [
          { id: 'transaction-a', accountId: 'account-a', description: 'Private cedar' },
        ],
        merchants: [],
      },
      { yieldToMain: async () => undefined },
    );
    persistFinanceSearchPreferences({
      includeTasks: true,
      includeLists: true,
      includeTransactions: true,
      includeMerchants: false,
      accountId: 'account-a',
    });
    await purgeRevokedFinanceAudience({ scopeKey: 'GROUP#removed', purgeEncryptedScope: vi.fn() });
    expect(index.search('cedar', { includeTransactions: true, includeMerchants: false })).toEqual(
      [],
    );
    expect(readFinanceSearchPreferences()).toMatchObject({
      includeTransactions: false,
      accountId: 'all',
    });
    unregister();
  });

  it('never serializes protected search text or inaccessible aggregate state', () => {
    const serialized = safeFinanceSearchState({
      includeTasks: true,
      includeLists: true,
      includeTransactions: true,
      includeMerchants: true,
      accountId: 'account-a',
    }).toString();
    expect(serialized).not.toContain('private cedar');
    const params = new URLSearchParams(serialized);
    expect(params.has('count')).toBe(false);
    expect(params.has('total')).toBe(false);
    expect(params.has('activity')).toBe(false);
    expect(serialized).toBe('transactions=1&merchants=1&financeAccount=account-a');
  });
});
