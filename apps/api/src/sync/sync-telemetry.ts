import {
  entityTypeSchema,
  mutationOperationSchema,
  stackConflictReasonSchema,
} from '@naaseh/domain';
import { log } from '@naaseh/observability';

const safeReasons = new Set<string>([
  ...stackConflictReasonSchema.options,
  'validation_failed',
  'project_unavailable',
  'timer_changed',
]);

type DiagnosticMutation = {
  entityType?: unknown;
  operation?: unknown;
  baseVersion?: unknown;
};
type DiagnosticResult = {
  status: unknown;
  reason?: unknown;
  problem?: { reason?: unknown };
  entityVersion?: unknown;
  currentVersion?: unknown;
};

const safeVersion = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

export function syncMutationDiagnosticFields(input: {
  mutation: DiagnosticMutation;
  result: DiagnosticResult;
  actorRole: 'admin' | 'user';
  correlationId: string;
  serverRecordPresent?: boolean;
}) {
  const entityType = entityTypeSchema.safeParse(input.mutation.entityType);
  const operation = mutationOperationSchema.safeParse(input.mutation.operation);
  const candidateReason = input.result.reason ?? input.result.problem?.reason;
  const reason =
    typeof candidateReason === 'string' && safeReasons.has(candidateReason)
      ? candidateReason
      : 'unknown';
  const baseVersion = safeVersion(input.mutation.baseVersion);
  const serverVersion = safeVersion(input.result.entityVersion ?? input.result.currentVersion);
  return {
    correlationId: input.correlationId,
    entityType: entityType.success
      ? entityType.data
      : input.mutation.entityType === 'personalStackOperation'
        ? 'personalStackOperation'
        : 'unknown',
    mutationOperation: operation.success ? operation.data : 'unknown',
    outcome:
      input.result.status === 'conflict' ||
      input.result.status === 'rejected' ||
      input.result.status === 'retry'
        ? input.result.status
        : 'unknown',
    reason,
    actorRole: input.actorRole,
    ...(input.serverRecordPresent === undefined
      ? {}
      : { serverRecordPresent: input.serverRecordPresent }),
    ...(baseVersion === undefined ? {} : { baseVersion }),
    ...(serverVersion === undefined ? {} : { serverVersion }),
  };
}

export function recordSyncMutationOutcome(
  input: Parameters<typeof syncMutationDiagnosticFields>[0],
) {
  log('sync.mutation_outcome', syncMutationDiagnosticFields(input));
}
