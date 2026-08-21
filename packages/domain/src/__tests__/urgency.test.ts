import { describe, expect, it } from 'vitest';
import * as urgencyModule from '../urgency.js';
import {
  defaultUrgency,
  urgencyLabels,
  urgencySchema,
  urgencyValues,
  zeroUrgencyCounts,
} from '../urgency.js';

describe('urgency', () => {
  it('defines exactly four stable categorical wire values in display order', () => {
    expect(urgencyValues).toEqual(['low', 'medium', 'high', 'critical']);
    expect(new Set(urgencyValues).size).toBe(4);

    for (const value of urgencyValues) expect(urgencySchema.parse(value)).toBe(value);
  });

  it('provides one stable human-readable label for every wire value', () => {
    expect(urgencyLabels).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    });
    expect(urgencyValues.map((value) => urgencyLabels[value])).toEqual([
      'Low',
      'Medium',
      'High',
      'Critical',
    ]);
  });

  it('uses Medium as the single default urgency', () => {
    expect(defaultUrgency).toBe('medium');
    expect(urgencySchema.parse(defaultUrgency)).toBe('medium');
  });

  it('creates a complete zero-filled count record in stable level order', () => {
    const first = zeroUrgencyCounts();
    const second = zeroUrgencyCounts();

    expect(first).toEqual({
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    });
    expect(Object.keys(first)).toEqual(urgencyValues);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it.each([
    0,
    1,
    2,
    3,
    4,
    5,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '0',
    '1',
    '5',
    'Extra Low',
    'extra_low',
    'Medium',
    'CRITICAL',
    '',
    null,
    undefined,
  ])('rejects non-categorical urgency value %j', (value) => {
    expect(urgencySchema.safeParse(value).success).toBe(false);
  });

  it('does not expose numeric weights, scores, ranks, or comparison helpers', () => {
    const forbiddenSemantics = Object.keys(urgencyModule).filter((name) =>
      /(compare|numeric|rank|score|weight)/iu.test(name),
    );

    expect(forbiddenSemantics).toEqual([]);
    expect(Object.values(urgencyLabels).every((label) => !/\d/u.test(label))).toBe(true);
  });
});
