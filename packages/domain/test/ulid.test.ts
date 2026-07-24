import { describe, expect, it } from 'vitest';
import { createUlid, ulidSchema } from '../src/primitives.js';

describe('ULID identifiers', () => {
  it('creates canonical sortable identifiers', () => {
    const first = createUlid(1_700_000_000_000, new Uint8Array(16));
    const second = createUlid(1_700_000_000_001, new Uint8Array(16));
    expect(ulidSchema.parse(first)).toHaveLength(26);
    expect(first < second).toBe(true);
  });

  it('rejects UUID and ambiguous Crockford characters', () => {
    expect(ulidSchema.safeParse('00000000-0000-4000-8000-000000000000').success).toBe(false);
    expect(ulidSchema.safeParse('0000000000000000000000000I').success).toBe(false);
  });
});
