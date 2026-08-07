export function reportingTelemetry(
  operation: 'completion-report.success' | 'completion-report.failure',
  detail: { actorId: string; targetUserId: string; period?: string; durationMs?: number },
) {
  return {
    operation,
    targetClass:
      detail.actorId === detail.targetUserId ? ('self' as const) : ('delegated' as const),
    ...(detail.period ? { period: detail.period } : {}),
    ...(detail.durationMs === undefined ? {} : { durationMs: detail.durationMs }),
  };
}

const bucket = (value: number, boundaries: readonly number[]) => {
  const boundary = boundaries.find((candidate) => value <= candidate);
  return boundary === undefined ? `gt_${boundaries.at(-1) ?? 0}` : `le_${boundary}`;
};

export function filteredReadTelemetry(input: {
  endpointClass: 'archive' | 'workload' | 'drilldown' | 'completion_detail';
  outcome: 'success' | 'failure' | 'retry' | 'restart';
  durationMs: number;
  examinedCandidates: number;
  returnedRows: number;
  sourcePages: number;
  readUnits?: number;
  bytes?: number;
  cursorResult?: 'none' | 'invalid' | 'expired' | 'context_changed';
}) {
  return {
    operation: 'reporting.filtered_read',
    endpointClass: input.endpointClass,
    outcome: input.outcome,
    latencyBucket: bucket(input.durationMs, [100, 250, 500, 1_000, 2_500]),
    amplificationBucket: bucket(
      input.returnedRows
        ? Math.ceil(input.examinedCandidates / input.returnedRows)
        : input.examinedCandidates,
      [1, 5, 10, 20, 100, 500, 4_000],
    ),
    pageCountBucket: bucket(input.sourcePages, [1, 2, 3, 4]),
    readUnitBucket: bucket(input.readUnits ?? 0, [1, 5, 10, 25, 100]),
    byteBucket: bucket(input.bytes ?? 0, [1_024, 65_536, 262_144, 1_048_576]),
    shortPage: input.returnedRows === 0 || input.examinedCandidates > input.returnedRows,
    cursorResult: input.cursorResult ?? 'none',
  };
}

export function recordFilteredRead(input: Parameters<typeof filteredReadTelemetry>[0]) {
  const detail = filteredReadTelemetry(input);
  log(detail.operation, detail);
  metric('FilteredReadLatency', Math.max(0, input.durationMs), 'Milliseconds');
  metric(
    'FilteredReadAmplification',
    input.returnedRows
      ? Math.ceil(input.examinedCandidates / input.returnedRows)
      : input.examinedCandidates,
  );
  metric('FilteredReadUnits', Math.max(0, input.readUnits ?? 0));
  metric('FilteredReadBytes', Math.max(0, input.bytes ?? 0), 'Bytes');
  if (detail.shortPage) metric('FilteredShortPages', 1);
  if (input.outcome === 'failure') metric('FilteredReadFailures', 1);
  if (input.cursorResult === 'expired') metric('PaginationCursorExpiries', 1);
  if (input.cursorResult === 'context_changed') metric('PaginationContextRestarts', 1);
  return detail;
}

export function reconciliationTelemetry(input: {
  outcome: 'success' | 'failure' | 'retry';
  missing: number;
  stale: number;
  orphan: number;
  unauthorized: number;
}) {
  return {
    operation: 'reporting.projection_reconciliation',
    outcome: input.outcome,
    missingBucket: stackAffectedCountBucket(input.missing),
    staleBucket: stackAffectedCountBucket(input.stale),
    orphanBucket: stackAffectedCountBucket(input.orphan),
    unauthorizedBucket: stackAffectedCountBucket(input.unauthorized),
  };
}

export function recordReconciliation(input: Parameters<typeof reconciliationTelemetry>[0]) {
  const detail = reconciliationTelemetry(input);
  log(detail.operation, detail);
  const mismatchTotal = input.missing + input.stale + input.orphan + input.unauthorized;
  metric('ProjectionReconciliations', 1);
  if (input.outcome === 'failure' || mismatchTotal > 0)
    metric('ProjectionReconciliationFailures', 1);
  return detail;
}
import { log, metric } from '@naaseh/observability';
import { stackAffectedCountBucket } from '../ranking/telemetry.js';
