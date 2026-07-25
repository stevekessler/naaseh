export const archiveProjectReportingEvents = [
  'content.lifecycle',
  'organization.lifecycle',
  'completion.lifecycle',
  'hard_delete.preview',
  'hard_delete.result',
  'report.request',
  'migration.lifecycle',
  'restore.deletion_ledger',
] as const;

export type ArchiveProjectReportingEvent = (typeof archiveProjectReportingEvents)[number];
const allowed = new Set<string>(archiveProjectReportingEvents);

export interface ArchiveProjectReportingFields {
  correlationId: string;
  actorId?: string;
  resourceId?: string;
  resourceType?: string;
  operation?: string;
  outcome: 'success' | 'failure' | 'denied' | 'blocked';
  latencyMs?: number;
  count?: number;
  errorClass?: string;
  privileged?: boolean;
}

export function assertArchiveProjectReportingEvent(
  event: string,
): asserts event is ArchiveProjectReportingEvent {
  if (!allowed.has(event)) throw new Error('Unsupported archive/project/reporting event.');
}
