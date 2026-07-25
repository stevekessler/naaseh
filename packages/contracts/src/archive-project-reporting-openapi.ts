import { z } from 'zod';

export const archiveProjectReportingContractVersion = 3 as const;
export const archiveProjectReportingContractVersionSchema = z.literal(
  archiveProjectReportingContractVersion,
);

export const archiveProjectReportingOpenApiPath =
  'specs/003-archive-project-reporting/contracts/openapi.yaml' as const;

export const projectAssignmentPatchSchema = z.object({ projectId: z.string().nullable() }).strict();

export const reportBucketSchema = z.enum(['day', 'week', 'month']);
export const reportAssignmentSchema = z.enum(['all', 'unassigned', 'category', 'project']);
