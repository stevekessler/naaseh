import { describe, expect, it } from 'vitest';
import { createFinancialAccount, changeAccountCurrency } from './account.js';

const base = {
  id: '01J00000000000000000000001',
  scope: { type: 'owner' as const, ownerId: 'owner-1' },
  sourceName: 'Checking',
  organizationName: 'Fixture Bank',
  accountType: 'checking' as const,
  currency: 'USD',
  openingBalanceMinor: 10_000,
  balanceAt: '2026-01-01T00:00:00.000Z',
};

describe('FinancialAccount', () => {
  it('requires organization and account names and derives the friendly name', () => {
    expect(createFinancialAccount(base).friendlyName).toBe('Fixture Bank - Checking');
    expect(() => createFinancialAccount({ ...base, sourceName: ' ' })).toThrow(/account name/i);
    expect(() => createFinancialAccount({ ...base, organizationName: '' })).toThrow(
      /organization/i,
    );
  });

  it('does not allow currency changes once transaction history exists', () => {
    expect(() => changeAccountCurrency(createFinancialAccount(base), 'EUR', true)).toThrow(
      /currency/i,
    );
    expect(changeAccountCurrency(createFinancialAccount(base), 'EUR', false).currency).toBe('EUR');
  });
});
