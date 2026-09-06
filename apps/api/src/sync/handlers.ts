import {
  journalKeyEnvelopeSchema,
  type JournalKeyEnvelope,
  type JournalMutation,
} from '@naaseh/domain';
import { JournalService } from '../journal/journal-service.js';
import type { JournalRepository } from '../journal/journal-repository.js';

export function createJournalSyncHandlers(repository: JournalRepository) {
  const service = new JournalService(repository);
  return {
    async push(ownerId: string, mutations: JournalMutation[]) {
      return {
        version: 5 as const,
        results: await Promise.all(mutations.map((mutation) => service.apply(ownerId, mutation))),
      };
    },
    async pull(ownerId: string, cursor: number, limit = 100) {
      const feed = await repository.changes(ownerId, cursor, limit);
      return {
        version: 5 as const,
        changes: feed.rows,
        journalCursor: feed.cursor,
        hasMore: feed.hasMore,
      };
    },
    async bootstrap(ownerId: string) {
      const [records, changes] = await Promise.all([
        repository.bootstrap(ownerId),
        repository.changes(ownerId, 0),
      ]);
      return {
        version: 5 as const,
        records,
        journalCursor: changes.cursor,
      };
    },
    async readKeyEnvelope(ownerId: string) {
      const envelope = await repository.keyEnvelope(ownerId);
      if (!envelope) throw new Error('The journal resource is unavailable.');
      return envelope;
    },
    async writeKeyEnvelope(ownerId: string, input: JournalKeyEnvelope, baseVersion: number) {
      const envelope = journalKeyEnvelopeSchema.parse(input);
      if (envelope.ownerId !== ownerId) throw new Error('The journal resource is unavailable.');
      const saved = await repository.saveKeyEnvelope(ownerId, envelope, baseVersion);
      if (!saved) throw new Error('The journal key envelope changed.');
      return saved;
    },
  };
}
