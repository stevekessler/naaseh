import { sanitizeCrisisPlanEvent, sanitizeJournalEvent } from '@naaseh/observability';

export function journalTelemetry(fields: Record<string, unknown>): Record<string, unknown> {
  return sanitizeJournalEvent(fields);
}

export function crisisPlanTelemetry(fields: Record<string, unknown>): Record<string, unknown> {
  return sanitizeCrisisPlanEvent(fields);
}
