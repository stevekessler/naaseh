import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createMerchant,
  createUserFinanceCategory,
  type FinanceAccountType,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { createManualTransaction } from '../../apps/api/src/finance/transaction-service.js';

const accountTypes: readonly FinanceAccountType[] = [
  'checking',
  'savings',
  'credit-card',
  'loan',
  'other',
];
const owner: FinanceActor = {
  id: 'owner-a',
  role: 'user',
  active: true,
  groupMemberships: [],
};

const ulid = (value: number) => `01J00000000000000000${String(value).padStart(6, '0')}`;

function addAccount(
  repository: FinanceMemoryRepository,
  value: number,
  accountType: FinanceAccountType,
  options: { connected?: boolean; scope?: { type: 'group'; groupId: string } } = {},
) {
  const account = createFinancialAccount({
    id: ulid(value),
    scope: options.scope ?? { type: 'owner', ownerId: owner.id },
    ...(options.connected ? { connectionId: `connection-${value}` } : {}),
    sourceName: `${accountType} source`,
    organizationName: 'Fixture Bank',
    accountType,
    currency: 'USD',
    openingBalanceMinor: 10_000,
    balanceAt: '2026-01-01T00:00:00.000Z',
  });
  repository.accounts.set(account.id, account);
  return account;
}

const input = (
  id: string,
  overrides: Partial<Parameters<typeof createManualTransaction>[3]> = {},
) => ({
  id,
  expectedAccountVersion: 1,
  amountMinor: -1_250,
  transactedAt: '2026-01-05T12:00:00.000Z',
  description: 'Manual purchase',
  payee: 'Fixture Cafe',
  memo: 'Entered by the user',
  paymentType: 'check',
  checkNumber: '000123',
  ...overrides,
});

describe('manual transaction entry for every editable account', () => {
  it('keeps manual snapshot balance semantics for every account type', async () => {
    const repository = new FinanceMemoryRepository();
    for (const [index, accountType] of accountTypes.entries()) {
      const account = addAccount(repository, 100 + index, accountType);
      const transaction = await createManualTransaction(
        repository,
        owner,
        account.id,
        input(ulid(200 + index)),
        `manual-${accountType}`,
      );
      expect(transaction).toMatchObject({
        id: ulid(200 + index),
        accountId: account.id,
        origin: 'manual',
        currency: 'USD',
        amountMinor: -1_250,
        reconciliationState: 'not-applicable',
        paymentType: 'check',
        checkNumber: '000123',
        entrySnapshot: {
          amountMinor: -1_250,
          description: 'Manual purchase',
          paymentType: 'check',
          checkNumber: '000123',
        },
      });
      expect(repository.accounts.get(account.id)?.currentBalanceMinor).toBe(8_750);
    }
  });

  it('marks connected-account entry provisional without changing provider balance', async () => {
    const repository = new FinanceMemoryRepository();
    for (const [index, accountType] of accountTypes.entries()) {
      const account = addAccount(repository, 300 + index, accountType, { connected: true });
      const transaction = await createManualTransaction(
        repository,
        owner,
        account.id,
        input(ulid(400 + index)),
        `connected-${accountType}`,
      );
      expect(transaction).toMatchObject({
        id: ulid(400 + index),
        origin: 'manual',
        reconciliationState: 'provisional',
        entrySnapshot: { amountMinor: -1_250 },
      });
      expect(transaction.providerSnapshot).toBeUndefined();
      expect(repository.accounts.get(account.id)?.currentBalanceMinor).toBe(10_000);
    }
  });

  it('stores merchant, classified allocation and payment metadata in the first canonical version', async () => {
    const repository = new FinanceMemoryRepository();
    const account = addAccount(repository, 450, 'checking');
    const merchantId = ulid(451);
    const categoryId = ulid(452);
    const allocationId = ulid(453);
    repository.categories.set(
      categoryId,
      createUserFinanceCategory({ id: categoryId, name: 'Dining', creatorId: owner.id }),
    );
    repository.merchants.set(
      merchantId,
      createMerchant({
        id: merchantId,
        name: 'Fixture Cafe',
        source: 'manual',
        creatorId: owner.id,
      }),
    );
    const metadataInput = input(ulid(454), {
      merchantId,
      allocations: [{ id: allocationId, amountMinor: -1_250, financeCategoryId: categoryId }],
    });
    const transaction = await createManualTransaction(
      repository,
      owner,
      account.id,
      metadataInput,
      'metadata-create',
    );
    expect(transaction).toMatchObject({
      version: 1,
      merchantId,
      paymentType: 'check',
      checkNumber: '000123',
      allocations: [
        {
          id: allocationId,
          amountMinor: -1_250,
          financeCategoryId: categoryId,
          classification: { categoryId, categoryLabel: 'Dining', categoryVersion: 1 },
          createdBy: owner.id,
        },
      ],
    });
    await expect(
      createManualTransaction(repository, owner, account.id, metadataInput, 'metadata-create'),
    ).resolves.toEqual(transaction);
  });

  it('denies hidden, inactive and stale-account saves without partial writes', async () => {
    const repository = new FinanceMemoryRepository();
    const account = addAccount(repository, 500, 'checking');
    const stranger: FinanceActor = {
      id: 'owner-b',
      role: 'user',
      active: true,
      groupMemberships: [],
    };
    await expect(
      createManualTransaction(repository, stranger, account.id, input(ulid(501)), 'hidden'),
    ).rejects.toThrow('Finance record not found.');
    await expect(
      createManualTransaction(
        repository,
        { ...owner, active: false },
        account.id,
        input(ulid(502)),
        'inactive',
      ),
    ).rejects.toThrow('Finance record not found.');
    await expect(
      createManualTransaction(
        repository,
        owner,
        account.id,
        input(ulid(503), { expectedAccountVersion: 99 }),
        'stale',
      ),
    ).rejects.toThrow('Account version conflict.');
    expect(repository.transactions).toHaveLength(0);
    expect(repository.accounts.get(account.id)?.currentBalanceMinor).toBe(10_000);
  });

  it('returns one stable canonical result for an exact actor retry and conflicts on changed intent', async () => {
    const repository = new FinanceMemoryRepository();
    const account = addAccount(repository, 600, 'checking', {
      scope: { type: 'group', groupId: 'household' },
    });
    const member = (id: string): FinanceActor => ({
      id,
      role: 'user',
      active: true,
      groupMemberships: [{ groupId: 'household', active: true }],
    });
    const firstInput = input(ulid(601));
    const created = await createManualTransaction(
      repository,
      member('member-a'),
      account.id,
      firstInput,
      'stable-retry',
    );
    await expect(
      createManualTransaction(
        repository,
        member('member-a'),
        account.id,
        { ...firstInput, id: ulid(602) },
        'stable-retry',
      ),
    ).resolves.toEqual(created);
    await expect(
      createManualTransaction(
        repository,
        member('member-a'),
        account.id,
        input(ulid(603), { amountMinor: -2_500 }),
        'stable-retry',
      ),
    ).rejects.toThrow('Transaction version conflict.');

    const other = await createManualTransaction(
      repository,
      member('member-b'),
      account.id,
      input(ulid(604), { expectedAccountVersion: 2 }),
      'stable-retry',
    );
    expect(other.id).toBe(ulid(604));
    expect(repository.transactions.map(({ id }) => id)).toEqual([created.id, other.id]);
    expect(repository.accounts.get(account.id)?.currentBalanceMinor).toBe(7_500);
  });
});
