import { describe, expect, it } from 'vitest';
import {
  financeTextGrams,
  shortTextPostingKey,
  updateTextPostingBit,
  textPostingOrdinals,
} from '../../apps/api/src/finance/text-postings.js';

describe('compact exact short-text posting protocol', () => {
  it('normalizes full-width text and indexes complete Unicode characters without splitting surrogate pairs', () => {
    expect(financeTextGrams('ＣＡＦÉ')).toEqual(financeTextGrams('café'));
    const grams = financeTextGrams('🙂a');
    expect(grams).toContain('🙂');
    expect(grams).toContain('🙂a');
    for (const gram of grams) expect(() => encodeURIComponent(gram)).not.toThrow();
  });

  it('sets immutable bitmaps at chunk boundaries and never expands more than 500 facts from a row', () => {
    const empty = new Uint8Array(63);
    const updated = updateTextPostingBit(updateTextPostingBit(empty, 0, true), 499, true);
    expect(textPostingOrdinals(updated, 0)).toEqual([499, 0]);
    expect([...empty].every((value) => value === 0)).toBe(true);
    expect(textPostingOrdinals(updateTextPostingBit(empty, 500, true), 500)).toEqual([500]);
    expect(() => updateTextPostingBit(empty, -1, true)).toThrow();
  });

  it('binds posting chunks to account, exact short gram and UTC month with ordered chunk identities', () => {
    const a = shortTextPostingKey('a1', 'a', '2026-10', 499);
    const b = shortTextPostingKey('a1', 'a', '2026-10', 500);
    expect(a.PK).toBe('FINANCE#FACT_SEARCH#a1#text#a');
    expect(a.SK).toBe('DATE#2026-10#000000000000');
    expect(b.SK).toBe('DATE#2026-10#000000000001');
    expect(shortTextPostingKey('a2', 'a', '2026-10', 0).PK).not.toBe(a.PK);
    expect(shortTextPostingKey('a1', 'a', '2026-11', 0).SK).not.toBe(a.SK);
  });

  it('removes one source without dropping another and rejects malformed/overlong bitmaps', () => {
    const initial = updateTextPostingBit(
      updateTextPostingBit(new Uint8Array(63), 20, true),
      21,
      true,
    );
    expect(textPostingOrdinals(updateTextPostingBit(initial, 20, false), 0)).toEqual([21]);
    expect(() => textPostingOrdinals(new Uint8Array(64), 0)).toThrow();
    const invalid = new Uint8Array(63);
    invalid[62] = 255;
    expect(() => textPostingOrdinals(invalid, 0)).toThrow();
  });
});
