import { purgeAllAuthorizedData } from '../../sync/privacy-purge.js';
import { clearSessionView } from './session.js';

type SignOutDependencies = {
  request: typeof fetch;
  purge: () => Promise<void>;
  clearSession: () => void;
};

export function confirmSignOutWithUnsyncedData(
  pending: number,
  conflicts: number,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
) {
  if (pending === 0 && conflicts === 0) return true;
  const details = [
    pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync` : '',
    conflicts ? `${conflicts} saved conflict${conflicts === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' and ');
  return confirm(
    `You have ${details}. Signing out removes local data and may permanently lose changes that have not synced. Are you sure you want to sign out?`,
  );
}

/** Revoke the online session when possible, then remove all account-derived browser data. */
export async function signOutBrowser(
  csrfToken?: string,
  dependencies: SignOutDependencies = {
    request: fetch,
    purge: purgeAllAuthorizedData,
    clearSession: clearSessionView,
  },
) {
  let currentCsrfToken = csrfToken;
  try {
    const session = await dependencies.request('/api/v1/auth/session', {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-store' },
    });
    if (session.ok) {
      const body = (await session.json()) as { csrfToken?: string };
      currentCsrfToken = body.csrfToken ?? currentCsrfToken;
    }
    if (currentCsrfToken)
      await dependencies.request('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': currentCsrfToken },
      });
  } catch {
    // Local sign-out must remain available while the network is unavailable.
  }
  await dependencies.purge();
  dependencies.clearSession();
}
