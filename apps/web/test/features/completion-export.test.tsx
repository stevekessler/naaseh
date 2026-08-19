import { createHash } from 'node:crypto';
import { COMPLETED_TASK_CSV_HEADERS } from '@naaseh/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompletionFilters } from '../../src/features/reports/CompletionFilters.js';
import { validateCompletionExport } from '../../src/features/reports/report-client.js';

describe('completed task export UI', () => {
  it('shows report filters without a time-zone control', () => {
    const html = renderToStaticMarkup(
      <CompletionFilters
        value={{
          period: 'day',
          categoryId: '',
          projectId: '',
          timeZone: 'America/Denver',
          weekStartsOn: 0,
          urgencies: [],
        }}
        categories={[]}
        projects={[]}
        change={() => undefined}
      />,
    );
    expect(html).not.toContain('Time zone');
    expect(html).toContain('Completion report filters');
  });

  it('accepts only a CSV whose checksum, headers, and row count all match', async () => {
    const csv = `${COMPLETED_TASK_CSV_HEADERS.join(',')}\r\n${COMPLETED_TASK_CSV_HEADERS.map(
      () => '',
    ).join(',')}\r\n`;
    const bytes = new TextEncoder().encode(csv);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const checksum = createHash('sha256').update(bytes).digest('hex');

    await expect(
      validateCompletionExport(buffer, { checksum, rowCount: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      validateCompletionExport(buffer, { checksum: '0'.repeat(64), rowCount: 1 }),
    ).rejects.toThrow('Export checksum mismatch');
    await expect(validateCompletionExport(buffer, { checksum, rowCount: 2 })).rejects.toThrow(
      'Export row count mismatch',
    );
  });
});
