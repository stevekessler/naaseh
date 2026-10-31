import { describe, expect, it, vi } from 'vitest';
import { createFinancialAccount, createFinancialTransaction, createMerchant } from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  readAuthorizedMerchantActivity,
  searchAuthorizedTransactions,
} from '../../apps/api/src/finance/transaction-service.js';
import { createDeviceKey } from '../../apps/web/src/crypto/vault.js';
import { encryptFinanceRecord } from '../../apps/web/src/db/finance-repository.js';
import { purgeRevokedFinanceAudience } from '../../apps/web/src/sync/privacy-purge.js';

const visibleAccountId = '01J00000000000000000000401';
const hiddenAccountId = '01J00000000000000000000402';
const merchantId = '01J00000000000000000000411';

const setup = () => {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    visibleAccountId,
    createFinancialAccount({
      id: visibleAccountId,
      scope: { type: 'owner', ownerId: 'owner-a' },
      sourceName: 'Checking',
      organizationName: 'Visible Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  repository.accounts.set(
    hiddenAccountId,
    createFinancialAccount({
      id: hiddenAccountId,
      scope: { type: 'owner', ownerId: 'owner-b' },
      sourceName: 'Private',
      organizationName: 'Hidden Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  repository.merchants.set(
    merchantId,
    createMerchant({
      id: merchantId,
      name: 'Shared Catalog Cafe',
      source: 'manual',
      creatorId: 'owner-a',
    }),
  );
  repository.transactions.push(
    createFinancialTransaction({
      id: '01J00000000000000000000421',
      accountId: visibleAccountId,
      origin: 'manual',
      amountMinor: -500,
      currency: 'USD',
      transactedAt: '2026-01-02T00:00:00.000Z',
      description: 'Shared Catalog Cafe',
      pending: false,
      connectedAccount: false,
      merchantId,
    }),
    createFinancialTransaction({
      id: '01J00000000000000000000422',
      accountId: hiddenAccountId,
      origin: 'manual',
      amountMinor: -9_999,
      currency: 'USD',
      transactedAt: '2026-01-03T00:00:00.000Z',
      description: 'Shared Catalog Cafe secret purchase',
      pending: false,
      connectedAccount: false,
      merchantId,
    }),
  );
  return repository;
};

describe('Finance transaction privacy boundaries', () => {
  it('reveals the global merchant identity without leaking inaccessible activity or search hits', () => {
    const repository = setup();
    const actor = { id: 'owner-a', role: 'user' as const, active: true, groupMemberships: [] };

    const activity = readAuthorizedMerchantActivity(repository, actor, merchantId);
    const search = searchAuthorizedTransactions(repository, actor, {
      query: 'shared catalog cafe',
    });
    const hiddenScope = searchAuthorizedTransactions(repository, actor, {
      query: 'secret purchase',
      accountId: hiddenAccountId,
    });

    expect(activity.merchant).toMatchObject({ id: merchantId, name: 'Shared Catalog Cafe' });
    expect(activity.transactions.map(({ id }) => id)).toEqual(['01J00000000000000000000421']);
    expect(JSON.stringify(activity)).not.toContain('9999');
    expect(search.items.map(({ id }) => id)).toEqual(['01J00000000000000000000421']);
    expect(hiddenScope).toEqual({ items: [], cursor: null, totalsComplete: true });
  });

  it('keeps transaction content encrypted outside memory-only search state', async () => {
    const record = await encryptFinanceRecord({
      id: '01J00000000000000000000421',
      entityType: 'financeTransaction',
      scopeKey: 'OWNER#owner-a',
      accountId: visibleAccountId,
      version: 1,
      updatedAt: '2026-01-02T00:00:00.000Z',
      value: { description: 'plaintext must not be indexed', memo: 'private memo' },
      key: await createDeviceKey(),
    });

    expect(JSON.stringify(record)).not.toContain('plaintext must not be indexed');
    expect(JSON.stringify(record)).not.toContain('private memo');
    expect(record).not.toHaveProperty('searchText');
    expect(record).not.toHaveProperty('searchTokens');
  });

  it('purges both encrypted audience records and memory-only search state on revocation', async () => {
    const purgeEncryptedScope = vi.fn().mockResolvedValue(undefined);
    const clearMemorySearchIndex = vi.fn();

    await purgeRevokedFinanceAudience({
      scopeKey: 'GROUP#01J00000000000000000000001',
      purgeEncryptedScope,
      clearMemorySearchIndex,
    });

    expect(purgeEncryptedScope).toHaveBeenCalledWith('GROUP#01J00000000000000000000001');
    expect(clearMemorySearchIndex).toHaveBeenCalledOnce();
  });
});
