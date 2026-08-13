import { db } from '../db/database.js';

type ApplyUpdate = () => void;
let pendingUpdate: ApplyUpdate | undefined;
const updateListeners = new Set<(apply: ApplyUpdate) => void>();

export function announceServiceWorkerUpdate(apply: ApplyUpdate) {
  pendingUpdate = apply;
  for (const listener of updateListeners) listener(apply);
}

export function subscribeToServiceWorkerUpdate(listener: (apply: ApplyUpdate) => void) {
  updateListeners.add(listener);
  if (pendingUpdate) listener(pendingUpdate);
  return () => {
    updateListeners.delete(listener);
  };
}

export async function safeToActivateUpdate(hasOpenEdits: boolean) {
  return !hasOpenEdits && (await db.outbox.count()) === 0;
}
export const shouldCacheRequest = (request: Request) =>
  request.method === 'GET' &&
  !request.url.includes('/api/v1/attachments/') &&
  !request.url.includes('X-Amz-Signature');
