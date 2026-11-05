import { useEffect, useState, type FormEvent } from 'react';
import { financeSecurityResponseSchema } from '@naaseh/contracts';
import { peekFinanceAccess } from '../finance/security/finance-access.js';
import { refreshFinanceSecurity } from '../finance/security/finance-access-session.js';

type Preference = ReturnType<typeof financeSecurityResponseSchema.parse>;
export function FinanceSecuritySettings({
  ownerId,
  csrfToken,
}: {
  ownerId: string;
  csrfToken: string;
}) {
  const [preference, setPreference] = useState<Preference>();
  const [requirePin, setRequirePin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading Finance security…');
  useEffect(() => {
    let active = true;
    void fetch('/api/v1/auth/finance-security', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = financeSecurityResponseSchema.parse(await response.json());
        if (active) {
          setPreference(value);
          setRequirePin(value.requirePin);
          setStatus(value.enrolled ? 'A separate Finance PIN is set.' : 'No Finance PIN is set.');
        }
      })
      .catch(() => active && setStatus('Connect to manage Finance security.'));
    return () => {
      active = false;
    };
  }, [ownerId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preference) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const newPin = String(values.get('newFinancePin') ?? '');
    const confirmPin = String(values.get('confirmFinancePin') ?? '');
    if (newPin && (!/^\d{6,32}$/.test(newPin) || newPin !== confirmPin)) {
      setStatus('Enter matching Finance PINs of 6 to 32 digits.');
      form.reset();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/finance-security', {
        method: newPin ? 'PUT' : 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          currentPassword: String(values.get('financePassword') ?? ''),
          requirePin,
          expectedRevision: preference.revision,
          ...(newPin ? { newPin, confirmPin } : {}),
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Wait before trying Finance security again.'
            : 'Unable to save Finance security. Check your current password or refresh this page.',
        );
      const value = financeSecurityResponseSchema.parse(await response.json());
      setPreference(value);
      setRequirePin(value.requirePin);
      const access = peekFinanceAccess();
      if (access) {
        await access.markStale();
        await refreshFinanceSecurity(access, ownerId);
      }
      setStatus('Finance security saved. Saved encrypted changes remain on this device.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connect to manage Finance security.');
    } finally {
      form.reset();
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="finance-security-title">
      <h3 id="finance-security-title">Finance security</h3>
      <p role="status">{status}</p>
      <p>
        This separate PIN gates Finance in this app. It does not change your account recovery PIN or
        Journal encryption. Downloaded files cannot be recalled, and disconnected devices learn
        security changes when they reconnect.
      </p>
      <form onSubmit={save}>
        <label>
          <input
            type="checkbox"
            checked={requirePin}
            onChange={(event) => setRequirePin(event.currentTarget.checked)}
            disabled={busy || !preference}
          />
          Require a Finance PIN
        </label>
        <label>
          Current password for Finance security{' '}
          <input
            name="financePassword"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        <label>
          New Finance PIN{' '}
          <input
            name="newFinancePin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6,32}"
            minLength={6}
            maxLength={32}
            disabled={busy}
          />
        </label>
        <label>
          Confirm new Finance PIN{' '}
          <input
            name="confirmFinancePin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={32}
            disabled={busy}
          />
        </label>
        <p>
          Set a replacement PIN here if you have forgotten it. Leave both new PIN fields empty to
          change only the requirement.
        </p>
        <button disabled={busy || !preference}>
          {busy ? 'Saving Finance security…' : 'Save Finance security'}
        </button>
      </form>
    </section>
  );
}
