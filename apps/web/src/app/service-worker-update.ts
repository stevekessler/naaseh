import { db } from '../db/database.js';

export type ApplyUpdate = () => void | Promise<void>;
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
  if (hasOpenEdits) return false;
  // Wait for preceding local writes to commit. Pending mutations stay in IndexedDB
  // across a shell reload; requiring successful network sync deadlocks broken clients.
  await db.transaction('r', db.tables, async () => {});
  return true;
}
export const shouldCacheRequest = (request: Request) =>
  request.method === 'GET' &&
  !request.url.includes('/api/v1/attachments/') &&
  !request.url.includes('X-Amz-Signature');
