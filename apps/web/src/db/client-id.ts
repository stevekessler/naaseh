import { createUlid } from '@naaseh/domain';
import { db } from './database.js';

const clientIdKey = 'clientId';
export async function getClientId(): Promise<string> {
  const current = await db.settings.get(clientIdKey);
  if (current) return current.value;
  const value = createUlid();
  try {
    await db.settings.add({ key: clientIdKey, value });
    return value;
  } catch {
    return (await db.settings.get(clientIdKey))?.value ?? value;
  }
}
