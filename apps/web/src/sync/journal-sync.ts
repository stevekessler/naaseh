import { journalMutationRequestSchema, journalPullResponseSchema } from '@naaseh/contracts';
import { journalSyncContractVersion } from '@naaseh/domain';
import { db } from '../db/database.js';
import { acknowledgeJournalMutation } from '../db/journal-repository.js';
import type { JournalEntryCiphertext } from '../db/journal-types.js';

type JournalMutation = ReturnType<typeof journalMutationRequestSchema.parse>;

export function prepareJournalMutationForSync(value: unknown): JournalMutation {
  const mutation = journalMutationRequestSchema.parse(value);
  if (
    mutation.entityType !== 'journalEntry' ||
    mutation.dateToken ||
    !('dateToken' in mutation.payload)
  )
    return mutation;
  return journalMutationRequestSchema.parse({
    ...mutation,
    dateToken: mutation.payload.dateToken,
  });
}

export async function drainJournalOutbox(ownerId: string, csrfToken: string) {
  if (!navigator.onLine) return;
  const pending = await db.secureJournalOutbox.where('ownerId').equals(ownerId).sortBy('updatedAt');
  for (const row of pending) {
    // Early clients stored the entry token only inside the encrypted payload. Repair those
    // pending mutations at the network boundary so Retry can safely drain their outboxes.
    const mutation = prepareJournalMutationForSync(row.value);
    const response = await fetch('/api/v1/sync/push', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        version: journalSyncContractVersion,
        clientId: 'journal-browser',
        mutations: [mutation],
      }),
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
      await db.transaction('rw', db.secureJournalConflicts, async () => {
        await db.secureJournalConflicts.put({
          id: `journal:${mutation.entityId}`,
          ownerId,
          entityType: 'journalConflict',
          mutationId: mutation.id,
          updatedAt: new Date().toISOString(),
          value: {
            entityId: mutation.entityId,
            remoteVersion: result.version,
            localMutationIds: [mutation.id],
            localCiphertext: mutation.payload,
            kind: result.conflictKind ?? 'version',
          },
        });
      });
    else throw new Error('Journal synchronization was rejected; encrypted changes remain pending.');
  }
}
const journalCursorKey = (ownerId: string) => `journal-cursor:${ownerId}`;

export async function readJournalCursor(ownerId: string) {
  const saved = await db.settings.get(journalCursorKey(ownerId));
  const cursor = Number(saved?.value ?? 0);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

export async function pullJournalCiphertext(
  ownerId: string,
  journalCursor: number,
  fetcher: typeof fetch = fetch,
) {
  if (!navigator.onLine) return journalCursor;
  let cursor = journalCursor;
  for (;;) {
    const response = await fetcher('/api/v1/sync/pull', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: journalSyncContractVersion, journalCursor: cursor }),
    });
    if (!response.ok) throw new Error('Journal updates are unavailable.');
    const body = journalPullResponseSchema.parse(await response.json());
    if (body.journalCursor < cursor || (body.hasMore && body.journalCursor === cursor))
      throw new Error('Journal synchronization did not advance safely.');
    await db.transaction(
      'rw',
      [
        db.secureJournalEntries,
        db.secureJournalProfiles,
        db.secureJournalConflicts,
        db.secureJournalOutbox,
        db.settings,
      ],
      async () => {
        const pending = await db.secureJournalOutbox.where('ownerId').equals(ownerId).toArray();
        const pendingByEntity = new Map<string, typeof pending>();
        for (const row of pending) {
          const mutation = row.value as JournalMutation;
          const rows = pendingByEntity.get(mutation.entityId) ?? [];
          rows.push(row);
          pendingByEntity.set(mutation.entityId, rows);
        }
        for (const change of body.changes) {
          const localPending = pendingByEntity.get(change.entityId) ?? [];
          if (localPending.length) {
            await db.secureJournalConflicts.put({
              id: `journal:${change.entityId}`,
              ownerId,
              entityType: 'journalConflict',
              updatedAt: new Date().toISOString(),
              value: {
                kind: 'remoteChangedWhilePending',
                entityId: change.entityId,
                remoteVersion: change.entityVersion,
                remoteOperation: change.operation,
                remoteCiphertext: change.payload,
                localMutationIds: localPending.map((row) => row.id),
              },
            });
            continue;
          }
          if (change.entityType === 'journalEntry') {
            const payload = change.payload as JournalEntryCiphertext;
            await db.secureJournalEntries.put({
              id: change.entityId,
              ownerId,
              entityType: 'journalEntry',
              dateToken: payload.dateToken,
              lifecycle: change.operation === 'recycle' ? 'recycled' : 'active',
              version: change.entityVersion,
              updatedAt: new Date().toISOString(),
              value: payload,
            });
          } else
            await db.secureJournalProfiles.put({
              id: `journal-profile:${ownerId}`,
              ownerId,
              entityType: 'journalProfile',
              version: change.entityVersion,
              updatedAt: new Date().toISOString(),
              value: change.payload,
            });
        }
        await db.settings.put({
          key: journalCursorKey(ownerId),
          value: String(body.journalCursor),
        });
      },
    );
    cursor = body.journalCursor;
    if (!body.hasMore) return cursor;
  }
}

export async function synchronizeJournalCiphertext(ownerId: string, fetcher: typeof fetch = fetch) {
  return pullJournalCiphertext(ownerId, await readJournalCursor(ownerId), fetcher);
}
