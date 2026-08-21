export interface BrowserSession {
  userId: string;
  displayName: string;
  csrfToken: string;
  role: 'admin' | 'user';
}
export const saveSessionView = (session: BrowserSession) =>
  sessionStorage.setItem('naaseh-session-view', JSON.stringify(session));
export const clearSessionView = () => sessionStorage.removeItem('naaseh-session-view');

export async function validateBrowserSession(): Promise<
  { valid: true; session: BrowserSession } | { valid: false; reason: 'revoked' | 'expired' }
> {
  const response = await fetch('/api/v1/auth/session', {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'cache-control': 'no-store' },
  });
  if (response.status === 401) return { valid: false, reason: 'revoked' };
  if (!response.ok) throw new Error('Session validation unavailable');
  const result = (await response.json()) as {
    user: { id: string; displayName: string; role: 'admin' | 'user' };
    csrfToken: string;
  };
  return {
    valid: true,
    session: {
      userId: result.user.id,
      displayName: result.user.displayName,
      role: result.user.role,
      csrfToken: result.csrfToken,
    },
  };
}

export async function revalidateProtectedSession(options: {
  lock: () => void;
  validate: () => Promise<
    { valid: true; session?: BrowserSession } | { valid: false; reason: 'revoked' | 'expired' }
  >;
  purge: () => Promise<void>;
  unlock: () => void;
}) {
  options.lock();
  let validation: Awaited<ReturnType<typeof options.validate>>;
  try {
    validation = await options.validate();
  } catch {
    return { status: 'offline_locked' as const, retryable: true as const };
  }
  if (validation.valid) {
    options.unlock();
    return { status: 'valid' as const, retryable: false as const };
  }
  try {
    await options.purge();
    clearSessionView();
    return { status: 'revoked' as const, retryable: false as const };
  } catch {
    return { status: 'purge_failed' as const, retryable: true as const };
  }
}
