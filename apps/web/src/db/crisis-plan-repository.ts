import type { CrisisPlanMutation, CrisisPlanRecord } from '@naaseh/domain';
import { db, type EncryptedCrisisPlanRecord } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

export interface CrisisPlanAccessIntent {
  id: string;
  ownerId: string;
  planId: CrisisPlanRecord['planId'];
  operation: 'revoke';
  recipientId: string;
  createdAt: string;
}
export interface CrisisPlanConflict {
  id: string;
  ownerId: string;
  localMutation: CrisisPlanMutation;
  remote: CrisisPlanRecord;
  createdAt: string;
}

const protectedKeys = new Set([
  'html',
  'content',
  'document',
  'plan',
  'recipientDisplayName',
  'recipientUsername',
  'suicidalBehaviors',
  'selfHarmBehaviors',
]);
export function assertCiphertextOnlyCrisisPlan(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) assertCiphertextOnlyCrisisPlan(child);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (protectedKeys.has(key)) throw new Error('Crisis Plan plaintext cannot be persisted.');
    assertCiphertextOnlyCrisisPlan(child);
  }
}

export async function readLocalCrisisPlan(
  ownerId: string,
): Promise<EncryptedCrisisPlanRecord | undefined> {
  return db.secureCrisisPlans.where('ownerId').equals(ownerId).first();
}

export async function savePendingCrisisPlan(
  ownerId: string,
  record: CrisisPlanRecord,
  mutation: CrisisPlanMutation,
) {
  assertCiphertextOnlyCrisisPlan(record);
  const now = new Date().toISOString();
  const planRow: EncryptedCrisisPlanRecord = {
    id: record.planId,
    ownerId,
    entityType: 'crisisPlan',
    version: record.version,
    updatedAt: now,
    value: record,
  };
  const mutationRow: EncryptedCrisisPlanRecord = {
    id: mutation.id,
    ownerId,
    entityType: 'crisisPlanMutation',
    mutationId: mutation.id,
    updatedAt: now,
    value: await encryptLocalValue('crisisPlanMutation', mutation.id, mutation),
  };
  await db.transaction('rw', db.secureCrisisPlans, db.secureCrisisPlanOutbox, async () => {
    await db.secureCrisisPlans.put(planRow);
    await db.secureCrisisPlanOutbox.put(mutationRow);
  });
  return planRow;
}

export async function storeAcknowledgedCrisisPlan(ownerId: string, record: CrisisPlanRecord) {
  assertCiphertextOnlyCrisisPlan(record);
  await db.secureCrisisPlans.put({
    id: record.planId,
    ownerId,
    entityType: 'crisisPlan',
    version: record.version,
    updatedAt: record.updatedAt,
    value: record,
  });
}

export async function acknowledgeCrisisPlanMutation(
  ownerId: string,
  mutationId: string,
  version: number,
) {
  const pending = await db.secureCrisisPlanOutbox.get(mutationId);
  if (!pending || pending.ownerId !== ownerId) return;
  const mutation = await decryptLocalValue<CrisisPlanMutation>(
    'crisisPlanMutation',
    mutationId,
    pending.value as import('../crypto/vault.js').Ciphertext,
  );
  await db.transaction('rw', db.secureCrisisPlans, db.secureCrisisPlanOutbox, async () => {
    await db.secureCrisisPlans.update(mutation.planId, { version });
    await db.secureCrisisPlanOutbox.delete(mutationId);
  });
}

export async function listPendingCrisisPlanMutations(ownerId: string) {
  const rows = await db.secureCrisisPlanOutbox
    .where('ownerId')
    .equals(ownerId)
    .filter((row) => row.entityType === 'crisisPlanMutation')
    .sortBy('updatedAt');
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      value: await decryptLocalValue<CrisisPlanMutation>(
        'crisisPlanMutation',
        row.id,
        row.value as import('../crypto/vault.js').Ciphertext,
      ),
    })),
  );
}

export async function preserveCrisisPlanConflict(
  ownerId: string,
  localMutation: CrisisPlanMutation,
  remote: CrisisPlanRecord,
) {
  const conflict: CrisisPlanConflict = {
    id: localMutation.id,
    ownerId,
    localMutation,
    remote,
    createdAt: new Date().toISOString(),
  };
  await db.secureCrisisPlanOutbox.put({
    id: conflict.id,
    ownerId,
    entityType: 'crisisPlanConflict',
    mutationId: conflict.id,
    updatedAt: conflict.createdAt,
    value: await encryptLocalValue('crisisPlanConflict', conflict.id, conflict),
  });
  return conflict;
}
export async function listCrisisPlanConflicts(ownerId: string) {
  const rows = await db.secureCrisisPlanOutbox
    .where('ownerId')
    .equals(ownerId)
    .filter((row) => row.entityType === 'crisisPlanConflict')
    .sortBy('updatedAt');
  return Promise.all(
    rows.map((row) =>
      decryptLocalValue<CrisisPlanConflict>(
        'crisisPlanConflict',
        row.id,
        row.value as import('../crypto/vault.js').Ciphertext,
      ),
    ),
  );
}
export const acknowledgeCrisisPlanConflict = (id: string) => db.secureCrisisPlanOutbox.delete(id);

export async function queueCrisisPlanAccessIntent(
  ownerId: string,
  planId: CrisisPlanRecord['planId'],
  recipientId: string,
) {
  const intent: CrisisPlanAccessIntent = {
    id: crypto.randomUUID(),
    ownerId,
    planId,
    operation: 'revoke',
    recipientId,
    createdAt: new Date().toISOString(),
  };
  await db.secureCrisisPlanOutbox.put({
    id: intent.id,
    ownerId,
    entityType: 'crisisPlanAccessIntent',
    mutationId: intent.id,
    updatedAt: intent.createdAt,
    value: await encryptLocalValue('crisisPlanAccessIntent', intent.id, intent),
  });
  return intent;
}
export async function listCrisisPlanAccessIntents(ownerId: string) {
  const rows = await db.secureCrisisPlanOutbox
    .where('ownerId')
    .equals(ownerId)
    .filter((row) => row.entityType === 'crisisPlanAccessIntent')
    .sortBy('updatedAt');
  return Promise.all(
    rows.map((row) =>
      decryptLocalValue<CrisisPlanAccessIntent>(
        'crisisPlanAccessIntent',
        row.id,
        row.value as import('../crypto/vault.js').Ciphertext,
      ),
    ),
  );
}
export const acknowledgeCrisisPlanAccessIntent = (id: string) =>
  db.secureCrisisPlanOutbox.delete(id);
export async function purgeCrisisPlanOwner(ownerId: string) {
  await db.transaction(
    'rw',
    db.secureCrisisPlans,
    db.secureCrisisPlanOutbox,
    db.secureCrisisPlanOwnerKeys,
    async () => {
      await db.secureCrisisPlans.where('ownerId').equals(ownerId).delete();
      await db.secureCrisisPlanOutbox.where('ownerId').equals(ownerId).delete();
      await db.secureCrisisPlanOwnerKeys.where('ownerId').equals(ownerId).delete();
    },
  );
}
