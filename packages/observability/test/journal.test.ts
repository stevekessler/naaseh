import { journalEventFields, sanitizeJournalEvent } from '@naaseh/observability';
import { describe, expect, it } from 'vitest';

describe('journal telemetry boundary', () => {
  it('keeps only explicitly allowed content-free fields', () => {
    expect(journalEventFields).toContain('correlationId');
    expect(
      sanitizeJournalEvent({
        correlationId: 'correlation-1',
        operation: 'save',
        outcome: 'success',
        schemaVersion: 1,
        date: '2026-08-29',
        answers: { suicidalBehaviors: true },
        notes: 'secret',
        taskId: 'task',
        ownerWrap: 'wrap',
        key: 'key',
        ciphertext: 'ciphertext',
        reason: 'reason',
        publicKey: 'key',
        average: 4,
      }),
    ).toEqual({
      correlationId: 'correlation-1',
      operation: 'save',
      outcome: 'success',
      schemaVersion: 1,
    });
  });
});
