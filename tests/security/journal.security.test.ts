import { describe, expect, it } from 'vitest';
import { InMemoryJournalRepository } from '../../apps/api/src/journal/journal-repository.js';
import { JournalService } from '../../apps/api/src/journal/journal-service.js';
import { sanitizeJournalEvent } from '@naaseh/observability';

describe('journal security boundary', () => {
  it('conceals foreign and administrator reads and strips protected telemetry', async () => {
    const repository = new InMemoryJournalRepository();
    const service = new JournalService(repository);
    await expect(service.read('other', 'guessed')).rejects.toThrow('unavailable');
    await expect(service.read('admin', 'guessed')).rejects.toThrow('unavailable');
    expect(
      sanitizeJournalEvent({
        correlationId: 'safe',
        date: 'secret',
        notes: 'secret',
        ciphertext: 'secret',
        taskId: 'secret',
      }),
    ).toEqual({ correlationId: 'safe' });
  });
});
