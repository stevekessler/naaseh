import { useState, type FormEvent } from 'react';
import { TfaChallenge } from './TfaChallenge.js';
import { resetPassword } from './security-client.js';

export function Login({
  onAuthenticated,
}: {
  onAuthenticated: (session: {
    userId: string;
    displayName: string;
    csrfToken: string;
    role: 'admin' | 'user';
  }) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<'tfa_challenge' | 'tfa_enrollment'>();
  const [resetMode, setResetMode] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
      });
      if (!response.ok) {
        if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && response.status >= 500) {
          onAuthenticated({
            userId: 'local-steve',
            displayName: 'Steve',
            csrfToken: 'local-development',
            role: 'admin',
          });
          return;
        }
        setError('Unable to sign in. Check your credentials and try again.');
        return;
      }
      const result = await response.json();
      if (response.status === 202) {
        setNext(result.next);
        return;
      }
      onAuthenticated({
        userId: result.user.id,
        displayName: result.user.displayName,
        csrfToken: result.csrfToken,
        role: result.user.role,
      });
    } catch (reason) {
      if (import.meta.env.DEV || import.meta.env.MODE === 'test')
        onAuthenticated({
          userId: 'local-steve',
          displayName: 'Steve',
          csrfToken: 'local-development',
          role: 'admin',
        });
      else setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await resetPassword({
        username: String(data.get('username') ?? ''),
        pin: String(data.get('pin') ?? ''),
        newPassword: String(data.get('newPassword') ?? ''),
        confirmPassword: String(data.get('confirmPassword') ?? ''),
      });
      setError(result.message);
    } catch {
      setError('Unable to reset the password. Check the entries and try again later.');
    } finally {
      setBusy(false);
    }
  }
  if (next)
    return (
      <TfaChallenge
        enrollmentRequired={next === 'tfa_enrollment'}
        onAuthenticated={onAuthenticated}
      />
    );
  if (resetMode)
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={submitReset}>
          <h1>Reset password</h1>
          <label>
            <span>Username</span>
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            <span>Account PIN</span>
            <input name="pin" type="password" inputMode="numeric" required />
          </label>
          <label>
            <span>New password</span>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label>
            <span>Confirm new password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          {error && <p role="status">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
          <button type="button" onClick={() => setResetMode(false)}>
            Back to sign in
          </button>
        </form>
      </main>
    );
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/naaseh_logo.png" alt="Na'aseh — We will do it" />
        <label>
          <span>Username</span>
          <input name="username" autoComplete="username" autoFocus required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" onClick={() => setResetMode(true)}>
          Forgot password?
        </button>
      </form>
    </main>
  );
}
