import { createTask } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import { transformTodosToCsv } from '../../apps/api/src/exports/csv-transformer.js';
import { MAX_EXPORT_ROWS } from '../../apps/api/src/exports/workflow-handler.js';

const percentile = (samples: number[], fraction: number) =>
  [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * fraction) - 1] ?? 0;

describe('50,000-row export performance', () => {
  it('keeps a fixed bound and transforms deterministically within the local budget', () => {
    expect(MAX_EXPORT_ROWS).toBe(50_000);
    const tasks = Array.from({ length: 50_000 }, (_, index) =>
      createTask({ label: `Task ${index}` }, 'owner', new Date(1_700_000_000_000 + index)),
    );
    const samples: number[] = [];
    let csv = '';
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      csv = transformTodosToCsv(tasks, new Map());
      samples.push(performance.now() - started);
    }
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    console.info(JSON.stringify({ metric: 'export-50k', p50Ms: p50, p95Ms: p95 }));
    expect(csv.split('\r\n')).toHaveLength(50_002);
    expect(p95).toBeLessThan(5_000);
    expect(Buffer.byteLength(csv)).toBeLessThan(100 * 1024 * 1024);
  }, 15_000);
});
