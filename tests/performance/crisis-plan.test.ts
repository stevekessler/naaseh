import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { shouldShowCrisisPlan } from '../../apps/web/src/features/journal/JournalEntryEditor.js';
import { assertCrisisPlanRecipientLimit } from '@naaseh/domain';

describe('Crisis Plan bounded local performance', () => {
  it('keeps trigger response and 90-recipient processing below the local 100ms budget', () => {
    const samples: number[] = [];
    for (let run = 0; run < 40; run++) {
      const start = performance.now();
      for (let index = 0; index < 10_000; index++) shouldShowCrisisPlan(index % 2 === 0, false);
      const recipients = Array.from({ length: 90 }, (_, index) => ({
        id: `recipient-${index}`,
        version: index + 1,
      })).sort((a, b) => a.id.localeCompare(b.id));
      assertCrisisPlanRecipientLimit(recipients.length);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    expect(p95).toBeLessThan(100);
  });
});
