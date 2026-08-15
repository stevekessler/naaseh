import { useEffect, useState, type FormEvent } from 'react';
import {
  confirmTfaEnrollment,
  startTfaEnrollment,
  submitTfaChallenge,
  type AuthenticatedSession,
} from './security-client.js';

export function TfaChallenge({
  enrollmentRequired,
  onAuthenticated,
}: {
  enrollmentRequired: boolean;
  onAuthenticated: (session: AuthenticatedSession) => void;
}) {
  const [method, setMethod] = useState<'totp' | 'recovery_code'>('totp');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string }>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [completedSession, setCompletedSession] = useState<AuthenticatedSession>();
  useEffect(() => {
    if (!enrollmentRequired) return;
    let active = true;
    void startTfaEnrollment()
      .then((value) => active && setEnrollment(value))
      .catch(() => active && setError('Unable to start enrollment. Sign in and try again.'));
    return () => {
      active = false;
    };
  }, [enrollmentRequired]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      if (enrollmentRequired) {
        const result = await confirmTfaEnrollment(String(data.get('code') ?? ''));
        const session = {
          userId: result.user.id,
          displayName: result.user.displayName,
          role: result.user.role,
          csrfToken: result.csrfToken,
        };
        setRecoveryCodes(result.recoveryCodes);
        setCompletedSession(session);
      } else {
        const result = await submitTfaChallenge(method, String(data.get('code') ?? ''));
        onAuthenticated({
          userId: result.user.id,
          displayName: result.user.displayName,
          role: result.user.role,
          csrfToken: result.csrfToken,
        });
      }
    } catch {
      setError('Unable to verify the authentication code. Try again.');
    } finally {
      setBusy(false);
    }
  }
  if (recoveryCodes && completedSession)
    return (
      <main className="login-page">
        <section className="login-card" aria-labelledby="recovery-codes-title">
          <h1 id="recovery-codes-title">Save your recovery codes</h1>
          <p>Each code works once. Store them somewhere private before continuing.</p>
          <ol>
            {recoveryCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => onAuthenticated(completedSession)}>
            I saved the codes
          </button>
        </section>
      </main>
    );
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>
          {enrollmentRequired ? 'Set up two-factor authentication' : 'Two-factor authentication'}
        </h1>
        {enrollmentRequired && (
          <>
            <p>
              An administrator must enroll an authenticator before receiving application access.
            </p>
            {enrollment ? (
              <p>
                Enter this setup key in your authenticator: <code>{enrollment.secret}</code>
              </p>
            ) : (
              <p role="status">Preparing a setup key…</p>
            )}
          </>
        )}
        <label>
          <span>Authentication method</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
          >
            <option value="totp">Authenticator code</option>
            {!enrollmentRequired && <option value="recovery_code">Recovery code</option>}
          </select>
        </label>
        <label>
          <span>Authentication code</span>
          <input
            name="code"
            inputMode={method === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            minLength={6}
            maxLength={64}
            required
            autoFocus
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    </main>
  );
}
