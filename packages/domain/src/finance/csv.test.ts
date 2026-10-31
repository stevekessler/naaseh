import { describe, expect, it } from 'vitest';
import {
  parseFinanceCsv,
  mapFinanceCsvRows,
  digestCsvBytes,
  digestDuplicateDecisions,
  findSuspectedDuplicates,
} from './csv.js';

describe('Finance CSV parsing', () => {
  it('supports RFC 4180 quoting and UTF-8 content', () => {
    expect(
      parseFinanceCsv('Date,Description,Amount\r\n2026-01-02,"Coffee, tea",-4.25\r\n')[1],
    ).toEqual(['2026-01-02', 'Coffee, tea', '-4.25']);
    expect(parseFinanceCsv('Date,Description,Amount\n2026-01-02,Café,-4.25')[1]?.[1]).toBe('Café');
  });

  it('maps signed and debit/credit amounts and supported dates exactly', () => {
    const rows = parseFinanceCsv(
      'Date,Description,Debit,Credit\n1/2/2026,Coffee,4.25,\n1/3/2026,Refund,,5.00',
    );
    expect(
      mapFinanceCsvRows(rows, {
        dateColumn: 'Date',
        descriptionColumn: 'Description',
        dateFormat: 'M/D/YYYY',
        amountMapping: { mode: 'debit-credit', debitColumn: 'Debit', creditColumn: 'Credit' },
        currency: 'USD',
      }),
    ).toMatchObject([
      { ordinal: 1, amountMinor: -425, transactedAt: '2026-01-02T00:00:00.000Z' },
      { ordinal: 2, amountMinor: 500, transactedAt: '2026-01-03T00:00:00.000Z' },
    ]);
  });

  it('enforces limits and supports cancellation and progress without row content', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => parseFinanceCsv('a\nb', { signal: controller.signal })).toThrow(/cancel/i);
    expect(() => parseFinanceCsv(`a\n${'x'.repeat(100)}`, { maxBytes: 10 })).toThrow(/limit/i);
    const events: unknown[] = [];
    parseFinanceCsv('a\nb\nc', { onProgress: (progress) => events.push(progress) });
    expect(events.at(-1)).toEqual({ rowsParsed: 3, complete: true });
    expect(JSON.stringify(events)).not.toContain('b');
  });

  it('creates stable batch and complete duplicate-decision digests', async () => {
    expect(await digestCsvBytes(new TextEncoder().encode('a,b\r\n1,2\r\n'))).toBe(
      await digestCsvBytes(new TextEncoder().encode('a,b\n1,2\n')),
    );
    await expect(
      digestDuplicateDecisions([2, 4], [{ ordinal: 2, decision: 'include' }]),
    ).rejects.toThrow(/every suspected/i);
    expect(
      await digestDuplicateDecisions(
        [2, 4],
        [
          { ordinal: 4, decision: 'exclude' },
          { ordinal: 2, decision: 'include' },
        ],
      ),
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it('flags value-similar cross-file rows for sequential review without deleting them', () => {
    const candidates = findSuspectedDuplicates(
      [
        {
          ordinal: 1,
          transactedAt: '2026-01-01T00:00:00.000Z',
          amountMinor: -100,
          description: 'Coffee',
        },
      ],
      [{ transactedAt: '2026-01-01T00:00:00.000Z', amountMinor: -100, description: 'Coffee' }],
    );
    expect(candidates).toEqual([{ ordinal: 1, reason: 'same-date-amount-description' }]);
  });
});
