import { describe, expect, it } from 'vitest';
import { createTask } from './task.js';
import { memoDocumentSchema, memoDocumentText, normalizeMemoDocument } from './memo-document.js';
import { localDueToInstant } from './due-date.js';

describe('modern task memo and due values', () => {
  it('normalizes allowed marks and produces deterministic plain text', () => {
    const document = normalizeMemoDocument({
      version: 1,
      blocks: [
        {
          type: 'paragraph',
          runs: [
            { text: 'Plan ', marks: ['bold'] },
            { text: 'it', marks: ['bold'] },
          ],
        },
        { type: 'orderedList', items: [{ runs: [{ text: 'First', marks: ['italic'] }] }] },
      ],
    });
    expect(memoDocumentSchema.parse(document)).toEqual(document);
    expect(document.blocks[0]).toMatchObject({ runs: [{ text: 'Plan it', marks: ['bold'] }] });
    expect(memoDocumentText(document)).toBe('Plan it\n1. First');
  });

  it('supports date-only and timed tasks without requiring a stored timezone', () => {
    expect(
      createTask({ label: 'Date', urgency: 'medium', dueKind: 'date', dueDate: '2026-08-15' }, 'u')
        .dueDate,
    ).toBe('2026-08-15');
    expect(
      createTask(
        { label: 'Timed', urgency: 'medium', dueKind: 'timed', dueAt: '2026-08-15T18:00:00.000Z' },
        'u',
      ).dueAt,
    ).toBeTruthy();
  });

  it('rejects nonexistent DST wall times and never rounds an off-grid value', () => {
    expect(() => localDueToInstant('2026-03-08', '02:30')).toThrow(/does not exist/i);
    expect(localDueToInstant('2026-08-15', '10:07').localTime).toBe('10:07');
  });
});
