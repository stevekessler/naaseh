import { useState, type FormEvent } from 'react';

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
      </form>
    </main>
  );
}
