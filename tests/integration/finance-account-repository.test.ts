import { describe, expect, it } from 'vitest';
import {
  FinanceMemoryRepository,
  buildFinancePersistenceItems,
  financeKeys,
} from '../../apps/api/src/finance/repository.js';
import {
  changeAccountLifecycle,
  completeSimplefinAccountIdentity,
  createManualAccount,
  recordManualBalance,
} from '../../apps/api/src/finance/account-service.js';

const actor = { id: 'owner-1', role: 'user' as const, active: true, groupMemberships: [] };
const input = {
  id: '01J00000000000000000000001',
  scope: { type: 'owner' as const, ownerId: 'owner-1' },
  sourceName: 'Checking',
  organizationName: 'Fixture Bank',
  accountType: 'checking' as const,
  currency: 'USD',
  openingBalanceMinor: 1_000,
  balanceAt: '2026-01-01T00:00:00.000Z',
};

describe('Finance account repository', () => {
  it('persists a manual account and idempotent opening balance', async () => {
    const repository = new FinanceMemoryRepository();
    const first = await createManualAccount(repository, actor, input, 'mutation-0001');
    const replay = await createManualAccount(repository, actor, input, 'mutation-0001');
    expect(replay).toEqual(first);
    expect(repository.balanceSnapshots).toHaveLength(1);
  });

  it('requires user-supplied SimpleFIN identity before account creation and transaction import', () => {
    const repository = new FinanceMemoryRepository();
    repository.pendingSimplefinAccounts.set('connection-1:provider-1', {
      providerAccountId: 'provider-1',
      currency: 'USD',
      balanceMinor: 100,
      balanceAt: '2026-01-01T00:00:00.000Z',
      transactions: [
        {
          sourceTransactionId: 'txn-1',
          amountMinor: -20,
          description: 'Fixture',
          postedAt: '2026-01-02T00:00:00.000Z',
          pending: false,
        },
      ],
    });
    expect(() =>
      completeSimplefinAccountIdentity(repository, actor, 'connection-1', 'provider-1', {
        scope: { type: 'owner', ownerId: actor.id },
        sourceName: '',
        organizationName: 'Bank',
      }),
    ).toThrow(/account name/i);
    const account = completeSimplefinAccountIdentity(
      repository,
      actor,
      'connection-1',
      'provider-1',
      {
        scope: { type: 'owner', ownerId: actor.id },
        sourceName: 'Checking',
        organizationName: 'Bank',
      },
    );
    expect(account.friendlyName).toBe('Bank - Checking');
    expect(repository.transactions).toHaveLength(1);
  });

  it('archives and restores an account without deleting transaction or category history', async () => {
    const repository = new FinanceMemoryRepository();
    await createManualAccount(repository, actor, input, 'mutation-0001');
    repository.transactions.push({
      id: 'txn-1',
      accountId: input.id,
      amountMinor: -100,
      effectiveAt: '2026-01-02T00:00:00.000Z',
      financeCategoryId: 'category-1',
    });
    const archived = changeAccountLifecycle(repository, actor, input.id, 1, 'archived');
    expect(archived.status).toBe('archived');
    expect(repository.transactions).toHaveLength(1);
    expect(repository.transactions[0]?.financeCategoryId).toBe('category-1');
    expect(changeAccountLifecycle(repository, actor, input.id, 2, 'active').status).toBe('active');
  });

  it('reprojects from a later balance snapshot while retaining transactions', async () => {
    const repository = new FinanceMemoryRepository();
    await createManualAccount(repository, actor, input, 'mutation-0001');
    repository.transactions.push({
      id: 'txn-1',
      accountId: input.id,
      amountMinor: -200,
      effectiveAt: '2026-01-03T00:00:00.000Z',
    });
    const result = await recordManualBalance(
      repository,
      actor,
      input.id,
      {
        id: 'snap-2',
        expectedAccountVersion: 1,
        balanceMinor: 2_000,
        effectiveAt: '2026-01-02T00:00:00.000Z',
        recordedAt: '2026-01-04T00:00:00.000Z',
      },
      'mutation-0002',
    );
    expect(result.account.currentBalanceMinor).toBe(1_800);
    expect(repository.transactions).toHaveLength(1);
  });

  it('persists account/source identities and import jobs under collision-safe keys', () => {
    expect(financeKeys.balanceSnapshot(input.id, 'snap-1')).toEqual({
      PK: `FINANCE#ACCOUNT#${input.id}`,
      SK: 'BALANCE#snap-1',
    });
    expect(financeKeys.csvRowReceipt(input.id, 'batch-1', 7).SK).toBe('CSV#batch-1#ROW#0000007');
    expect(financeKeys.connection('connection-1')).toEqual({
      PK: 'FINANCE#CONNECTION#connection-1',
      SK: 'CURRENT',
    });
    expect(financeKeys.importJob('connection-1', 'job-1')).toEqual({
      PK: 'FINANCE#CONNECTION#connection-1',
      SK: 'IMPORT#job-1',
    });
    expect(() => {
      const repository = new FinanceMemoryRepository();
      repository.claimSourceIdentity('connection-1', 'provider-1', 'account-1');
      repository.claimSourceIdentity('connection-1', 'provider-1', 'account-2');
    }).toThrow(/identity/i);
  });

  it('builds conditional durable writes for every US1 record and never stores a plaintext credential', () => {
    const items = buildFinancePersistenceItems({
      account: {
        ...input,
        friendlyName: 'Fixture Bank - Checking',
        currencyExponent: 2,
        currentBalanceMinor: 1_000,
        status: 'active',
        version: 1,
      },
      snapshot: {
        id: 'snap-1',
        accountId: input.id,
        balanceMinor: 1_000,
        currency: 'USD',
        currencyExponent: 2,
        effectiveAt: input.balanceAt,
        recordedAt: input.balanceAt,
        source: 'manual',
      },
      csvBatch: {
        id: 'batch-1',
        accountId: input.id,
        fileDigest: 'a'.repeat(64),
        status: 'staged',
      },
      csvRowReceipt: { accountId: input.id, batchId: 'batch-1', ordinal: 1, state: 'committed' },
      connection: {
        id: 'connection-1',
        encryptedAccessUrl: 'AQID',
        credentialKeyId: 'key-1',
        credentialContextVersion: 1,
      },
      sourceIdentity: {
        connectionId: 'connection-1',
        sourceId: 'provider-account-1',
        entityId: input.id,
      },
      importJob: { id: 'job-1', connectionId: 'connection-1', status: 'queued' },
    });
    expect(items).toHaveLength(7);
    expect(
      items.every((item) => item.Put?.ConditionExpression === 'attribute_not_exists(PK)'),
    ).toBe(true);
    expect(JSON.stringify(items)).not.toContain('https://');
  });
});
