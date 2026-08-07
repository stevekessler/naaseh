import type { VectorCursor } from '@naaseh/domain';
import { db } from './database.js';
export async function readCursor(): Promise<VectorCursor> {
  const value = await db.settings.get('sync-cursor');
  return value ? JSON.parse(value.value) : {};
}
export const saveCursor = (cursor: VectorCursor) =>
  db.settings.put({ key: 'sync-cursor', value: JSON.stringify(cursor) });
export const supportedLocalSchema = (version: number) => version === 10;
