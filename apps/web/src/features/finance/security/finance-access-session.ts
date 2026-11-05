import { financeSecurityResponseSchema } from '@naaseh/contracts';
import { createFinanceOfflineSecurityStore } from '../../../db/finance-security-repository.js';
import { FinanceAccessController } from './finance-access-controller.js';
import { installFinanceAccess } from './finance-access.js';

export async function refreshFinanceSecurity(controller: FinanceAccessController, ownerId: string) {
  const [preferenceResponse, sessionResponse] = await Promise.all([
    fetch('/api/v1/auth/finance-security', { credentials: 'include', cache: 'no-store' }),
    fetch('/api/v1/auth/session', { credentials: 'include', cache: 'no-store' }),
  ]);
  if (!preferenceResponse.ok || !sessionResponse.ok)
    throw new Error('Connect to refresh Finance security.');
  const preference = financeSecurityResponseSchema.parse(await preferenceResponse.json());
  const session = (await sessionResponse.json()) as {
    user?: { id?: string; sessionEpoch?: number };
  };
  if (session.user?.id !== ownerId)
    throw new Error('Sign in to the same account to unlock Finance.');
  await controller.synchronize({ ...preference, sessionEpoch: session.user.sessionEpoch ?? 0 });
}

/** A channel carries lock notices only. Grants and verification material are never broadcast. */
export function createBrowserFinanceAccess(ownerId: string, csrfToken: string) {
  const channel = new BroadcastChannel('naaseh-finance-lock');
  const controller = new FinanceAccessController({
    ownerId,
    revoke: async (grant) => {
      if (!navigator.onLine) return;
      await fetch('/api/v1/auth/finance-unlocks/current', {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'x-csrf-token': csrfToken, 'x-finance-unlock': grant },
      });
    },
    store: createFinanceOfflineSecurityStore(),
    unlock: async (pin, tabNonce, signal) => {
      const response = await fetch('/api/v1/auth/finance-unlocks', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        signal,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ pin, tabNonce }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Wait before trying the Finance PIN again.'
            : 'Unable to unlock Finance. Check the PIN and try again.',
        );
      return response.json();
    },
    notifyLock: (securityChanged) =>
      channel.postMessage({ ownerId, securityChanged: securityChanged === true }),
    subscribeLock: (listener) => {
      channel.onmessage = (
        event: MessageEvent<{ ownerId?: string; securityChanged?: boolean }>,
      ) => {
        if (event.data?.ownerId === ownerId) listener(event.data.securityChanged === true);
      };
      return () => channel.close();
    },
  });
  installFinanceAccess(controller);
  return controller;
}
