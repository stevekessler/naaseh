import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompletionFilters } from '../../src/features/reports/CompletionFilters.js';

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

  it('derives the browser zone, removes obsolete preference, and verifies before download', () => {
    const client = readFileSync('apps/web/src/features/reports/report-client.ts', 'utf8');
    const preferences = readFileSync('apps/web/src/db/preferences-repository.ts', 'utf8');
    expect(client).toContain('resolvedOptions().timeZone');
    expect(client).toContain('Export checksum mismatch');
    expect(client.indexOf('sha256Hex(bytes)')).toBeLessThan(client.indexOf('link.click()'));
    expect(preferences).toContain("delete('report-time-zone')");
  });
});
