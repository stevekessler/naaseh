import { describe, expect, it } from 'vitest';
import { createFinancialAccount, createMerchant } from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  associateTransactionMerchant,
  createManualTransaction,
  readAuthorizedMerchantActivity,
  replaceTransactionAllocationsForActor,
  searchAuthorizedTransactions,
  updateManualTransaction,
} from '../../apps/api/src/finance/transaction-service.js';

const ids = {
  account: '01J00000000000000000000101',
  hiddenAccount: '01J00000000000000000000102',
  transaction: '01J00000000000000000000111',
  hiddenTransaction: '01J00000000000000000000112',
  allocation: '01J00000000000000000000121',
  category: '01J00000000000000000000131',
  merchant: '01J00000000000000000000141',
};

const actor: FinanceActor = { id: 'owner-a', role: 'user', active: true, groupMemberships: [] };

const setup = () => {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    ids.account,
    createFinancialAccount({
      id: ids.account,
      scope: { type: 'owner', ownerId: actor.id },
      sourceName: 'Checking',
      organizationName: 'Fixture Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 10_000,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  repository.accounts.set(
    ids.hiddenAccount,
    createFinancialAccount({
      id: ids.hiddenAccount,
      scope: { type: 'owner', ownerId: 'owner-b' },
      sourceName: 'Private',
      organizationName: 'Hidden Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 20_000,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  repository.merchants.set(
    ids.merchant,
    createMerchant({
      id: ids.merchant,
      name: 'Fixture Cafe',
      source: 'manual',
      creatorId: actor.id,
    }),
  );
  return repository;
};

describe('Finance transaction services', () => {
  it('preserves source history, invalidates allocations, and makes mutation replay stable', async () => {
    const repository = setup();
    await createManualTransaction(
      repository,
      actor,
      ids.account,
      {
        id: ids.transaction,
        amountMinor: -1_000,
        transactedAt: '2026-01-02T12:00:00.000Z',
        description: 'Fixture Cafe',
      },
      'create-transaction',
    );
    await replaceTransactionAllocationsForActor(
      repository,
      actor,
      ids.transaction,
      {
        expectedVersion: 1,
        allocations: [{ id: ids.allocation, amountMinor: -1_000, financeCategoryId: ids.category }],
      },
      'allocate-transaction',
    );

    const corrected = await updateManualTransaction(
      repository,
      actor,
      ids.transaction,
      {
        expectedVersion: 2,
        amountMinor: -1_200,
      },
      'correct-transaction',
    );
    const replay = await updateManualTransaction(
      repository,
      actor,
      ids.transaction,
      {
        expectedVersion: 2,
        amountMinor: -1_200,
      },
      'correct-transaction',
    );
    expect(replay).toEqual(corrected);
    expect(corrected).toMatchObject({
      entrySnapshot: { amountMinor: -1_200, description: 'Fixture Cafe' },
      reviewState: 'allocation-review',
      version: 3,
    });
    expect(repository.reviewIssues.size).toBe(1);
  });

  it('returns account-scoped search and merchant activity only from authorized accounts', async () => {
    const repository = setup();
    await createManualTransaction(
      repository,
      actor,
      ids.account,
      {
        id: ids.transaction,
        amountMinor: -500,
        transactedAt: '2026-01-02T12:00:00.000Z',
        description: 'Coffee at Fixture Cafe',
      },
      'create-visible',
    );
    repository.transactions.push({
      id: ids.hiddenTransaction,
      accountId: ids.hiddenAccount,
      origin: 'manual',
      amountMinor: -700,
      currency: 'USD',
      currencyExponent: 2,
      transactedAt: '2026-01-03T12:00:00.000Z',
      effectiveAt: '2026-01-03T12:00:00.000Z',
      description: 'Coffee at Fixture Cafe',
      pending: false,
      entrySnapshot: {
        amountMinor: -700,
        currency: 'USD',
        transactedAt: '2026-01-03T12:00:00.000Z',
        description: 'Coffee at Fixture Cafe',
        pending: false,
      },
      allocations: [],
      merchantId: ids.merchant,
      reconciliationState: 'not-applicable',
      reviewState: 'none',
      status: 'active',
      version: 1,
    });
    await associateTransactionMerchant(
      repository,
      actor,
      ids.transaction,
      ids.merchant,
      1,
      'link-merchant',
    );

    const search = searchAuthorizedTransactions(repository, actor, { query: 'fixture cafe' });
    const scoped = searchAuthorizedTransactions(repository, actor, {
      query: 'fixture',
      accountId: ids.account,
    });
    const activity = readAuthorizedMerchantActivity(repository, actor, ids.merchant);
    expect(search.items.map(({ id }) => id)).toEqual([ids.transaction]);
    expect(scoped.items.map(({ id }) => id)).toEqual([ids.transaction]);
    expect(activity.transactions.map(({ id }) => id)).toEqual([ids.transaction]);
    expect(activity).toMatchObject({ totalsComplete: true });
  });
});
