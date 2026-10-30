import type { FinanceScope } from './scope.js';
import { currencyExponentFor } from './money.js';

export type FinanceAccountType = 'checking' | 'savings' | 'credit-card' | 'loan' | 'other';

export interface FinancialAccount {
  id: string;
  scope: FinanceScope;
  connectionId?: string;
  sourceName: string;
  organizationName: string;
  friendlyName: string;
  accountType: FinanceAccountType;
  currency: string;
  currencyExponent: number;
  currentBalanceMinor: number;
  availableBalanceMinor?: number;
  balanceAt: string;
  status: 'active' | 'attention' | 'archived' | 'deleting';
  version: number;
}

export interface CreateFinancialAccountInput {
  id: string;
  scope: FinanceScope;
  connectionId?: string;
  sourceName: string;
  organizationName: string;
  friendlyName?: string;
  accountType: FinanceAccountType;
  currency?: string;
  openingBalanceMinor: number;
  availableBalanceMinor?: number;
  balanceAt: string;
}

const requiredName = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > 200) throw new Error(`${label} exceeds 200 characters.`);
  return trimmed;
};

export function createFinancialAccount(input: CreateFinancialAccountInput): FinancialAccount {
  const sourceName = requiredName(input.sourceName, 'Account name');
  const organizationName = requiredName(input.organizationName, 'Organization name');
  const friendlyName = requiredName(
    input.friendlyName ?? `${organizationName} - ${sourceName}`,
    'Friendly name',
  );
  if (!Number.isSafeInteger(input.openingBalanceMinor))
    throw new Error('Balance must be a safe integer.');
  return {
    id: input.id,
    scope: input.scope,
    ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    sourceName,
    organizationName,
    friendlyName,
    accountType: input.accountType,
    currency: input.currency ?? 'USD',
    currencyExponent: currencyExponentFor(input.currency ?? 'USD'),
    currentBalanceMinor: input.openingBalanceMinor,
    ...(input.availableBalanceMinor === undefined
      ? {}
      : { availableBalanceMinor: input.availableBalanceMinor }),
    balanceAt: new Date(input.balanceAt).toISOString(),
    status: 'active',
    version: 1,
  };
}

export function changeAccountCurrency(
  account: FinancialAccount,
  currency: string,
  hasTransactions: boolean,
): FinancialAccount {
  if (hasTransactions && currency !== account.currency) {
    throw new Error('Account currency is immutable after transactions exist.');
  }
  return { ...account, currency, currencyExponent: currencyExponentFor(currency) };
}
