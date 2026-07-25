import { describe, expect, it } from 'vitest';
import { deletionPreviewSchema } from '@naaseh/domain';

describe('organization lifecycle contract', () => {
  it('returns safe blockers and requires irreversible confirmation for Category/Project delete', () => {
    const preview = deletionPreviewSchema.parse({
      resourceType: 'project',
      resourceId: '01J00000000000000000000020',
      displayLabel: 'API',
      targetVersion: 2,
      dependentCounts: { references: 3 },
      blockers: ['3 references remain.'],
      reportingImpact: 'History must remain available.',
      irreversible: true,
      expiresAt: '2026-07-24T12:05:00.000Z',
      confirmationToken: 'signed-confirmation-token',
    });
    expect(preview.blockers).toHaveLength(1);
    expect(preview.irreversible).toBe(true);
  });
});
