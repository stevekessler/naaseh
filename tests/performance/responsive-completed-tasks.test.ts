import { describe, expect, it } from 'vitest';
import { projectCompletionChart } from '../../apps/web/src/features/reports/completion-presentation.js';

const PERIOD_COUNT = 366;
const PROJECTION_TARGET_MS = 100;

describe('responsive Completed Tasks performance', () => {
  it('projects a deterministic leap-year report within the presentation budget', () => {
    const periods = Array.from({ length: PERIOD_COUNT }, (_, index) => ({
      key: `2028-${String(index + 1).padStart(3, '0')}`,
      count: index % 3 === 0 ? 0 : (index % 11) + 1,
    }));
    const startedAt = performance.now();
    const result = projectCompletionChart(periods, false);
    const durationMs = performance.now() - startedAt;

    expect(periods).toHaveLength(PERIOD_COUNT);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.visiblePeriods).toHaveLength(244);
      expect(result.visiblePeriods.every(({ count }) => count > 0)).toBe(true);
    }
    expect(durationMs).toBeLessThan(PROJECTION_TARGET_MS);
  });
});
