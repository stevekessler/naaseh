import type { CiphertextEnvelope } from '@naaseh/domain';

export interface JournalEntryCiphertext {
  entryId: string;
  dateToken: string;
  projection: CiphertextEnvelope;
  body: CiphertextEnvelope;
}
export interface JournalMutation {
  id: string;
  entityId: string;
  entityType: 'journalEntry' | 'journalProfile';
  operation: 'upsert';
  baseVersion: number;
  payload: JournalEntryCiphertext | CiphertextEnvelope;
  createdAt: string;
}
