import { describe, expect, it } from 'vitest';
import { createListItem, memoDocumentText, plainMemoDocument } from './index.js';

describe('list item rich-text memo', () => {
  it('stores the formatted document alongside its plain-text projection', () => {
    const memoDocument = {
      version: 1 as const,
      blocks: [
        {
          type: 'paragraph' as const,
          runs: [{ text: 'Call the bank', marks: ['bold' as const] }],
        },
      ],
    };
    const item = createListItem(
      '01J00000000000000000000001',
      { name: 'Bills', memo: memoDocumentText(memoDocument), memoDocument },
      'owner',
      undefined,
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(item.memo).toBe('Call the bank');
    expect(item.memoDocument).toEqual(memoDocument);
  });

  it('rejects a document that does not match its searchable text projection', () => {
    expect(() =>
      createListItem(
        '01J00000000000000000000001',
        { name: 'Bills', memo: 'Different', memoDocument: plainMemoDocument('Memo') },
        'owner',
      ),
    ).toThrow('Memo text must match the document projection');
  });
});
