import { describe, expect, it } from 'vitest';
import { createLogger, redact } from '@naaseh/observability';

describe('Google conflict data boundary', () => {
  it('redacts every protected conflict candidate recursively', () => {
    expect(
      redact({
        conflict: {
          baseValue: 'old title',
          localValue: 'private local title',
          remoteValue: 'private Google title',
          resolvedValue: 'chosen title',
        },
        correlationId: 'safe-id',
      }),
    ).toEqual({
      conflict: {
        baseValue: '[REDACTED]',
        localValue: '[REDACTED]',
        remoteValue: '[REDACTED]',
        resolvedValue: '[REDACTED]',
      },
      correlationId: 'safe-id',
    });
  });

  it('never emits protected conflict values through structured logs', () => {
    const lines: string[] = [];
    createLogger({}, { sink: (line) => lines.push(line) }).info('google_sync.conflict', {
      localValue: 'secret-a',
      remoteValue: 'secret-b',
      outcome: 'conflict',
    });
    expect(lines.join(' ')).not.toContain('secret-a');
    expect(lines.join(' ')).not.toContain('secret-b');
    expect(lines.join(' ')).toContain('[REDACTED]');
  });
});
