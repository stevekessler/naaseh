import { describe, expect, it } from 'vitest';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  createManualTransaction,
  updateManualTransaction,
} from '../../apps/api/src/finance/transaction-service.js';
import { createFinancialAccount } from '@naaseh/domain';
import { commitAuthorizedCsvImportChunk } from '../../apps/api/src/finance/csv-import-service.js';

describe('Finance account mutation access', () => {
  it('allows an active group member to add a transaction but rejects a revoked member generically', async () => {
    const repository = new FinanceMemoryRepository();
    repository.accounts.set(
      'account-1',
      createFinancialAccount({
        id: 'account-1',
        scope: { type: 'group', groupId: '01J00000000000000000000001' },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    repository.balanceSnapshots.push({
      id: 'snapshot-1',
      accountId: 'account-1',
      balanceMinor: 0,
      currency: 'USD',
      currencyExponent: 2,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      recordedAt: '2026-01-01T00:00:00.000Z',
      source: 'manual',
    });
    const member = {
      id: 'member-1',
      role: 'user' as const,
      active: true,
      groupMemberships: [{ groupId: '01J00000000000000000000001', role: 'member' as const }],
    };
    await expect(
      createManualTransaction(
        repository,
        member,
        'account-1',
        {
          id: 'txn-1',
          amountMinor: -100,
          transactedAt: '2026-01-02T00:00:00.000Z',
          description: 'Fixture',
        },
        'mutation-1',
      ),
    ).resolves.toMatchObject({ id: 'txn-1' });
    await expect(
      createManualTransaction(
        repository,
        { ...member, groupMemberships: [] },
        'account-1',
        {
          id: 'txn-2',
          amountMinor: -100,
          transactedAt: '2026-01-02T00:00:00.000Z',
          description: 'Fixture',
        },
        'mutation-2',
      ),
    ).rejects.toThrow('Finance record not found.');
  });

  it('allows an active group member to import reviewed CSV rows and blocks revoked access', async () => {
    const repository = new FinanceMemoryRepository();
    repository.accounts.set(
      'account-1',
      createFinancialAccount({
        id: 'account-1',
        scope: { type: 'group', groupId: '01J00000000000000000000001' },
        sourceName: 'Checking',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    repository.balanceSnapshots.push({
      id: 'snapshot-1',
      accountId: 'account-1',
      balanceMinor: 0,
      currency: 'USD',
      currencyExponent: 2,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      recordedAt: '2026-01-01T00:00:00.000Z',
      source: 'manual',
    });
    const member = {
      id: 'member-1',
      role: 'user' as const,
      active: true,
      groupMemberships: [{ groupId: '01J00000000000000000000001', role: 'member' as const }],
    };
    const chunk = {
      accountId: 'account-1',
      batchId: 'batch-1',
      fileDigest: 'a'.repeat(64),
      duplicateDecisionDigest: 'b'.repeat(64),
      duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
      chunkIndex: 0,
      finalChunk: true,
      rows: [
        {
          ordinal: 1,
          amountMinor: -100,
          transactedAt: '2026-01-02T00:00:00.000Z',
          description: 'Fixture',
          duplicateDisposition: 'not-suspected' as const,
        },
      ],
    };
    await expect(commitAuthorizedCsvImportChunk(repository, member, chunk)).resolves.toMatchObject({
      status: 'succeeded',
    });
    await expect(
      commitAuthorizedCsvImportChunk(
        repository,
        { ...member, groupMemberships: [] },
        { ...chunk, batchId: 'batch-2', fileDigest: 'c'.repeat(64) },
      ),
    ).rejects.toThrow('Finance record not found.');
  });

  it('uses expected versions and emits only the authorized audience feed on manual edits', async () => {
    const repository = new FinanceMemoryRepository();
    repository.accounts.set(
      'account-1',
      createFinancialAccount({
        id: 'account-1',
        scope: { type: 'owner', ownerId: 'owner-1' },
        sourceName: 'Checking',
        organizationName: 'Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const owner = { id: 'owner-1', role: 'user' as const, active: true, groupMemberships: [] };
    await createManualTransaction(
      repository,
      owner,
      'account-1',
      {
        id: 'txn-1',
        amountMinor: -100,
        transactedAt: '2026-01-02T00:00:00.000Z',
        description: 'Before',
      },
      'mutation-1',
    );
    await expect(
      updateManualTransaction(
        repository,
        owner,
        'txn-1',
        { expectedVersion: 2, description: 'Wrong' },
        'mutation-2',
      ),
    ).rejects.toThrow(/version/i);
    const updated = await updateManualTransaction(
      repository,
      owner,
      'txn-1',
      { expectedVersion: 1, description: 'After' },
      'mutation-3',
    );
    expect(updated).toMatchObject({ description: 'After', version: 2 });
    expect(repository.feedChanges.at(-1)).toMatchObject({
      audience: 'OWNER#owner-1',
      entityType: 'financeTransaction',
      entityId: 'txn-1',
    });
  });
});
