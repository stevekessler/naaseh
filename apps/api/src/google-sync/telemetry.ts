import { createLogger } from '@naaseh/observability';

const logger = createLogger(process.env);

export type GoogleSyncOutcome = 'success' | 'failure' | 'retry' | 'conflict' | 'quarantined';

export function recordGoogleSyncEvent(
  operation: string,
  fields: {
    correlationId: string;
    outcome: GoogleSyncOutcome;
    connectionId?: string;
    linkId?: string;
    runId?: string;
    direction?: 'toGoogle' | 'fromGoogle';
    latencyMs?: number;
    attemptCount?: number;
    providerStatusClass?: string;
    safeErrorCode?: string;
    checkpointAgeSeconds?: number;
  },
) {
  logger.info(`google_sync.${operation}`, fields);
}

export function recordGoogleSyncMetric(
  name:
    | 'GoogleSyncAuthorizationFailures'
    | 'GoogleSyncRevocations'
    | 'GoogleSyncThrottles'
    | 'GoogleSyncRunFailures'
    | 'GoogleSyncLagSeconds'
    | 'GoogleSyncCheckpointStalls'
    | 'GoogleSyncConflicts'
    | 'GoogleSyncQuarantines',
  value: number,
  fields: Record<string, string | number | boolean> = {},
) {
  logger.metric(name, value, name.endsWith('Seconds') ? 'Seconds' : 'Count', fields);
}
