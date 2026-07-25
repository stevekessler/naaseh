import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  archiveProjectReportingContractVersion,
  archiveProjectReportingOpenApiPath,
  projectAssignmentPatchSchema,
} from '@naaseh/contracts';

describe('archive/project/reporting OpenAPI artifact', () => {
  it('registers version 3 and the required public interface families', () => {
    expect(archiveProjectReportingContractVersion).toBe(3);
    const contract = readFileSync(archiveProjectReportingOpenApiPath, 'utf8');
    for (const path of [
      '/archive:',
      '/organization/tree:',
      '/reports/completions:',
      '/deletion-jobs/{jobId}:',
      '/categories/{categoryId}/projects:',
    ])
      expect(contract).toContain(path);
  });

  it('allows exactly one Project or Unassigned without a separate Category', () => {
    expect(projectAssignmentPatchSchema.parse({ projectId: null })).toEqual({ projectId: null });
    expect(() =>
      projectAssignmentPatchSchema.parse({ projectId: 'project-a', categoryId: 'category-a' }),
    ).toThrow();
  });
});
