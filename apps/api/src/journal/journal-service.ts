import {
  ciphertextEnvelopeSchema,
  journalEntryCiphertextSchema,
  journalMutationSchema,
  type JournalMutation,
} from '@naaseh/domain';
import { assertJournalOwner } from './journal-authorization.js';
import type { JournalRepository } from './journal-repository.js';

export class JournalService {
  constructor(
    private readonly repository: JournalRepository,
    private readonly hasCurrentCrisisPlan: (ownerId: string) => boolean | Promise<boolean> = (
      ownerId,
    ) => repository.hasCurrentCrisisPlan(ownerId),
  ) {}
  async read(ownerId: string, entryId: string) {
    const record = await this.repository.read(ownerId, entryId);
    if (!record) throw new Error('The journal resource is unavailable.');
    assertJournalOwner(ownerId, record.ownerId);
    return record;
  }
  async apply(ownerId: string, input: JournalMutation) {
    const mutation = journalMutationSchema.parse(input);
    const receipt = await this.repository.receipt(ownerId, mutation.id);
    if (receipt)
      return {
        mutationId: mutation.id,
        status: 'alreadyApplied' as const,
        version: receipt.version,
      };
    if (mutation.entityType === 'journalProfile') {
      const payload = ciphertextEnvelopeSchema.parse(mutation.payload);
      if (payload.recordKind !== 'profile' || mutation.entityId !== 'journal-profile')
        throw new Error('Journal profile envelope identity mismatch.');
      const current = await this.repository.profile(ownerId);
      if ((current?.version ?? 0) !== mutation.baseVersion)
        return {
          mutationId: mutation.id,
          status: 'conflict' as const,
          version: current?.version ?? 0,
          conflictKind: 'version' as const,
        };
      const record = await this.repository.saveProfile(
        ownerId,
        mutation,
        payload,
        mutation.baseVersion + 1,
      );
      return { mutationId: mutation.id, status: 'applied' as const, version: record.version };
    }
    const payload = journalEntryCiphertextSchema.parse(mutation.payload);
    if (mutation.baseVersion === 0 && !(await this.hasCurrentCrisisPlan(ownerId)))
      throw Object.assign(new Error('Create a Crisis Plan before your first journal entry.'), {
        code: 'CRISIS_PLAN_REQUIRED',
      });
    if (payload.entryId !== mutation.entityId || payload.dateToken !== mutation.dateToken)
      throw new Error('Journal envelope identity mismatch.');
    const current = await this.repository.read(ownerId, mutation.entityId);
    if ((current?.version ?? 0) !== mutation.baseVersion)
      return {
        mutationId: mutation.id,
        status: 'conflict' as const,
        version: current?.version ?? 0,
        conflictKind: 'version' as const,
      };
    const existingDateEntry = await this.repository.dateOwner(ownerId, payload.dateToken);
    if (existingDateEntry && existingDateEntry !== mutation.entityId)
      return {
        mutationId: mutation.id,
        status: 'conflict' as const,
        version: 0,
        conflictKind: 'dateToken' as const,
      };
    const record = await this.repository.save(ownerId, mutation, payload, mutation.baseVersion + 1);
    return { mutationId: mutation.id, status: 'applied' as const, version: record.version };
  }
}
