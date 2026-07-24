import { createLogger } from '@naaseh/observability';
const logger = createLogger(process.env);
export const taskTelemetry = (
  operation: string,
  actorId: string,
  taskId: string,
  outcome: string,
  latencyMs: number,
) => logger.info(`task.${operation}`, { actorId, taskId, outcome, latencyMs });
export const recordTaskAdminRead = (correlationId: string, actorId: string, taskId: string) =>
  logger.content('content.admin_read', {
    correlationId,
    actorId,
    resourceId: taskId,
    entityType: 'task',
    outcome: 'success',
  });
