import { journalKeyEnvelopeResponseSchema, journalPullResponseSchema } from '@naaseh/contracts';
import type { JournalKeyEnvelope } from '@naaseh/domain';

export class JournalClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function journalFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok)
    throw new JournalClientError(
      'The private journal is unavailable. Your encrypted local data was preserved.',
      response.status,
    );
  return response.json();
}
export async function readJournalKeyEnvelope() {
  return journalKeyEnvelopeResponseSchema.parse(await journalFetch('/journal/key-envelope'));
}
export async function findJournalKeyEnvelope() {
  try {
    return await readJournalKeyEnvelope();
  } catch (error) {
    if (error instanceof JournalClientError && error.status === 404) return undefined;
    throw error;
  }
}
export async function writeJournalKeyEnvelope(envelope: JournalKeyEnvelope, csrfToken: string) {
  return journalKeyEnvelopeResponseSchema.parse(
    await journalFetch('/journal/key-envelope', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify(envelope),
    }),
  );
}
export async function fetchJournalRecoveryRegistry() {
  const body = await journalFetch('/sync/bootstrap');
  if (!body || typeof body !== 'object' || !('keyRegistry' in body))
    throw new Error('The Journal recovery-key registry is unavailable.');
  return body.keyRegistry;
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
