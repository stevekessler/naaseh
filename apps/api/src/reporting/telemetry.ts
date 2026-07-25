export function reportingTelemetry(
  operation: 'completion-report.success' | 'completion-report.failure',
  detail: { actorId: string; targetUserId: string; period?: string; durationMs?: number },
) {
  return {
    operation,
    actorId: detail.actorId,
    targetUserId: detail.targetUserId,
    ...(detail.period ? { period: detail.period } : {}),
    ...(detail.durationMs === undefined ? {} : { durationMs: detail.durationMs }),
  };
}
