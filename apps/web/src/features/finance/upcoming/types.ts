import type { ExpenseFulfillment, UpcomingExpense } from '@naaseh/domain';

export type UpcomingExpenseState =
  | 'upcoming'
  | 'due-today'
  | 'overdue'
  | 'partly-paid'
  | 'partly-paid-due-today'
  | 'partly-paid-overdue'
  | 'paid'
  | 'cancelled';

export interface UpcomingExpenseView {
  expense: UpcomingExpense;
  fulfillments: ExpenseFulfillment[];
  claimVersions: Record<string, number>;
  fulfilledAmountMinor: number;
  remainingAmountMinor: number;
  overpaidAmountMinor: number;
  state: UpcomingExpenseState;
  claimVersion?: number;
}

export const formatUpcomingMoney = (value: number, currency: string, exponent: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(value / 10 ** exponent);
