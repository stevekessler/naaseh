import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { createUlid } from '@naaseh/domain';
import { z } from 'zod';
import {
  financePublicationIdSchema,
  financePublicationEventSource,
  financePublicationEventType,
} from './publication-invocation.js';
import { emitFinanceExperienceEvent } from './telemetry.js';

/** Best-effort signal after commit. The durable outbox, never event delivery, owns the work. */
export async function requestFinancePublication(ids: string[]): Promise<boolean> {
  const bus = process.env.NAASEH_FINANCE_PUBLICATION_EVENT_BUS;
  if (!bus || !ids.length) return false;
  const started = performance.now();
  try {
    const unique = z
      .array(financePublicationIdSchema)
      .max(10)
      .parse([...new Set(ids)]);
    const result = await new EventBridgeClient({ maxAttempts: 1 }).send(
      new PutEventsCommand({
        Entries: unique.map((publicationId) => ({
          EventBusName: bus,
          Source: financePublicationEventSource,
          DetailType: financePublicationEventType,
          Detail: JSON.stringify({ publicationId }),
        })),
      }),
      { abortSignal: AbortSignal.timeout(750) },
    );
    if (
      result.FailedEntryCount !== 0 ||
      result.Entries?.length !== unique.length ||
      result.Entries.some((entry) => !entry.EventId || entry.ErrorCode)
    )
      throw new Error('Publication event delivery incomplete.');
    return true;
  } catch {
    emitFinanceExperienceEvent({
      operation: 'projection',
      outcome: 'failed',
      correlationId: createUlid(),
      durationMs: performance.now() - started,
      errorCategory: 'storage',
      retryKind: 'automatic',
    });
    return false;
  }
}
