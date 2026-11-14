const fields = [
  { name: 'text', label: 'Search transactions', type: 'search' },
  { name: 'accountName', label: 'Account name', type: 'text' },
  { name: 'checkNumber', label: 'Check number', type: 'text' },
  { name: 'date', label: 'Exact date', type: 'date' },
  { name: 'dateFrom', label: 'From date', type: 'date' },
  { name: 'dateTo', label: 'Through date', type: 'date' },
  { name: 'amount', label: 'Exact signed amount (minor units)', type: 'number' },
  { name: 'amountMin', label: 'Minimum signed amount (minor units)', type: 'number' },
  { name: 'amountMax', label: 'Maximum signed amount (minor units)', type: 'number' },
] as const;

export type TransactionFilterField = (typeof fields)[number]['name'] | 'currency';
export type TransactionFilterValues = Partial<Record<TransactionFilterField, string>>;

export function TransactionFilters({
  values,
  onChange,
  accounts,
  accountIds,
  onAccountsChange,
  currencies,
  onClear,
}: {
  values: TransactionFilterValues;
  onChange: (field: TransactionFilterField, value: string) => void;
  accounts: ReadonlyArray<{ id: string; friendlyName: string }>;
  accountIds: string[];
  onAccountsChange: (ids: string[]) => void;
  currencies: string[];
  onClear: () => void;
}) {
  return (
    <fieldset className="finance-transaction-filters">
      <legend>Filter transactions</legend>
      {accounts.length ? (
        <label>
          Account scope
          <select
            multiple
            value={accountIds}
            onChange={(event) =>
              onAccountsChange([...event.currentTarget.selectedOptions].map(({ value }) => value))
            }
          >
            {accounts.map(({ id, friendlyName }) => (
              <option key={id} value={id}>
                {friendlyName}
              </option>
            ))}
          </select>
          <small>Leave empty for all accounts.</small>
        </label>
      ) : null}
      {fields.map(({ name, label, type }) => (
        <label key={name}>
          {label}
          <input
            type={type}
            value={values[name] ?? ''}
            onChange={(event) => onChange(name, event.target.value)}
          />
        </label>
      ))}
      {currencies.length > 1 ? (
        <label>
          Currency
          <select
            value={values.currency ?? ''}
            onChange={(event) => onChange('currency', event.target.value)}
          >
            <option value="">All currencies</option>
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="button" onClick={onClear}>
        Clear filters
      </button>
    </fieldset>
  );
}
