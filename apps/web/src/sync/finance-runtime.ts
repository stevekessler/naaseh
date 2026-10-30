import { db, type EncryptedFinanceRecord } from '../db/database.js';
import {
  financeDeviceKey,
  encryptFinanceRecord,
  decryptFinanceRecord,
} from '../db/finance-repository.js';
import { clearFinanceSearchIndexes } from '../search/finance-index-lifecycle.js';
interface Projection {
  id: string;
  entityType: string;
  scopeKey: string;
  version: number;
  value: unknown;
  accountId?: string;
  budgetId?: string;
}

/** Fetch every page before replacing a device snapshot. No partial authorized view is rendered. */
export async function pullFinanceSnapshot(fetcher: typeof fetch = fetch) {
  const known = await db.settings.get('finance-snapshot-token');
  let token = '';
  let records: Projection[] = [];
  let scopes: string[] = [];
  let cursor: string | null = null;
  let digest = '';
  do {
    const response = await fetcher(
      `/api/v1/finance/sync/bootstrap${cursor ? `?cursor=${encodeURIComponent(cursor)}` : known ? `?known=${encodeURIComponent(known.value)}` : ''}`,
      { credentials: 'include', cache: 'no-store' },
    );
    if (response.status === 304) return;
    clearFinanceSearchIndexes();
    if (!response.ok) {
      clearFinanceSearchIndexes();
      if (response.status === 401 || response.status === 403) {
        await db.transaction('rw', db.secureFinanceRecords, db.outbox, db.settings, async () => {
          await db.secureFinanceRecords.clear();
          await db.outbox.filter((row) => row.entityType.startsWith('finance')).delete();
          await db.settings.delete('finance-snapshot-token');
        });
        if (typeof window !== 'undefined')
          window.dispatchEvent(
            new CustomEvent('finance-sync', { detail: { authorization: 'denied' } }),
          );
      }
      throw new Error('Finance synchronization could not be completed.');
    }
    const page = (await response.json()) as {
      records: Projection[];
      scopes: string[];
      nextCursor: string | null;
      digest: string;
      token?: string;
    };
    if (digest && digest !== page.digest)
      throw new Error('Finance snapshot changed. Retry synchronization.');
    digest = page.digest;
    token = page.token ?? '';
    records = records.concat(page.records);
    scopes = page.scopes;
    cursor = page.nextCursor;
  } while (cursor);
  const allowed = new Set(scopes),
    ids = new Set(records.map((item) => item.id));
  const accounts = new Set(
    records.filter((item) => item.entityType === 'financeAccount').map((item) => item.id),
  );
  const key = await financeDeviceKey();
  const encrypted: EncryptedFinanceRecord[] = await Promise.all(
    records.map((record) =>
      encryptFinanceRecord({ ...record, updatedAt: new Date().toISOString(), key }),
    ),
  );
  const local = await db.secureFinanceRecords.toArray();
  const revoked = new Set<string>();
  for (const row of local) {
    if (ids.has(row.id) || row.scopeKey === 'PUBLIC') continue;
    let permitted = allowed.has(row.scopeKey);
    if (permitted) {
      const value = (await decryptFinanceRecord(row, key)) as {
        relatedAccountIds?: string[];
        accountId?: string;
      };
      if (value.accountId && !accounts.has(value.accountId)) permitted = false;
      if (value.relatedAccountIds?.some((id) => !accounts.has(id))) permitted = false;
    }
    if (!permitted) revoked.add(row.id);
  }
  clearFinanceSearchIndexes();
  await db.transaction(
    'rw',
    db.secureFinanceRecords,
    db.outbox,
    db.settings,
    db.secureConflicts,
    async () => {
      for (const conflict of await db.secureConflicts.toArray()) {
        if (
          conflict.financeScopeKey &&
          (!allowed.has(conflict.financeScopeKey) ||
            conflict.financeAccountIds?.some((id) => !accounts.has(id)))
        )
          await db.secureConflicts.delete(conflict.id);
      }
      for (const id of revoked) await db.outbox.where('entityId').equals(id).delete();
      const pending = new Set(
        (await db.outbox.toArray())
          .filter((item) => item.entityType.startsWith('finance'))
          .map((item) => item.entityId),
      );
      // A queued child advances its parent's optimistic version as well.
      for (const row of local) if (pending.has(row.id) && row.budgetId) pending.add(row.budgetId);
      for (const row of local)
        if (revoked.has(row.id) || (!ids.has(row.id) && !pending.has(row.id)))
          await db.secureFinanceRecords.delete(row.id);
      for (const row of encrypted) if (!pending.has(row.id)) await db.secureFinanceRecords.put(row);
      await db.settings.put({ key: 'finance-snapshot-digest', value: digest });
      if (token) await db.settings.put({ key: 'finance-snapshot-token', value: token });
    },
  );
  if (typeof window !== 'undefined')
    window.dispatchEvent(
      new CustomEvent('finance-sync', {
        detail: {
          authorization: JSON.stringify(
            records
              .filter((record) =>
                [
                  'financeAccount',
                  'financeBudget',
                  'financeBudgetItem',
                  'financeTaskLink',
                ].includes(record.entityType),
              )
              .map((record) => [record.id, record.scopeKey])
              .sort(),
          ),
        },
      }),
    );
}
