import { log, metric } from '@naaseh/observability';
export function recordListMutation(event: {
  correlationId: string;
  actorId: string;
  listId: string;
  operation: string;
  outcome: string;
}) {
  log('list.mutated', event);
  metric('ListMutations', 1, 'Count', { operation: event.operation, outcome: event.outcome });
}
export function recordListAdminRead(correlationId: string, actorId: string, listId: string) {
  log('content.admin_read', {
    correlationId,
    actorId,
    resourceId: listId,
    entityType: 'list',
    outcome: 'success',
  });
  metric('AdministratorContentReads', 1, 'Count', { entityType: 'list' });
}
