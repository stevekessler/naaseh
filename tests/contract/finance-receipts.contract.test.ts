import { financeReceiptPageSchema } from '@naaseh/contracts';
import { describe, expect, it } from 'vitest';
import { parseReceiptByteRange } from '../../apps/api/src/attachments/receipt-content-service.js';

describe('Finance receipt range contract', () => {
  it('accepts a single inclusive bounded byte range', () => {
    expect(parseReceiptByteRange('bytes=0-1048575', 10_000_000)).toEqual({
      start: 0,
      end: 1_048_575,
    });
    expect(parseReceiptByteRange('bytes=9999999-9999999', 10_000_000)).toEqual({
      start: 9_999_999,
      end: 9_999_999,
    });
  });
  it.each([
    undefined,
    'bytes=-5',
    'bytes=1-',
    'bytes=1-2,3-4',
    'bytes=0-1048576',
    'bytes=10-9',
    'bytes=0-10000000',
    'bytes=9007199254740992-9007199254740993',
    'bytes=1.1-2',
  ])('rejects an invalid range %s with 416', (range) => {
    expect(() => parseReceiptByteRange(range, 10_000_000)).toThrow(
      expect.objectContaining({ statusCode: 416 }),
    );
  });
});

it('rejects an unrelated transaction response instead of treating it as a receipt list', () => {
  const transaction = { id: '01J00000000000000000000611', allocations: [] };
  expect(financeReceiptPageSchema.safeParse(transaction).success).toBe(false);
  expect(financeReceiptPageSchema.safeParse({ items: [transaction] }).success).toBe(false);
  expect(financeReceiptPageSchema.parse({ items: [] })).toEqual({ items: [] });
});
