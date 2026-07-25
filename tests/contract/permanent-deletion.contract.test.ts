import { describe, expect, it } from 'vitest';
import { deletionJobSchema, deletionPreviewSchema } from '@naaseh/domain';

describe('permanent deletion contract', () => {
  it('requires an irreversible preview and exposes safe job progress', () => {
    expect(
      deletionPreviewSchema.parse({
        resourceType: 'task',
        resourceId: '01J00000000000000000000000',
        displayLabel: 'Example',
        targetVersion: 2,
        dependentCounts: { revisions: 3 },
        blockers: [],
        reportingImpact: 'Completion history will be removed.',
        irreversible: true,
        expiresAt: '2026-07-24T12:05:00.000Z',
        confirmationToken: 'signed-confirmation-token',
      }).irreversible,
    ).toBe(true);
    expect(
      deletionJobSchema.parse({
        id: '01J00000000000000000000001',
        resourceType: 'task',
        resourceId: '01J00000000000000000000000',
        requestedBy: 'owner',
        requestMutationId: 'request-1',
        targetVersion: 2,
        dependencyDigest: 'a'.repeat(64),
        status: 'purging',
        progress: 50,
        checkpoint: { stage: 'dependents' },
        createdAt: '2026-07-24T12:00:00.000Z',
        updatedAt: '2026-07-24T12:01:00.000Z',
      }).progress,
    ).toBe(50);
  });
});
