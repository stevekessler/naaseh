import { describe, expect, it } from 'vitest';
import {
  archiveProjectReportingContractVersion,
  enhancedMutationSchema,
  pushRequestSchema,
} from '@naaseh/contracts';
import { isSupportedEntityType, mutationOperationSchema } from '@naaseh/domain';

const mutation = {
  id: '01J00000000000000000000001',
  entityId: '01J00000000000000000000002',
  entityType: 'project',
  operation: 'assignProject',
  baseVersion: 1,
  payload: { projectId: '01J00000000000000000000020' },
  createdAt: '2026-07-24T12:00:00.000Z',
  attempts: 0,
};

describe('archive/project sync v3', () => {
  it('negotiates v3 and accepts new synchronized entity and semantic operation types', () => {
    expect(archiveProjectReportingContractVersion).toBe(3);
    expect(isSupportedEntityType('project')).toBe(true);
    expect(isSupportedEntityType('completionEvent')).toBe(true);
    expect(isSupportedEntityType('deletionJob')).toBe(true);
    expect(mutationOperationSchema.parse('completeAndArchive')).toBe('completeAndArchive');
    expect(enhancedMutationSchema.parse(mutation).entityType).toBe('project');
    expect(
      pushRequestSchema.parse({ contractVersion: 3, mutations: [mutation] }).contractVersion,
    ).toBe(3);
  });

  it('does not admit a hard-delete operation through synchronization', () => {
    expect(mutationOperationSchema.safeParse('hardDelete').success).toBe(false);
    expect(
      pushRequestSchema.safeParse({
        contractVersion: 3,
        mutations: [{ ...mutation, operation: 'hardDelete' }],
      }).success,
    ).toBe(false);
  });
});
