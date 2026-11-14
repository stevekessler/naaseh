import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  createMerchant,
  createUserFinanceCategory,
  replaceTransactionAllocations,
  withAllocationClassification,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { reconcileProviderImport } from '../../apps/api/src/finance/provider-reconciliation-service.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  replaceTransactionAllocationsForActor,
  updateFinanceMerchant,
} from '../../apps/api/src/finance/transaction-service.js';

const owner: FinanceActor = {
  id: 'owner-a',
  role: 'user',
  active: true,
  groupMemberships: [],
};

describe('Finance classification editing', () => {
  it('stores an immutable parent/subcategory snapshot on a classified allocation', async () => {
    const repository = new FinanceMemoryRepository();
    const account = createFinancialAccount({
      id: 'account-classification',
      scope: { type: 'owner', ownerId: owner.id },
      sourceName: 'Checking',
      organizationName: 'Fixture Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-01-01T00:00:00.000Z',
    });
    const transaction = createFinancialTransaction({
      id: 'transaction-classification',
      accountId: account.id,
      origin: 'manual',
      amountMinor: -1_000,
      currency: 'USD',
      transactedAt: '2026-01-05T12:00:00.000Z',
      description: 'Lunch',
      pending: false,
      connectedAccount: false,
    });
    const category = createUserFinanceCategory({ id: 'food', name: 'Food', creatorId: owner.id });
    const subcategory = createUserFinanceCategory({
      id: 'lunch',
      name: 'Lunch',
      creatorId: owner.id,
      parentId: category.id,
    });
    repository.accounts.set(account.id, account);
    repository.transactions.push(transaction);
    repository.categories.set(category.id, category);
    repository.categories.set(subcategory.id, subcategory);

    const updated = await replaceTransactionAllocationsForActor(
      repository,
      owner,
      transaction.id,
      {
        expectedVersion: 1,
        allocations: [
          {
            id: 'allocation-classification',
            amountMinor: -1_000,
            financeCategoryId: category.id,
            subcategoryId: subcategory.id,
          },
        ],
      },
      'classification-write',
    );
    expect(updated.allocations[0]).toMatchObject({
      subcategoryId: subcategory.id,
      classification: {
        categoryLabel: 'Food',
        subcategoryLabel: 'Lunch',
      },
    });
  });

  it('changes a merchant in place and conditionally replaces its canonical collision lock', () => {
    const repository = new FinanceMemoryRepository();
    const merchant = createMerchant({
      id: 'merchant-a',
      name: 'Fixture Cafe',
      city: 'Denver',
      region: 'CO',
      source: 'manual',
      creatorId: owner.id,
    });
    const occupied = createMerchant({
      id: 'merchant-b',
      name: 'Other Cafe',
      city: 'Denver',
      region: 'CO',
      source: 'manual',
      creatorId: owner.id,
    });
    repository.merchants.set(merchant.id, merchant);
    repository.merchants.set(occupied.id, occupied);
    repository.merchantKeyLocks.set(merchant.canonicalKey, merchant.id);
    repository.merchantKeyLocks.set(occupied.canonicalKey, occupied.id);

    expect(() =>
      updateFinanceMerchant(
        repository,
        owner,
        merchant.id,
        { expectedVersion: 1, name: occupied.name, city: occupied.city, region: occupied.region },
        'merchant-collision',
      ),
    ).toThrow(/conflict/iu);
    expect(repository.merchants.get(merchant.id)).toEqual(merchant);
    expect(repository.merchantKeyLocks.get(merchant.canonicalKey)).toBe(merchant.id);

    const updated = updateFinanceMerchant(
      repository,
      owner,
      merchant.id,
      {
        expectedVersion: 1,
        name: 'Fixture Coffee',
        city: 'Aurora',
        region: 'CO',
        financeCategoryId: 'category-a',
      },
      'merchant-update',
    );
    expect(updated).toMatchObject({
      id: merchant.id,
      name: 'Fixture Coffee',
      city: 'Aurora',
      financeCategoryId: 'category-a',
      source: 'manual',
      version: 2,
    });
    expect(repository.merchantKeyLocks.has(merchant.canonicalKey)).toBe(false);
    expect(repository.merchantKeyLocks.get(updated.canonicalKey)).toBe(merchant.id);
    expect(
      updateFinanceMerchant(
        repository,
        owner,
        merchant.id,
        { expectedVersion: 1 },
        'merchant-update',
      ),
    ).toEqual(updated);
  });

  it('preserves user payment metadata when a provisional entry reconciles to provider data', () => {
    const repository = new FinanceMemoryRepository();
    repository.accounts.set(
      'account-a',
      createFinancialAccount({
        id: 'account-a',
        connectionId: 'connection-a',
        scope: { type: 'owner', ownerId: owner.id },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const category = createUserFinanceCategory({
      id: 'category-a',
      name: 'Dining',
      creatorId: owner.id,
    });
    const merchant = createMerchant({
      id: 'merchant-a',
      name: 'Fixture Cafe',
      source: 'manual',
      creatorId: owner.id,
    });
    repository.categories.set(category.id, category);
    repository.merchants.set(merchant.id, merchant);
    const provisional = replaceTransactionAllocations(
      createFinancialTransaction({
        id: 'provisional-a',
        accountId: 'account-a',
        origin: 'manual',
        amountMinor: -1_000,
        currency: 'USD',
        transactedAt: '2026-01-05T12:00:00.000Z',
        description: 'Fixture Cafe',
        pending: false,
        connectedAccount: true,
        merchantId: merchant.id,
        paymentType: 'check',
        checkNumber: '000123',
      }),
      [
        withAllocationClassification(
          { id: 'allocation-a', amountMinor: -1_000, financeCategoryId: category.id },
          category,
        ),
      ],
      owner.id,
    );
    const provider = createFinancialTransaction({
      id: 'provider-a',
      accountId: 'account-a',
      origin: 'simplefin',
      amountMinor: -1_000,
      currency: 'USD',
      transactedAt: '2026-01-06T12:00:00.000Z',
      description: 'FIXTURE CAFE',
      pending: false,
      connectedAccount: true,
      providerConnectionId: 'connection-a',
      providerAccountId: 'provider-account-a',
      sourceTransactionId: 'source-a',
    });
    repository.transactions.push(provisional, provider);
    repository.claimSourceIdentity(
      'connection-a',
      'connection-a:provider-account-a:source-a',
      provider.id,
    );

    expect(reconcileProviderImport(repository, provider, 'system')).toMatchObject({
      id: provisional.id,
      paymentType: 'check',
      checkNumber: '000123',
      merchantId: merchant.id,
      allocations: [
        expect.objectContaining({
          id: 'allocation-a',
          financeCategoryId: category.id,
          classification: expect.objectContaining({ categoryLabel: 'Dining' }),
        }),
      ],
      providerSnapshot: provider.providerSnapshot,
    });
  });
});
