import { describe, expect, it } from 'vitest';
import { journalDocumentSchema } from '@naaseh/domain';
import { isMeaningfulCrisisPlanDocument } from '../../src/features/journal/CrisisPlanEditor.js';

describe('single-field Crisis Plan editor document boundary', () => {
  it('accepts supported structural formatting and rejects formatting-only or unsafe nodes', () => {
    const valid = {
      version: 1 as const,
      blocks: [
        {
          type: 'paragraph' as const,
          children: [
            { type: 'text' as const, text: 'Call someone', marks: ['bold' as const] },
            {
              type: 'link' as const,
              href: 'https://example.test/help',
              children: [{ type: 'text' as const, text: 'Help' }],
            },
          ],
        },
      ],
    };
    expect(journalDocumentSchema.safeParse(valid).success).toBe(true);
    expect(isMeaningfulCrisisPlanDocument(valid)).toBe(true);
    expect(
      isMeaningfulCrisisPlanDocument({
        version: 1,
        blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '   ', marks: ['bold'] }] }],
      }),
    ).toBe(false);
    expect(
      journalDocumentSchema.safeParse({
        version: 1,
        blocks: [{ type: 'image', src: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
    expect(
      journalDocumentSchema.safeParse({
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                href: 'javascript:alert(1)',
                children: [{ type: 'text', text: 'bad' }],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
