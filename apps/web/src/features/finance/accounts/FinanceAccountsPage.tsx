import { FormEvent, useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { FinanceAccountDetail, type FinanceAccountView } from './FinanceAccountDetail.js';

type Account = FinanceAccountView;

const money = (account: Account) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: account.currency,
    minimumFractionDigits: account.currencyExponent,
    maximumFractionDigits: account.currencyExponent,
  }).format(account.currentBalanceMinor / 10 ** account.currencyExponent);

export function FinanceAccountsPage({
  ownerId,
  csrfToken,
  assignableGroups,
}: {
  ownerId: string;
  csrfToken: string;
  assignableGroups: Array<{ id: string; name: string }>;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [accountType, setAccountType] = useState<
    'checking' | 'savings' | 'credit-card' | 'loan'
  >('checking');
  const [assignment, setAssignment] = useState('owner');
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => {
    void financeRequest<{ items: Account[] }>('/finance/accounts')
      .then((value) => setAccounts(value.items))
      .catch(() => setError('Accounts are unavailable.'));
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!organizationName.trim() || !sourceName.trim()) {
      setError('Organization name and account name are required.');
      return;
    }
    const value = Number(openingBalance);
    if (!Number.isFinite(value) || !Number.isInteger(value * 100)) {
      setError('Enter an exact opening balance.');
      return;
    }
    setSaving(true);
    try {
      const account = await financeRequest<Account>('/finance/accounts', {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          scope:
            assignment === 'owner'
              ? { type: 'owner', ownerId }
              : { type: 'group', groupId: assignment },
          organizationName: organizationName.trim(),
          sourceName: sourceName.trim(),
          accountType,
          currency: 'USD',
          openingBalanceMinor: Math.round(value * 100),
          balanceAt: new Date().toISOString(),
        }),
      });
      setAccounts((current) => [...current, account]);
      setSelectedId(account.id);
      setOrganizationName('');
      setSourceName('');
      setOpeningBalance('0.00');
      setAccountType('checking');
      setAssignment('owner');
    } catch {
      setError('The account could not be added.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="finance-accounts">
      <h2>Accounts</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving}>
          <legend>Add a manual account</legend>
          <label>
            Organization name
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              required
            />
          </label>
          <label>
            Account name
            <input
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              required
            />
          </label>
          <label>
            Account type
            <select
              value={accountType}
              onChange={(event) =>
                setAccountType(
                  event.target.value as 'checking' | 'savings' | 'credit-card' | 'loan',
                )
              }
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit-card">Credit card</option>
              <option value="loan">Loan</option>
            </select>
          </label>
          <label>
            Assign account to
            <select value={assignment} onChange={(event) => setAssignment(event.target.value)}>
              <option value="owner">My account</option>
              {assignableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Opening balance
            <input
              inputMode="decimal"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
              required
            />
          </label>
          <button type="submit">{saving ? 'Adding…' : 'Add account'}</button>
        </fieldset>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <div className="finance-account-grid">
        {accounts.map((account) => (
          <article key={account.id}>
            <h3>{account.friendlyName}</h3>
            <p>{money(account)}</p>
            <p>
              {account.status === 'attention'
                ? 'Needs account details'
                : account.freshness?.stale
                  ? 'Refresh recommended'
                  : 'Up to date'}
            </p>
            <button onClick={() => setSelectedId(account.id)}>Open account</button>
          </article>
        ))}
      </div>
      {accounts.find(({ id }) => id === selectedId) ? (
        <FinanceAccountDetail
          account={accounts.find(({ id }) => id === selectedId)!}
          csrfToken={csrfToken}
          ownerId={ownerId}
          assignableGroups={assignableGroups}
          onChange={(updated) =>
            setAccounts((current) =>
              current.map((account) => (account.id === updated.id ? updated : account)),
            )
          }
        />
      ) : null}
    </div>
  );
}
