import { createContext } from 'react';
import type { TransactionFilterValues } from './TransactionFilters.js';

export type TransactionFilterState = {
  values: TransactionFilterValues;
  accounts: string[];
};

/** User-entered filters survive a reconnect in the current signed-in app session. */
export const TransactionFilterContext = createContext<
  Map<string, TransactionFilterState> | undefined
>(undefined);
