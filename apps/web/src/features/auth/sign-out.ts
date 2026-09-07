import { purgeAllAuthorizedData } from '../../sync/privacy-purge.js';
import { clearSessionView } from './session.js';

type SignOutDependencies = {
  request: typeof fetch;
  purge: () => Promise<void>;
  clearSession: () => void;
};

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
