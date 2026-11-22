import Dexie from 'dexie';
import {
  featureDatabaseName,
  featureDatabaseSchema,
  featureDatabaseVersion,
} from '@naaseh/contacts-inventory-contracts';

export async function featureQueueCounts(account: string) {
  if (!(await Dexie.exists(featureDatabaseName))) return { pending: 0, conflicts: 0 };
  const db = new Dexie(featureDatabaseName);
  db.version(featureDatabaseVersion).stores(featureDatabaseSchema);
  try {
    const rows = await db
      .table<{ status: string }>('outbox')
      .where('account')
      .equals(account)
      .toArray();
    return {
      pending: rows.filter((row) => row.status === 'pending').length,
      conflicts: rows.filter((row) => row.status === 'conflict' || row.status === 'reset_required')
        .length,
    };
  } finally {
    db.close();
  }
}

export async function clearFeatureLocalState() {
  if (await Dexie.exists(featureDatabaseName)) await Dexie.delete(featureDatabaseName);
}
