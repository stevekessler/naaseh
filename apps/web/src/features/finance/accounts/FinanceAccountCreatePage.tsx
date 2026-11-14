import { FormEvent, useEffect, useRef, useState } from 'react';
import { parseMajorUnits } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';

interface CreatedAccount {
  id: string;
  version: number;
}

interface AccountCreateErrors {
  organizationName?: string;
  sourceName?: string;
  openingBalance?: string;
  form?: string;
}

export function FinanceAccountCreatePage({
  ownerId,
  csrfToken,
  onCreated,
}: {
  ownerId: string;
  csrfToken: string;
  onCreated: (accountId: string) => void;
}) {
  const [organizationName, setOrganizationName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [errors, setErrors] = useState<AccountCreateErrors>({});
  const [saving, setSaving] = useState(false);
  const visit = useRef(0);

  useEffect(() => {
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      visit.current++;
      setSaving(false);
      setOrganizationName('');
      setSourceName('');
      setOpeningBalance('0.00');
      setErrors({ form: 'Reconnect and refresh Finance before creating an account.' });
    });
    return () => {
      visit.current++;
      unsubscribe?.();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: AccountCreateErrors = {};
    if (!organizationName.trim()) nextErrors.organizationName = 'Enter an organization name.';
    if (!sourceName.trim()) nextErrors.sourceName = 'Enter an account name.';
    let openingBalanceMinor: number | undefined;
    try {
      openingBalanceMinor = parseMajorUnits(openingBalance, 'USD');
    } catch {
      nextErrors.openingBalance =
        'Enter an amount with at most 2 decimal places and no commas or currency symbols.';
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const current = ++visit.current;
    setSaving(true);
    setErrors({});
    try {
      const created = await financeRequest<CreatedAccount>('/finance/accounts', {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          scope: { type: 'owner', ownerId },
          organizationName: organizationName.trim(),
          sourceName: sourceName.trim(),
          accountType: 'checking',
          currency: 'USD',
          openingBalanceMinor,
          balanceAt: new Date().toISOString(),
        }),
      });
      if (current !== visit.current) return;
      const snapshot = await loadFinanceApiSnapshot(
        async (request) => (await request<{ items: CreatedAccount[] }>('/finance/accounts')).items,
      );
      try {
        const confirmed = await readFinanceApiSnapshot(snapshot, (accounts) =>
          accounts.some(
            ({ id, version }) => id === created.id && version === created.version,
          ),
        );
        if (current !== visit.current) return;
        if (!confirmed) throw new Error('The saved account was not present in the protected read.');
        onCreated(created.id);
      } finally {
        disposeFinanceApiSnapshot(snapshot);
      }
    } catch {
      if (current === visit.current)
        setErrors({
          form: 'The account could not be confirmed. Your entries are still available to retry.',
        });
    } finally {
      if (current === visit.current) setSaving(false);
    }
  };

  return (
    <section className="finance-account-create" aria-labelledby="finance-account-create-title">
      <h2 id="finance-account-create-title">New Account</h2>
      <p>Create a financial account owned by you. Provider connections can be added below.</p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={saving}>
          <legend>Account details</legend>
          <label>
            Organization name
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              aria-invalid={Boolean(errors.organizationName)}
              aria-describedby={errors.organizationName ? 'organization-name-error' : undefined}
              required
            />
          </label>
          {errors.organizationName ? (
            <p id="organization-name-error" role="alert">
              {errors.organizationName}
            </p>
          ) : null}
          <label>
            Account name
            <input
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              aria-invalid={Boolean(errors.sourceName)}
              aria-describedby={errors.sourceName ? 'account-name-error' : undefined}
              required
            />
          </label>
          {errors.sourceName ? (
            <p id="account-name-error" role="alert">
              {errors.sourceName}
            </p>
          ) : null}
          <label>
            Opening balance
            <input
              inputMode="decimal"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
              aria-invalid={Boolean(errors.openingBalance)}
              aria-describedby={errors.openingBalance ? 'opening-balance-error' : undefined}
              required
            />
          </label>
          {errors.openingBalance ? (
            <p id="opening-balance-error" role="alert">
              {errors.openingBalance}
            </p>
          ) : null}
          <button type="submit">{saving ? 'Adding…' : 'Add account'}</button>
        </fieldset>
      </form>
      {errors.form ? <p role="alert">{errors.form}</p> : null}
    </section>
  );
}
