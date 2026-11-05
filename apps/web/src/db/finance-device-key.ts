import Dexie from 'dexie';
import { db } from './database.js';
import { createDeviceKey } from '../crypto/vault.js';

/** Security bootstrap only; Finance data consumers use the guarded repository export. */
export async function financeBootstrapDeviceKey(): Promise<CryptoKey> {
  return Dexie.ignoreTransaction(async () => {
    const stored = await db.cryptoKeys.get('device');
    if (stored) return stored.key;
    const candidate = await createDeviceKey();
    return db.transaction('rw', db.cryptoKeys, async () => {
      const winner = await db.cryptoKeys.get('device');
      if (winner) return winner.key;
      await db.cryptoKeys.add({ id: 'device', key: candidate });
      return candidate;
    });
  });
}
