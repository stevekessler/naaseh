import type { JournalEntryCiphertext, JournalMutation } from './journal-types.js';
import { db, type EncryptedJournalRecord } from './database.js';
import type { LocalJournalOwnerWrap } from '../crypto/journal-crypto.js';
import type { CiphertextEnvelope } from '@naaseh/domain';

const protectedJournalPlaintextKeys = new Set([
  'date',
  'notes',
  'generalNotes',
  'taskReflection',
  'suicidalThoughts',
  'suicidalBehaviors',
  'selfHarmThoughts',
  'selfHarmBehaviors',
  'emotions',
  'dbt',
  'taskId',
]);
export function assertCiphertextOnlyJournalRecord(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) assertCiphertextOnlyJournalRecord(child);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (protectedJournalPlaintextKeys.has(key))
      throw new Error('Journal plaintext cannot be persisted outside ciphertext.');
    assertCiphertextOnlyJournalRecord(child);
  }
}
export function journalDraftSyncState(byteSize: number) {
  return byteSize > 307_200
    ? { status: 'oversized-local-draft' as const, preserved: true, pending: true }
    : { status: 'pending' as const, preserved: true, pending: true };
}

export async function saveLocalJournalOwnerWrap(ownerId: string, ownerWrap: LocalJournalOwnerWrap) {
  return db.secureJournalKeyEnvelopes.put({
    id: `journal-key:${ownerId}`,
    ownerId,
    entityType: 'journalKeyEnvelope',
    version: 1,
    updatedAt: new Date().toISOString(),
    value: ownerWrap,
  });
}
export async function readLocalJournalOwnerWrap(
  ownerId: string,
): Promise<LocalJournalOwnerWrap | undefined> {
  const row = await db.secureJournalKeyEnvelopes.get(`journal-key:${ownerId}`);
  return row?.ownerId === ownerId ? (row.value as LocalJournalOwnerWrap) : undefined;
}
export async function readEncryptedJournalProfile(ownerId: string) {
  const row = await db.secureJournalProfiles.get(`journal-profile:${ownerId}`);
  return row?.ownerId === ownerId ? row : undefined;
}
export async function saveEncryptedJournalProfile(
  ownerId: string,
  envelope: CiphertextEnvelope,
  baseVersion: number,
) {
  const now = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  await db.transaction('rw', db.secureJournalProfiles, db.secureJournalOutbox, async () => {
    await db.secureJournalProfiles.put({
      id: `journal-profile:${ownerId}`,
      ownerId,
      entityType: 'journalProfile',
      version: baseVersion,
      updatedAt: now,
      value: envelope,
    });
    await db.secureJournalOutbox.put({
      id: mutationId,
      ownerId,
      entityType: 'journalMutation',
      mutationId,
      updatedAt: now,
      value: {
        id: mutationId,
        entityType: 'journalProfile',
        operation: 'upsert',
        entityId: 'journal-profile',
        baseVersion,
        payload: envelope,
        createdAt: now,
      },
    });
  });
}

export async function savePendingJournalEntry(input: {
  ownerId: string;
  entry: JournalEntryCiphertext;
  mutation: JournalMutation;
}) {
  assertCiphertextOnlyJournalRecord(input.entry);
  const existing = await db.secureJournalEntries
    .where('[ownerId+dateToken]')
    .equals([input.ownerId, input.entry.dateToken])
    .first();
  if (existing && existing.id !== input.entry.entryId)
    throw new Error('A journal entry already exists for that date.');
  const updatedAt = new Date().toISOString();
  const record: EncryptedJournalRecord = {
    id: input.entry.entryId,
    ownerId: input.ownerId,
    entityType: 'journalEntry',
    dateToken: input.entry.dateToken,
    version: input.mutation.baseVersion,
    updatedAt,
    value: input.entry,
  };
  const outbox: EncryptedJournalRecord = {
    id: input.mutation.id,
    ownerId: input.ownerId,
    entityType: 'journalMutation',
    mutationId: input.mutation.id,
    updatedAt,
    value: input.mutation,
  };
  await db.transaction('rw', db.secureJournalEntries, db.secureJournalOutbox, async () => {
    await db.secureJournalEntries.put(record);
    await db.secureJournalOutbox.put(outbox);
  });
  return record;
}
export const listEncryptedJournalEntries = (ownerId: string) =>
  db.secureJournalEntries.where('ownerId').equals(ownerId).toArray();
export async function acknowledgeJournalMutation(
  ownerId: string,
  mutationId: string,
  version: number,
) {
  const pending = await db.secureJournalOutbox.get(mutationId);
  if (!pending || pending.ownerId !== ownerId) return;
  const mutation = pending.value as JournalMutation;
  await db.transaction('rw', db.secureJournalEntries, db.secureJournalOutbox, async () => {
    await db.secureJournalEntries.update(mutation.entityId, { version });
    await db.secureJournalOutbox.delete(mutationId);
  });
}
export async function purgeJournalOwner(ownerId: string) {
  await db.transaction(
    'rw',
    [
      db.secureJournalEntries,
      db.secureJournalProfiles,
      db.secureJournalKeyEnvelopes,
      db.secureJournalConflicts,
      db.secureJournalOutbox,
    ],
    async () => {
      for (const store of [
        db.secureJournalEntries,
        db.secureJournalProfiles,
        db.secureJournalKeyEnvelopes,
        db.secureJournalConflicts,
        db.secureJournalOutbox,
      ])
        await store.where('ownerId').equals(ownerId).delete();
    },
  );
}
