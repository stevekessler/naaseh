import { journalMutationRequestSchema, journalPullResponseSchema } from '@naaseh/contracts';
import { db } from '../db/database.js';
import { acknowledgeJournalMutation } from '../db/journal-repository.js';

type JournalMutation = ReturnType<typeof journalMutationRequestSchema.parse>;
export async function drainJournalOutbox(ownerId: string, csrfToken: string) {
  if (!navigator.onLine) return;
  const pending = await db.secureJournalOutbox.where('ownerId').equals(ownerId).sortBy('updatedAt');
  for (const row of pending) {
    const mutation = row.value as JournalMutation;
    const response = await fetch('/api/v1/sync/push', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ version: 5, clientId: 'journal-browser', mutations: [mutation] }),
    });
    if (!response.ok)
      throw new Error('Journal synchronization is unavailable; encrypted changes remain pending.');
    const result = (
      (await response.json()) as {
        results: Array<{ status: string; version?: number; conflictKind?: string }>;
      }
    ).results[0];
    if (result?.status === 'applied' || result?.status === 'alreadyApplied')
      await acknowledgeJournalMutation(
        ownerId,
        mutation.id,
        result.version ?? mutation.baseVersion + 1,
      );
    else if (result?.status === 'conflict')
      await db.transaction('rw', db.secureJournalConflicts, db.secureJournalOutbox, async () => {
        await db.secureJournalConflicts.put({
          id: mutation.id,
          ownerId,
          entityType: 'journalConflict',
          mutationId: mutation.id,
          updatedAt: new Date().toISOString(),
          value: { localCiphertext: mutation.payload, kind: result.conflictKind ?? 'version' },
        });
        await db.secureJournalOutbox.delete(mutation.id);
      });
    else throw new Error('Journal synchronization was rejected; encrypted changes remain pending.');
  }
}
export async function pullJournalCiphertext(ownerId: string, journalCursor: number) {
  if (!navigator.onLine) return journalCursor;
  const response = await fetch('/api/v1/sync/pull', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 5, journalCursor }),
  });
  if (!response.ok) throw new Error('Journal updates are unavailable.');
  const body = journalPullResponseSchema.parse(await response.json());
  await db.transaction('rw', db.secureJournalEntries, db.secureJournalProfiles, async () => {
    for (const change of body.changes) {
      if (change.entityType === 'journalEntry')
        await db.secureJournalEntries.put({
          id: change.entityId,
          ownerId,
          entityType: 'journalEntry',
          version: change.entityVersion,
          updatedAt: new Date().toISOString(),
          value: change.payload,
        });
      else
        await db.secureJournalProfiles.put({
          id: `journal-profile:${ownerId}`,
          ownerId,
          entityType: 'journalProfile',
          version: change.entityVersion,
          updatedAt: new Date().toISOString(),
          value: change.payload,
        });
    }
  });
  return body.journalCursor;
}
