import { log, metric } from '@naaseh/observability';
export function recordDirectoryMutation(fields: {
  correlationId: string;
  actorId: string;
  resourceId: string;
  outcome: string;
}) {
  log('directory.mutated', fields);
  metric('DirectoryMutations', 1, 'Count', { outcome: fields.outcome });
}
