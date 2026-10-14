import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyJournalEntry } from '../../src/features/journal/JournalEntryEditor.js';
import { JournalRecycleBinPage } from '../../src/features/journal/JournalRecycleBinPage.js';

describe('journal recycle bin', () => {
  it('orders recycled entries newest first and offers restore without plaintext content', () => {
    const older = emptyJournalEntry('owner', '2026-10-01');
    older.projection.lifecycle = 'recycled';
    older.projection.recycledAt = '2026-10-10T12:00:00.000Z';
    const newer = emptyJournalEntry('owner', '2026-10-02');
    newer.projection.lifecycle = 'recycled';
    newer.projection.recycledAt = '2026-10-11T12:00:00.000Z';
    const html = renderToStaticMarkup(
      <JournalRecycleBinPage entries={[older, newer]} restore={async () => undefined} />,
    );
    expect(html.indexOf('2026-10-02')).toBeLessThan(html.indexOf('2026-10-01'));
    expect(html.match(/Restore/gu)).toHaveLength(2);
    expect(html).not.toContain('General notes');
  });
});
