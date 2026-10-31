export const FINANCE_FIXTURE_OWNER_ID = 'fixture-finance-owner';
export const FINANCE_FIXTURE_GROUP_ID = '01J00000000000000000000001';
export const FINANCE_FIXTURE_ACCOUNT_ID = '01J00000000000000000000002';

export const manualCheckingAccountFixture = Object.freeze({
  id: FINANCE_FIXTURE_ACCOUNT_ID,
  scope: { type: 'owner' as const, ownerId: FINANCE_FIXTURE_OWNER_ID },
  sourceName: 'Household Checking',
  organizationName: 'Example Community Bank',
  friendlyName: 'Example Community Bank - Household Checking',
  accountType: 'checking' as const,
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 125_000,
  balanceAt: '2026-01-15T12:00:00.000Z',
  status: 'active' as const,
  version: 1,
});

export const groupSavingsAccountFixture = Object.freeze({
  ...manualCheckingAccountFixture,
  id: '01J00000000000000000000003',
  scope: { type: 'group' as const, groupId: FINANCE_FIXTURE_GROUP_ID },
  sourceName: 'Shared Savings',
  friendlyName: 'Example Community Bank - Shared Savings',
  accountType: 'savings' as const,
  currentBalanceMinor: 450_000,
});
