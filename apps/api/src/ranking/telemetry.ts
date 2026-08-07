import { log, metric } from '@naaseh/observability';

export type StackAffectedCountBucket =
  | 'zero'
  | 'one'
  | 'two_to_ten'
  | 'eleven_to_hundred'
  | 'hundred_one_to_thousand'
  | 'thousand_one_to_ten_thousand'
  | 'ten_thousand_one_to_fifty_thousand'
  | 'over_fifty_thousand';

export function stackAffectedCountBucket(count: number): StackAffectedCountBucket {
  if (!Number.isInteger(count) || count < 0) throw new Error('Affected count must be nonnegative.');
  if (count === 0) return 'zero';
  if (count === 1) return 'one';
  if (count <= 10) return 'two_to_ten';
  if (count <= 100) return 'eleven_to_hundred';
  if (count <= 1_000) return 'hundred_one_to_thousand';
  if (count <= 10_000) return 'thousand_one_to_ten_thousand';
  if (count <= 50_000) return 'ten_thousand_one_to_fifty_thousand';
  return 'over_fifty_thousand';
}

export interface StackOperationTelemetryInput {
  correlationId: string;
  operationClass: 'read' | 'reorder' | 'operation_status';
  scopeType: 'overall' | 'project';
  outcome: 'success' | 'pending' | 'conflict' | 'failure';
  durationMs: number;
  affectedCount?: number;
  moveKind?: 'simple_move' | 'filtered_permutation';
  conflictReason?:
    | 'version_mismatch'
    | 'anchor_removed'
    | 'authorization_changed'
    | 'lifecycle_changed'
    | 'project_changed'
    | 'filter_basis_changed'
    | 'hard_deleted';
  failureClass?: 'validation' | 'authorization' | 'persistence' | 'timeout' | 'internal';
}

export function stackOperationTelemetry(input: StackOperationTelemetryInput) {
  return {
    operation: 'ranking.stack_operation' as const,
    correlationId: input.correlationId,
    operationClass: input.operationClass,
    scopeType: input.scopeType,
    outcome: input.outcome,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    ...(input.affectedCount === undefined
      ? {}
      : { affectedCountBucket: stackAffectedCountBucket(input.affectedCount) }),
    ...(input.moveKind ? { moveKind: input.moveKind } : {}),
    ...(input.conflictReason ? { conflictReason: input.conflictReason } : {}),
    ...(input.failureClass ? { failureClass: input.failureClass } : {}),
  };
}

export function recordStackOperation(input: StackOperationTelemetryInput) {
  const detail = stackOperationTelemetry(input);
  log(detail.operation, detail);
  metric('StackOperationLatency', detail.durationMs, 'Milliseconds');
  if (input.operationClass === 'reorder') metric('StackReorders', 1);
  if (input.outcome === 'conflict') metric('StackReorderConflicts', 1);
  if (input.outcome === 'failure') metric('StackReorderFailures', 1);
  return detail;
}

export interface StackCompactionTelemetryInput {
  correlationId: string;
  scopeType: 'overall' | 'project';
  outcome: 'success' | 'failure';
  durationMs: number;
  affectedCount: number;
  failureClass?: 'persistence' | 'integrity' | 'timeout' | 'internal';
}

export function stackCompactionTelemetry(input: StackCompactionTelemetryInput) {
  return {
    operation: 'ranking.stack_compaction' as const,
    correlationId: input.correlationId,
    scopeType: input.scopeType,
    outcome: input.outcome,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    affectedCountBucket: stackAffectedCountBucket(input.affectedCount),
    ...(input.failureClass ? { failureClass: input.failureClass } : {}),
  };
}

export function recordStackCompaction(input: StackCompactionTelemetryInput) {
  const detail = stackCompactionTelemetry(input);
  log(detail.operation, detail);
  metric('StackCompactionLatency', detail.durationMs, 'Milliseconds');
  metric('StackCompactions', 1);
  if (input.outcome === 'failure') metric('StackCompactionFailures', 1);
  return detail;
}
