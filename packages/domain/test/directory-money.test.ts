import { describe, expect, it } from 'vitest';
import { effectiveDirectoryFields, resetDirectoryOverrides } from '../src/directory-item.js';
import { parseSignedMinor, totalMinor } from '../src/money.js';

describe('directory values and exact totals', () => {
  it('defaults unsigned input to a cost and preserves explicit signs', () => {
    expect(parseSignedMinor('12.34', 'cost')).toBe(-1234);
    expect(parseSignedMinor('+12.34', 'cost')).toBe(1234);
    expect(parseSignedMinor('-0.01', 'credit')).toBe(-1);
    expect(totalMinor([-100, null, 50])).toBe(-50);
  });
  it('uses overrides, then live global values, then snapshots and resets both overrides', () => {
    const linked = {
      directorySnapshot: { name: 'Old', amountMinor: -100, version: 1 },
      nameOverride: 'Mine',
      valueOverride: { kind: 'none' as const },
    };
    expect(effectiveDirectoryFields(linked, { name: 'New', amountMinor: -200 })).toEqual({
      name: 'Mine',
      amountMinor: null,
    });
    expect(resetDirectoryOverrides(linked)).toEqual(
      expect.not.objectContaining({ nameOverride: expect.anything() }),
    );
  });
});
