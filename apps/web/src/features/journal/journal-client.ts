import { journalKeyEnvelopeResponseSchema, journalPullResponseSchema } from '@naaseh/contracts';

async function journalFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error('The private journal is unavailable. Your encrypted local data was preserved.');
  return response.json();
}
export async function readJournalKeyEnvelope() {
  return journalKeyEnvelopeResponseSchema.parse(await journalFetch('/journal/key-envelope'));
}
export async function pullJournalChanges(journalCursor: number) {
  return journalPullResponseSchema.parse(
    await journalFetch('/sync/pull', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 5, journalCursor }),
    }),
  );
}
