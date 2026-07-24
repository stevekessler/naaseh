import { db } from '../db/database.js';
export async function safeToActivateUpdate(hasOpenEdits: boolean) {
  return !hasOpenEdits && (await db.outbox.count()) === 0;
}
export const shouldCacheRequest = (request: Request) =>
  request.method === 'GET' &&
  !request.url.includes('/api/v1/attachments/') &&
  !request.url.includes('X-Amz-Signature');
