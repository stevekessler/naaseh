import type { FinanceSyncState } from '../../sync/finance-sync.js';

export function FinanceStatus({ state }: { state: FinanceSyncState }) {
  const label =
    state.status === 'idle'
      ? state.lastSuccessfulAt
        ? `Updated ${new Date(state.lastSuccessfulAt).toLocaleString()}`
        : 'Ready'
      : state.status === 'syncing'
        ? 'Refreshing finance data…'
        : (state.safeMessage ?? 'Finance status unavailable.');
  return (
    <output aria-live="polite" data-finance-status={state.status}>
      {label}
      {state.pendingCount > 0 ? ` ${state.pendingCount} pending.` : ''}
    </output>
  );
}
