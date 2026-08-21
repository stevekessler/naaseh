import { log, metric } from '@naaseh/observability';

export function recordTaskTimerEvent(input: {
  operation: string;
  outcome: 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'failed';
  durationMs: number;
  correlationId: string;
}) {
  const fields = {
    operation: input.operation,
    outcome: input.outcome,
    durationBucket:
      input.durationMs < 100 ? 'under_100ms' : input.durationMs < 1_000 ? 'under_1s' : 'over_1s',
    correlationId: input.correlationId,
  };
  log('task_timer.command', fields);
  metric('TaskTimerCommands', 1, 'Count', { operation: input.operation, outcome: input.outcome });
  metric('TaskTimerCommandLatency', input.durationMs, 'Milliseconds', {
    operation: input.operation,
  });
  if (input.outcome === 'conflict') metric('TaskTimerConflicts', 1);
  if (input.outcome === 'rejected' || input.outcome === 'failed') metric('TaskTimerFailures', 1);
}
