import Dexie from 'dexie';
import { db } from './database.js';
import { financeBootstrapDeviceKey } from './finance-device-key.js';
import { decryptText, encryptText } from '../crypto/vault.js';
import type {
  FinanceOfflineState,
  FinanceOfflineStore,
} from '../features/finance/security/finance-access-controller.js';

const associatedData = (ownerId: string, revision: number) =>
  `finance-offline-security:${ownerId}:v${revision}`;

/** Bootstrap metadata only: this never decrypts Finance records or changes the device key/outbox. */
export function createFinanceOfflineSecurityStore(
  keyForOwner = financeBootstrapDeviceKey,
): FinanceOfflineStore {
  return {
    async read(ownerId) {
      const row = await db.secureFinanceOfflineSecurity.get(ownerId);
      if (!row) return undefined;
      const key = await keyForOwner();
      const state = JSON.parse(
        await decryptText(row.value, key, associatedData(ownerId, row.revision)),
      ) as FinanceOfflineState;
      if (state.ownerId !== ownerId || state.revision !== row.revision)
        throw new Error('Connect to refresh Finance security.');
      return state;
    },
    async update(ownerId, change) {
      const key = await keyForOwner();
      // The read/modify/write transaction serializes offline attempt leases across tabs.
      // Only small AES metadata work occurs here; Argon2 always runs outside this transaction.
      return db.transaction('rw', db.secureFinanceOfflineSecurity, async () => {
        const row = await db.secureFinanceOfflineSecurity.get(ownerId);
        const current = row
          ? (JSON.parse(
              await Dexie.waitFor(
                decryptText(row.value, key, associatedData(ownerId, row.revision)),
              ),
            ) as FinanceOfflineState)
          : undefined;
        if (current && (current.ownerId !== ownerId || current.revision !== row?.revision))
          throw new Error('Connect to refresh Finance security.');
        const next = change(current);
        if (next.ownerId !== ownerId || !Number.isSafeInteger(next.revision) || next.revision < 0)
          throw new Error('Invalid Finance security metadata.');
        const serialized = JSON.stringify(next);
        if (new TextEncoder().encode(serialized).byteLength > 8_192)
          throw new Error('Finance security metadata is too large.');
        const value = await Dexie.waitFor(
          encryptText(serialized, key, associatedData(ownerId, next.revision)),
        );
        await db.secureFinanceOfflineSecurity.put({
          ownerId,
          revision: next.revision,
          updatedAt: new Date().toISOString(),
          value,
        });
        return next;
      });
    },
    async remove(ownerId) {
      await db.secureFinanceOfflineSecurity.delete(ownerId);
    },
  };
}
