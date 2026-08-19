import { useEffect, useState, type FormEvent } from 'react';
import {
  changePassword,
  disableTfa,
  readProfileSecurity,
  requestTfaEnrollment,
  rotateRecoveryCodes,
} from '../auth/security-client.js';

export function SecuritySettings({
  csrfToken,
  role,
}: {
  csrfToken: string;
  role: 'admin' | 'user';
}) {
  const [status, setStatus] = useState('Loading account security…');
  const [tfaEnabled, setTfaEnabled] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  useEffect(() => {
    let active = true;
    void readProfileSecurity(csrfToken)
      .then((value) => {
        setTfaEnabled(value.tfaStatus === 'enabled');
        if (active)
          setStatus(
            value.tfaStatus === 'enabled'
              ? `Two-factor authentication enabled; ${value.recoveryCodesRemaining} recovery codes remain.`
              : 'Two-factor authentication is not enabled.',
          );
      })
      .catch(() => active && setStatus('Account security is unavailable while offline.'));
    return () => {
      active = false;
    };
  }, [csrfToken]);
  const proof = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      password: String(data.get('password') ?? ''),
      method: String(data.get('method') ?? 'totp') as 'totp' | 'recovery_code',
      code: String(data.get('code') ?? ''),
    };
  };
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = new FormData(event.currentTarget);
      await requestTfaEnrollment(csrfToken, String(data.get('password') ?? ''));
      sessionStorage.removeItem('naaseh-session-view');
      location.assign('/');
    } catch {
      setStatus('Unable to start two-factor enrollment.');
    } finally {
      setBusy(false);
    }
  }
  async function rotate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await rotateRecoveryCodes(csrfToken, proof(event.currentTarget));
      setRecoveryCodes(result.recoveryCodes);
      setStatus('New recovery codes created. Previous recovery codes no longer work.');
    } catch {
      setStatus('Unable to verify the password and authentication code.');
    } finally {
      setBusy(false);
    }
  }
  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await disableTfa(csrfToken, proof(event.currentTarget));
      setTfaEnabled(false);
      setStatus('Two-factor authentication is disabled.');
    } catch {
      setStatus('Unable to disable two-factor authentication.');
    } finally {
      setBusy(false);
    }
  }
  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await changePassword(csrfToken, {
        ...proof(event.currentTarget),
        newPassword: String(data.get('newPassword') ?? ''),
        confirmPassword: String(data.get('confirmPassword') ?? ''),
      });
      setStatus('Password changed and other sessions were revoked.');
      event.currentTarget.reset();
    } catch {
      setStatus('Unable to change the password. Verify every entry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="security-title">
      <h2 id="security-title">Account security</h2>
      <p role="status">{status}</p>
      <p>Password reset requires the account PIN and is available from the sign-in page.</p>
      {tfaEnabled === false && (
        <form onSubmit={enroll}>
          <h3>Enable two-factor authentication</h3>
          <label>
            Password{' '}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button disabled={busy}>Continue setup at sign in</button>
        </form>
      )}
      {tfaEnabled && (
        <>
          <form onSubmit={rotate}>
            <h3>Replace recovery codes</h3>
            <FactorProofFields />
            <button disabled={busy}>Create new recovery codes</button>
          </form>
          {recoveryCodes && (
            <section aria-labelledby="new-recovery-codes">
              <h3 id="new-recovery-codes">Save these new recovery codes</h3>
              <ol>
                {recoveryCodes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => setRecoveryCodes(undefined)}>
                I saved these codes; clear them from the screen
              </button>
            </section>
          )}
          {role !== 'admin' && (
            <form onSubmit={disable}>
              <h3>Disable two-factor authentication</h3>
              <FactorProofFields />
              <button disabled={busy}>Disable two-factor authentication</button>
            </form>
          )}
          <form onSubmit={updatePassword}>
            <h3>Change password</h3>
            <FactorProofFields />
            <label>
              New password{' '}
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <label>
              Confirm new password{' '}
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <button disabled={busy}>Change password</button>
          </form>
        </>
      )}
    </section>
  );
}

function FactorProofFields() {
  return (
    <>
      <label>
        Password <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <label>
        Authentication method{' '}
        <select name="method">
          <option value="totp">Authenticator code</option>
          <option value="recovery_code">Recovery code</option>
        </select>
      </label>
      <label>
        Authentication code <input name="code" autoComplete="one-time-code" required />
      </label>
    </>
  );
}
