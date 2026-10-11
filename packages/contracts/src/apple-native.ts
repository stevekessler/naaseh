import { z } from 'zod';

export const apiProblemSchema = z
  .object({
    type: z.string().regex(/^urn:naaseh:problem:/),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    code: z.string().min(1),
    message: z.string().min(1),
    correlationId: z.string().min(1),
  })
  .strict();

export type ApiProblem = z.infer<typeof apiProblemSchema>;

export const syncEnvelopeV4Schema = z
  .object({
    contractVersion: z.literal(4),
    audience: z.string().min(1),
    cursor: z.string().min(1),
    operations: z.array(z.unknown()),
    serverTime: z.string().datetime({ offset: true }),
  })
  .strict();

export type SyncEnvelopeV4 = z.infer<typeof syncEnvelopeV4Schema>;

export const nativeClientPlatformSchema = z.enum(['ios', 'ipados', 'macos']);

export const nativeTelemetryEventSchema = z
  .object({
    eventId: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
    platform: nativeClientPlatformSchema,
    appVersion: z.string().min(1).max(40),
    buildNumber: z.number().int().positive(),
    contractVersion: z.number().int().positive(),
    operationClass: z.enum([
      'migration',
      'secureStore',
      'crypto',
      'sync',
      'lifecycle',
      'siri',
      'notification',
      'fileWorkflow',
      'authentication',
    ]),
    outcome: z.enum(['failed', 'blocked', 'recovered', 'retryScheduled']),
    errorClass: z.enum([
      'validation',
      'authorization',
      'storageUnavailable',
      'storageCorrupt',
      'missingKey',
      'decryptionFailed',
      'migrationFailed',
      'networkUnavailable',
      'dependencyFailed',
      'incompatibleClient',
      'cancelled',
      'unknown',
    ]),
    durationMilliseconds: z.number().int().min(0).max(3_600_000).optional(),
    retryable: z.boolean(),
    queueDepthBucket: z.enum(['zero', 'oneToTen', 'elevenToHundred', 'overHundred']).optional(),
    freshnessBucket: z.enum(['fresh', 'underHour', 'underDay', 'older', 'unknown']).optional(),
    correlationId: z.string().uuid(),
  })
  .strict();

export const nativeTelemetryBatchSchema = z
  .object({ events: z.array(nativeTelemetryEventSchema).min(1).max(50) })
  .strict();

export type NativeTelemetryEvent = z.infer<typeof nativeTelemetryEventSchema>;
export type NativeTelemetryBatch = z.infer<typeof nativeTelemetryBatchSchema>;
