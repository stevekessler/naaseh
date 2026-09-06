import { describe, expect, it } from 'vitest';
import { resolveJournalTaskLabel } from '../../apps/web/src/features/journal/journal-task-options.js';

describe('journal task references', () => {
  it('grant no authorization and disclose no historical label when access disappears', () => {
    expect(resolveJournalTaskLabel([], 'encrypted-task-id')).toBe('Task unavailable');
  });
});
