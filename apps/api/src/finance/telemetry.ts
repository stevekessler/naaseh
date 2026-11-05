export type FinanceMetricOperation =
  | 'account-mutation'
  | 'csv-import'
  | 'simplefin-claim'
  | 'simplefin-refresh';
export type FinanceMetricOutcome = 'success' | 'partial' | 'failed' | 'conflict' | 'cooldown';

export function financeMetric(
  operation: FinanceMetricOperation,
  outcome: FinanceMetricOutcome,
  durationMs: number,
  itemCount?: number,
) {
  if (!Number.isFinite(durationMs) || durationMs < 0)
    throw new Error('Invalid Finance metric duration.');
  if (itemCount !== undefined && (!Number.isSafeInteger(itemCount) || itemCount < 0))
    throw new Error('Invalid Finance metric count.');
  return { operation, outcome, durationMs, ...(itemCount === undefined ? {} : { itemCount }) };
}
import { z } from 'zod';
import { createLogger } from '@naaseh/observability';

const experienceEventSchema = z
  .object({
    operation: z.enum([
      'query',
      'projection',
      'receipt-check',
      'receipt-range',
      'pin-unlock',
      'pin-management',
      'fulfillment',
      'refund',
      'cleanup',
      'sync-delivery',
    ]),
    outcome: z.enum(['success', 'failed', 'denied', 'throttled', 'conflict', 'pending']),
    correlationId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
    durationMs: z.number().finite().nonnegative(),
    projectionLagMs: z.number().finite().nonnegative().optional(),
    examined: z.number().int().min(0).max(1_000).optional(),
    errorCategory: z
      .enum([
        'authorization',
        'throttled',
        'validation',
        'capacity',
        'invariant',
        'storage',
        'scan',
        'timeout',
        'stalled',
        'network',
      ])
      .optional(),
    retryKind: z.enum(['none', 'automatic', 'user']).optional(),
  })
  .strict();
export type FinanceExperienceEventInput = z.infer<typeof experienceEventSchema>;

export function financeExperienceEvent(input: FinanceExperienceEventInput) {
  const { durationMs, projectionLagMs, ...event } = experienceEventSchema.parse(input);
  const latencyBucket =
    durationMs < 100
      ? '<100ms'
      : durationMs < 1_000
        ? '100-999ms'
        : durationMs < 10_000
          ? '1-9s'
          : '>=10s';
  const projectionLagBucket =
    projectionLagMs === undefined
      ? undefined
      : projectionLagMs < 2_000
        ? '<2s'
        : projectionLagMs < 10_000
          ? '2-9s'
          : projectionLagMs < 15 * 60_000
            ? '10s-14m'
            : '>=15m';
  return {
    ...event,
    ...(projectionLagBucket ? { projectionLagBucket } : {}),
    operation: `finance.${event.operation}`,
    schemaVersion: 2,
    latencyBucket,
  };
}

/** Reuse existing paid global series; detailed breakdowns remain bounded structured log fields. */
export function emitFinanceExperienceEvent(input: FinanceExperienceEventInput) {
  const event = financeExperienceEvent(input);
  const logger = createLogger(process.env);
  logger.info(event.operation, event);
  if (event.errorCategory === 'invariant')
    logger.metric('FinanceDataIntegrityFailures', 1, 'Count', {
      correlationId: event.correlationId,
    });
  else if (event.outcome === 'denied' || event.outcome === 'throttled')
    logger.metric('FinanceAuthorizationDenials', 1, 'Count', {
      correlationId: event.correlationId,
    });
  else if (event.outcome === 'failed')
    logger.metric('FinanceImportFailures', 1, 'Count', { correlationId: event.correlationId });
}

/** Safe classifications are set by trusted service code, never derived from error messages. */
export class FinanceExperienceFailure extends Error {
  constructor(
    readonly errorCategory: NonNullable<FinanceExperienceEventInput['errorCategory']>,
    message: string,
    readonly retryKind: NonNullable<FinanceExperienceEventInput['retryKind']> = 'none',
    readonly projectionLagMs?: number,
  ) {
    super(message);
    this.name = 'FinanceExperienceFailure';
  }
}
export function financeExperienceFailureDetails(error: unknown) {
  if (error instanceof FinanceExperienceFailure)
    return {
      errorCategory: error.errorCategory,
      retryKind: error.retryKind,
      ...(error.projectionLagMs !== undefined ? { projectionLagMs: error.projectionLagMs } : {}),
    };
  return { errorCategory: 'storage' as const, retryKind: 'automatic' as const };
}
export function financeExperienceFailureOutcome(
  error: unknown,
): FinanceExperienceEventInput['outcome'] {
  const { errorCategory } = financeExperienceFailureDetails(error);
  return errorCategory === 'authorization'
    ? 'denied'
    : errorCategory === 'throttled'
      ? 'throttled'
      : errorCategory === 'capacity'
        ? 'conflict'
        : 'failed';
}
