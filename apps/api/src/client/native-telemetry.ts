import type { NativeTelemetryBatch } from '@naaseh/contracts';
import { nativeTelemetryBatchSchema } from '@naaseh/contracts';

export const MAX_NATIVE_TELEMETRY_BYTES = 32 * 1024;

export interface NativeTelemetrySink {
  log(operation: string, fields: Record<string, unknown>): void;
  metric(
    name: string,
    value: number,
    unit: 'Count',
    dimensions: Record<string, string | boolean>,
  ): void;
}

export function parseNativeTelemetryBody(body: string): NativeTelemetryBatch {
  if (Buffer.byteLength(body, 'utf8') > MAX_NATIVE_TELEMETRY_BYTES)
    throw Object.assign(new Error('Native telemetry batches are limited to 32 KiB.'), {
      statusCode: 413,
      code: 'payload_too_large',
    });
  return nativeTelemetryBatchSchema.parse(JSON.parse(body));
}

export function recordNativeTelemetry(
  batch: NativeTelemetryBatch,
  sink: NativeTelemetrySink,
): void {
  for (const event of batch.events) {
    const fields = {
      platform: event.platform,
      appVersion: event.appVersion,
      buildNumber: event.buildNumber,
      contractVersion: event.contractVersion,
      operationClass: event.operationClass,
      outcome: event.outcome,
      errorClass: event.errorClass,
      ...(event.durationMilliseconds === undefined
        ? {}
        : { durationMilliseconds: event.durationMilliseconds }),
      retryable: event.retryable,
      ...(event.queueDepthBucket === undefined ? {} : { queueDepthBucket: event.queueDepthBucket }),
      ...(event.freshnessBucket === undefined ? {} : { freshnessBucket: event.freshnessBucket }),
      correlationId: event.correlationId,
    };
    sink.log('native.client_diagnostic', fields);
    sink.metric('NativeClientDiagnostic', 1, 'Count', {
      platform: event.platform,
      operationClass: event.operationClass,
      outcome: event.outcome,
      errorClass: event.errorClass,
      retryable: event.retryable,
    });
    if (event.outcome === 'failed' || event.outcome === 'blocked')
      sink.metric('NativeClientFailures', 1, 'Count', {});
  }
}
