import { describe, expect, it } from 'vitest';
import { projectAssignmentPatchSchema } from '@naaseh/contracts';
import { projectSchema } from '@naaseh/domain';

describe('Category and Project contract', () => {
  it('accepts Project or Unassigned and rejects independent Category assignment', () => {
    expect(projectAssignmentPatchSchema.parse({ projectId: null })).toEqual({ projectId: null });
    expect(() =>
      projectAssignmentPatchSchema.parse({ categoryId: 'legacy', projectId: null }),
    ).toThrow();
  });

  it('models exactly one Category parent', () => {
    const parsed = projectSchema.safeParse({
      id: '01J00000000000000000000002',
      categoryId: '01J00000000000000000000000',
      parentProjectId: '01J00000000000000000000001',
      name: 'API',
      lifecycle: 'active',
      createdAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-24T12:00:00.000Z',
      version: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
