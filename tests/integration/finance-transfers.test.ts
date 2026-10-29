import { describe, expect, it } from 'vitest';
import { createFinancialAccount } from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  confirmTransactionTransfer,
  createManualTransaction,
  updateManualTransaction,
} from '../../apps/api/src/finance/transaction-service.js';

const actor: FinanceActor = { id: 'owner-a', role: 'user', active: true, groupMemberships: [] };
const accountIds = ['01J00000000000000000000201', '01J00000000000000000000202'];
const transactionIds = ['01J00000000000000000000211', '01J00000000000000000000212'];
const transferId = '01J00000000000000000000221';

describe('Finance transfer services', () => {
  it('confirms accessible balanced legs, replays safely, and breaks after an amount correction', async () => {
    const repository = new FinanceMemoryRepository();
    for (const [index, accountId] of accountIds.entries())
      repository.accounts.set(
        accountId!,
        createFinancialAccount({
          id: accountId!,
          scope: { type: 'owner', ownerId: actor.id },
          sourceName: `Account ${index + 1}`,
          organizationName: 'Fixture Bank',
          accountType: 'checking',
          currency: 'USD',
          openingBalanceMinor: 10_000,
          balanceAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    await createManualTransaction(
      repository,
      actor,
      accountIds[0]!,
      {
        id: transactionIds[0]!,
        amountMinor: -2_000,
        transactedAt: '2026-01-02T12:00:00.000Z',
        description: 'Transfer out',
      },
      'create-debit',
    );
    await createManualTransaction(
      repository,
      actor,
      accountIds[1]!,
      {
        id: transactionIds[1]!,
        amountMinor: 2_000,
        transactedAt: '2026-01-02T12:00:00.000Z',
        description: 'Transfer in',
      },
      'create-credit',
    );

    const transfer = await confirmTransactionTransfer(
      repository,
      actor,
      {
        id: transferId,
        scope: { type: 'owner', ownerId: actor.id },
        transactionIds,
      },
      'confirm-transfer',
    );
    expect(
      await confirmTransactionTransfer(
        repository,
        actor,
        {
          id: transferId,
          scope: { type: 'owner', ownerId: actor.id },
          transactionIds,
        },
        'confirm-transfer',
      ),
    ).toEqual(transfer);
    expect(repository.transactions.filter(({ transferId: id }) => id === transferId)).toHaveLength(
      2,
    );

    await updateManualTransaction(
      repository,
      actor,
      transactionIds[0]!,
      {
        expectedVersion: 2,
        amountMinor: -1_900,
      },
      'correct-transfer-leg',
    );
    expect(repository.transfers.get(transferId)?.status).toBe('broken');
  });
});
