import { describe, expect, it } from 'vitest';
import {
  CSV_HEADERS,
  transformTodosToCsv,
  validateCompletedTaskCsv,
} from '../../apps/api/src/exports/csv-transformer.js';
describe('todo CSV transformation', () => {
  it('uses a fixed RFC 4180 header and escapes Unicode, quotes, and newlines', () => {
    const csv = transformTodosToCsv(
      [
        {
          id: 'b',
          ownerId: 'o',
          label: 'חלב,"now"\nplease',
          link: '',
          memo: 'memo',
          memoHidden: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          visibility: 'public',
          status: 'open',
          version: 1,
        },
      ],
      new Map(),
    );
    expect(csv.split('\r\n')[0]).toBe(CSV_HEADERS.join(','));
    expect(csv).toContain('"חלב,""now""\nplease"');
  });
  it('orders rows deterministically and excludes attachment storage details', () => {
    const csv = transformTodosToCsv(
      [
        {
          id: 'z',
          ownerId: 'o',
          label: 'Z',
          memo: '',
          memoHidden: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          visibility: 'public',
          status: 'open',
          version: 1,
        },
        {
          id: 'a',
          ownerId: 'o',
          label: 'A',
          memo: '',
          memoHidden: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          visibility: 'public',
          status: 'open',
          version: 1,
        },
      ],
      new Map([
        [
          'a',
          [
            {
              id: 'att',
              originalFilename: 'x.pdf',
              mediaType: 'application/pdf',
              sizeBytes: 10,
              status: 'available',
              blobId: 'secret',
            } as any,
          ],
        ],
      ]),
    );
    expect(csv.indexOf(',task,a,')).toBeLessThan(csv.indexOf(',task,z,'));
    expect(csv).not.toContain('secret');
  });

  it('freezes all 56 fields, neutralizes formulas, excludes protected memo data, and validates rows', () => {
    const csv = transformTodosToCsv(
      [
        {
          id: '01J00000000000000000000001',
          ownerId: 'owner',
          label: ' \t=HYPERLINK("bad")',
          link: 'https://example.test',
          memo: '',
          memoHidden: true,
          encryptedMemo: 'ciphertext-must-not-export',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          completedAt: '2026-01-02T00:00:00.000Z',
          completedBy: 'owner',
          visibility: 'public',
          urgency: 'critical',
          status: 'completed',
          postItColor: 'purple',
          version: 4,
        } as any,
      ],
      new Map(),
    );
    expect(CSV_HEADERS).toHaveLength(56);
    expect(csv).toContain("' \t=HYPERLINK");
    expect(csv).not.toContain('ciphertext-must-not-export');
    expect(csv).toContain(',purple,purple,');
    expect(validateCompletedTaskCsv(csv, 1)).toEqual({ rowCount: 1, fieldCount: 56 });
  });
});
