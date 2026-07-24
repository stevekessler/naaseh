import { createLogger } from '@naaseh/observability';

const allowedContext = new Set([
  'approvalId',
  'authority',
  'correlationId',
  'elapsedMs',
  'executionId',
  'keyVersion',
  'manifestId',
  'memoId',
  'ownerId',
  'recoveryPointId',
  'rpoSeconds',
  'rtoSeconds',
  'state',
  'taskId',
]);

type AuditContext = Record<string, string | number | boolean | undefined>;

function safeContext(context: AuditContext) {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key, value]) => allowedContext.has(key) && value !== undefined,
    ),
  );
}

/**
 * Recovery audit events use a positive field allowlist before the shared permanent
 * redactor. This prevents a future caller from accidentally adding protected content.
 */
export function createRecoveryAudit(
  environment: Record<string, string | undefined> = process.env,
  sink?: (line: string) => void,
) {
  const logger = createLogger(environment, { ...(sink ? { sink } : {}) });
  return (operation: string, actorId: string, outcome: string, context: AuditContext = {}) =>
    logger.info(`recovery.${operation}`, { actorId, outcome, ...safeContext(context) });
}

export const recoveryAudit = createRecoveryAudit();
