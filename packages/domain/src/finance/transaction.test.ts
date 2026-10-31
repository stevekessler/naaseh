import { describe, expect, it } from 'vitest';
import {
  archiveFinancialTransaction,
  canPermanentlyDeleteTransaction,
  correctFinancialTransaction,
  createFinancialTransaction,
  replaceTransactionAllocations,
  tombstoneFinancialTransaction,
} from './transaction.js';
import {
  archiveTransfer,
  confirmTransfer,
  createConfirmedTransfer,
  createSuggestedTransfer,
  invalidateTransfer,
} from './transfer.js';

const manual = () =>
  createFinancialTransaction({
    id: '01J00000000000000000000011',
    accountId: '01J00000000000000000000001',
    origin: 'manual',
    amountMinor: -1_000,
    currency: 'USD',
    transactedAt: '2026-01-02T10:00:00.000Z',
    description: 'Fixture Store',
    pending: false,
    connectedAccount: true,
  });

describe('financial transactions', () => {
  it('preserves an immutable entry snapshot and requires exactly balanced allocations', () => {
    const transaction = manual();
    expect(transaction).toMatchObject({
      origin: 'manual',
      reconciliationState: 'provisional',
      entrySnapshot: { amountMinor: -1_000, description: 'Fixture Store' },
    });
    expect(() =>
      replaceTransactionAllocations(
        transaction,
        [
          {
            id: '01J00000000000000000000021',
            amountMinor: -700,
            financeCategoryId: '01J00000000000000000000031',
          },
          {
            id: '01J00000000000000000000022',
            amountMinor: -200,
            financeCategoryId: '01J00000000000000000000032',
          },
        ],
        'owner-1',
        new Date('2026-01-03T00:00:00.000Z'),
      ),
    ).toThrow(/equal the transaction total/i);
    const updated = replaceTransactionAllocations(
      transaction,
      [
        {
          id: '01J00000000000000000000021',
          amountMinor: -700,
          financeCategoryId: '01J00000000000000000000031',
        },
        {
          id: '01J00000000000000000000022',
          amountMinor: -300,
          financeCategoryId: '01J00000000000000000000032',
        },
      ],
      'owner-1',
      new Date('2026-01-03T00:00:00.000Z'),
    );
    expect(updated.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0)).toBe(
      -1_000,
    );
  });

  it('requires confirmed transfer legs to be accessible, one currency, and net to zero', () => {
    const debit = manual();
    const credit = createFinancialTransaction({
      ...debit,
      id: '01J00000000000000000000012',
      accountId: '01J00000000000000000000002',
      amountMinor: 1_000,
      connectedAccount: false,
    });
    const transfer = createConfirmedTransfer(
      {
        id: '01J00000000000000000000041',
        scope: { type: 'owner', ownerId: 'owner-1' },
        createdBy: 'owner-1',
      },
      [debit, credit],
    );
    expect(transfer.legTransactionIds).toEqual([debit.id, credit.id]);
    expect(() =>
      createConfirmedTransfer(
        {
          id: '01J00000000000000000000042',
          scope: { type: 'owner', ownerId: 'owner-1' },
          createdBy: 'owner-1',
        },
        [debit, { ...credit, amountMinor: 900 }],
      ),
    ).toThrow(/net to zero/i);
    expect(() =>
      createConfirmedTransfer(
        {
          id: '01J00000000000000000000043',
          scope: { type: 'owner', ownerId: 'owner-1' },
          createdBy: 'owner-1',
        },
        [debit, { ...credit, currency: 'EUR' }],
      ),
    ).toThrow(/currency/i);
  });

  it('preserves source provenance and flags allocations when a correction changes the total', () => {
    const allocated = replaceTransactionAllocations(
      manual(),
      [
        {
          id: '01J00000000000000000000021',
          amountMinor: -1_000,
          financeCategoryId: '01J00000000000000000000031',
        },
      ],
      'owner-1',
      new Date('2026-01-03T00:00:00.000Z'),
    );
    const corrected = correctFinancialTransaction(allocated, {
      amountMinor: -1_200,
      description: 'Fixture Store corrected',
    });
    expect(corrected.entrySnapshot).toMatchObject({
      amountMinor: -1_200,
      description: 'Fixture Store corrected',
    });
    expect(corrected.allocations).toEqual(allocated.allocations);
    expect(corrected.reviewState).toBe('allocation-review');
    expect(corrected.version).toBe(allocated.version + 1);
  });

  it('archives referenced transactions, tombstones audit-critical records, and deletes only mistakes', () => {
    const transaction = manual();
    expect(
      canPermanentlyDeleteTransaction(transaction, { hasReferences: false, isMistake: true }),
    ).toBe(true);
    expect(
      canPermanentlyDeleteTransaction(transaction, { hasReferences: true, isMistake: true }),
    ).toBe(false);
    expect(archiveFinancialTransaction(transaction).status).toBe('archived');
    const tombstone = tombstoneFinancialTransaction(transaction);
    expect(tombstone).toMatchObject({ status: 'tombstone', description: 'Deleted transaction' });
    expect(tombstone.allocations).toEqual([]);
  });

  it('supports suggested, confirmed, broken, and archived transfer lifecycle states', () => {
    const debit = manual();
    const credit = createFinancialTransaction({
      ...debit,
      id: '01J00000000000000000000012',
      accountId: '01J00000000000000000000002',
      amountMinor: 1_000,
      connectedAccount: false,
    });
    const suggested = createSuggestedTransfer(
      {
        id: '01J00000000000000000000041',
        scope: { type: 'owner', ownerId: 'owner-1' },
        createdBy: 'owner-1',
      },
      [debit, credit],
    );
    const confirmed = confirmTransfer(suggested, [debit, credit]);
    expect(confirmed.status).toBe('confirmed');
    expect(invalidateTransfer(confirmed).status).toBe('broken');
    expect(archiveTransfer(confirmed).status).toBe('archived');
  });
});
