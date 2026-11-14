import { describe, expect, it } from 'vitest';
import { resolveForecastWindow } from './forecast-window.js';

const input = { budgetStart: '2025-01-01', asOfDate: '2026-11-09' };

describe('resolveForecastWindow', () => {
  it('uses the inclusive dates of a dated budget even after it ends', () => {
    expect(resolveForecastWindow({ ...input, budgetEnd: '2025-12-31' })).toEqual({
      dateFrom: '2025-01-01', dateTo: '2025-12-31', basis: 'budget',
    });
  });

  it('defaults an open-ended budget to the next twelve calendar months', () => {
    expect(resolveForecastWindow(input)).toEqual({
      dateFrom: '2026-11-09', dateTo: '2027-11-08', basis: 'rolling',
    });
  });

  it('starts at the budget start when it is in the future', () => {
    expect(resolveForecastWindow({ ...input, budgetStart: '2027-01-01' })).toEqual({
      dateFrom: '2027-01-01', dateTo: '2027-12-31', basis: 'rolling',
    });
  });

  it('clamps a leap-day anniversary before computing the inclusive end', () => {
    expect(resolveForecastWindow({ ...input, asOfDate: '2028-02-29' }).dateTo).toBe('2029-02-27');
  });

  it('uses an explicit forecast window without changing the dated budget', () => {
    const custom = { dateFrom: '2025-12-31', dateTo: '2026-01-01' };
    expect(resolveForecastWindow({ ...input, budgetEnd: '2025-12-31', custom })).toEqual({
      ...custom, basis: 'custom',
    });
  });

  it('rejects invalid dates, reversed ranges and an unrepresentable rolling end', () => {
    expect(() => resolveForecastWindow({ ...input, asOfDate: '2026-02-29' })).toThrow(RangeError);
    expect(() => resolveForecastWindow({ ...input, budgetEnd: '2024-12-31' })).toThrow(RangeError);
    const custom = { dateFrom: '2026-02-02', dateTo: '2026-02-01' };
    expect(() => resolveForecastWindow({ ...input, custom })).toThrow(RangeError);
    expect(() => resolveForecastWindow({ ...input, asOfDate: '9999-12-31' })).toThrow(RangeError);
  });
});
