import { describe, expect, it } from 'vitest';
import { projectCompletionChart } from '../../src/features/reports/completion-presentation.js';

describe('completion chart presentation', () => {
  it.each(['day', 'week', 'month'])('keeps positive %s periods in source order', () => {
    const source = [
      { key: 'first', count: 2 },
      { key: 'zero', count: 0 },
      { key: 'last', count: 5 },
    ];
    expect(projectCompletionChart(source, false)).toEqual({
      kind: 'ready',
      visiblePeriods: [source[0], source[2]],
      maximum: 5,
    });
    expect(source).toEqual([
      { key: 'first', count: 2 },
      { key: 'zero', count: 0 },
      { key: 'last', count: 5 },
    ]);
  });

  it('distinguishes range and filtered empty states and re-evaluates transitions', () => {
    expect(projectCompletionChart([{ key: 'a', count: 0 }], false)).toEqual({
      kind: 'empty',
      emptyReason: 'range',
    });
    expect(projectCompletionChart([{ key: 'a', count: 0 }], true)).toEqual({
      kind: 'empty',
      emptyReason: 'filtered',
    });
    expect(projectCompletionChart([{ key: 'a', count: 1 }], false).kind).toBe('ready');
    expect(projectCompletionChart([{ key: 'a', count: 0 }], false).kind).toBe('empty');
  });

  it.each([
    [null],
    [[{ key: '', count: 1 }]],
    [[{ key: 'a', count: -1 }]],
    [[{ key: 'a', count: 1.5 }]],
    [[{ key: 'a', count: Number.NaN }]],
    [[{ key: 'a', count: Number.POSITIVE_INFINITY }]],
    [
      [
        { key: 'a', count: 1 },
        { key: 'a', count: 2 },
      ],
    ],
    [[{ key: 'a' }]],
  ])('rejects malformed canonical periods safely', (periods) => {
    expect(projectCompletionChart(periods, false)).toEqual({
      kind: 'invalid',
      error: 'calculation_failed',
    });
  });
});
