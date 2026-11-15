export interface FinanceDashboardAccount {
  id: string;
  friendlyName: string;
  currency: string;
  currencyExponent: number;
  currentBalanceMinor: number;
  freshness?: { lastUpdatedAt: string; stale: boolean };
}

export function AccountBalancesWidget({
  accounts,
  includedIds,
  onOpenAccount,
}: {
  accounts: FinanceDashboardAccount[];
  includedIds: ReadonlySet<string>;
  onOpenAccount: (accountId: string) => void;
}) {
  if (!accounts.length)
    return (
      <section aria-label="Empty Finance dashboard">
        <h3>No accounts yet</h3>
        <p>Create an account or connect a provider to begin. No balance data is available.</p>
      </section>
    );

  const selected = accounts.filter(({ id }) => includedIds.has(id));
  return (
    <section aria-label="Dashboard accounts" className="finance-dashboard-accounts">
      <h3>Accounts</h3>
      {selected.length ? (
        <div className="finance-account-grid">
          {selected.map((account) => (
            <article key={account.id}>
              <h4>{account.friendlyName}</h4>
              <p>
                {new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: account.currency,
                  minimumFractionDigits: account.currencyExponent,
                  maximumFractionDigits: account.currencyExponent,
                }).format(account.currentBalanceMinor / 10 ** account.currencyExponent)}
              </p>
              <p>
                {account.freshness?.stale
                  ? 'Refresh recommended'
                  : account.freshness
                    ? 'Up to date'
                    : 'Freshness unavailable'}
              </p>
              <button type="button" onClick={() => onOpenAccount(account.id)}>
                Open account
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p>Choose accounts to include from their Finance detail pages.</p>
      )}
    </section>
  );
}
