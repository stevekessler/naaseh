import { describe, expect, it } from 'vitest';
import { createFinancialTransaction } from './transaction.js';
import {
  exactProviderCandidates,
  normalizeReconciliationText,
  reconcileProviderTransaction,
  reconciliationPairKey,
  shouldSuppressReconciliationReview,
} from './provider-reconciliation.js';

const provisional = (id = '01J00000000000000000000051') =>
  createFinancialTransaction({
    id,
    accountId: '01J00000000000000000000001',
    origin: 'manual',
    amountMinor: -1_000,
    currency: 'USD',
    transactedAt: '2026-01-05T23:30:00-07:00',
    description: 'Café—North!',
    payee: 'Café North',
    pending: false,
    connectedAccount: true,
  });
const provider = createFinancialTransaction({
  id: '01J00000000000000000000052',
  accountId: '01J00000000000000000000001',
  origin: 'simplefin',
  amountMinor: -1_000,
  currency: 'USD',
  transactedAt: '2026-01-08T01:00:00.000Z',
  postedAt: '2026-01-09T00:00:00.000Z',
  description: 'CAFE NORTH',
  payee: 'café north',
  pending: false,
  connectedAccount: true,
  providerConnectionId: 'connection-1',
  providerAccountId: 'provider-account-1',
  sourceTransactionId: 'provider-transaction-1',
});

describe('provider reconciliation', () => {
  it('normalizes corresponding non-empty text exactly and uses UTC calendar dates within three days', () => {
    expect(normalizeReconciliationText(' Café—North! ')).toBe('café north');
    expect(exactProviderCandidates([provisional()], provider)).toHaveLength(1);
    expect(
      exactProviderCandidates([{ ...provisional(), description: 'Cafe', payee: 'Cafe' }], provider),
    ).toHaveLength(0);
    expect(
      exactProviderCandidates([{ ...provisional(), payee: '', description: '' }], provider),
    ).toHaveLength(0);
    expect(
      exactProviderCandidates(
        [{ ...provisional(), transactedAt: '2026-01-04T00:00:00.000Z' }],
        provider,
      ),
    ).toHaveLength(0);
  });

  it('reconciles only a unique candidate while preserving entry provenance and transferring identity', () => {
    expect(
      exactProviderCandidates([provisional(), provisional('01J00000000000000000000053')], provider),
    ).toHaveLength(2);
    const result = reconcileProviderTransaction(
      provisional(),
      provider,
      'system',
      new Date('2026-01-09T01:00:00.000Z'),
    );
    expect(result.transaction).toMatchObject({
      id: provisional().id,
      origin: 'manual',
      reconciliationState: 'reconciled',
      entrySnapshot: { description: 'Café—North!' },
      providerSnapshot: { description: 'CAFE NORTH' },
    });
    expect(result.identityTransfer).toEqual({
      fromTransactionId: provider.id,
      toTransactionId: provisional().id,
      connectionId: 'connection-1',
      providerAccountId: 'provider-account-1',
      sourceTransactionId: 'provider-transaction-1',
    });
  });

  it('uses an order-stable keep-separate key to suppress the same review on replay', () => {
    const key = reconciliationPairKey(provisional().id, provider.id);
    expect(key).toBe(reconciliationPairKey(provider.id, provisional().id));
    expect(shouldSuppressReconciliationReview(new Set([key]), provisional().id, provider.id)).toBe(
      true,
    );
  });
});
