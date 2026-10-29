import { FINANCE_FIXTURE_ACCOUNT_ID } from './accounts.js';

export const groceryTransactionFixture = Object.freeze({
  id: '01J00000000000000000000010',
  accountId: FINANCE_FIXTURE_ACCOUNT_ID,
  origin: 'manual' as const,
  amountMinor: -8_425,
  currency: 'USD',
  currencyExponent: 2,
  transactedAt: '2026-01-16T18:30:00.000Z',
  description: 'Fixture grocery purchase',
  payee: 'Example Market',
  pending: false,
  reconciliationState: 'not-applicable' as const,
  version: 1,
});

export const provisionalUtilityTransactionFixture = Object.freeze({
  ...groceryTransactionFixture,
  id: '01J00000000000000000000011',
  amountMinor: -12_300,
  transactedAt: '2026-01-20T08:00:00.000Z',
  description: 'Fixture utility payment',
  payee: 'Example Utility',
  reconciliationState: 'provisional' as const,
});
