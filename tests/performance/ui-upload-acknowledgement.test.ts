import { describe, expect, it } from 'vitest';
import { completionAnnouncement } from '../../apps/web/src/features/tasks/useCompletionFeedback.js';
import { uploadProgressPercent } from '../../apps/web/src/features/attachments/attachment-client.js';

const percentile = (samples: number[], fraction: number) =>
  [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * fraction) - 1] ?? 0;

describe('UI acknowledgement performance', () => {
  it('acknowledges completion and upload progress within the synchronous interaction budget', () => {
    const samples: number[] = [];
    for (let run = 0; run < 100; run += 1) {
      const started = performance.now();
      expect(completionAnnouncement('Groceries')).toBe('Groceries completed.');
      expect(uploadProgressPercent(run, 100)).toBe(run);
      samples.push(performance.now() - started);
    }
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    console.info(JSON.stringify({ metric: 'ui-and-upload-ack', p50Ms: p50, p95Ms: p95 }));
    expect(p95).toBeLessThan(16);
  });
});
