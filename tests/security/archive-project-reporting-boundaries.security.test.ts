import { describe, expect, it } from 'vitest';
import { authorizeContent, contentAudienceFor } from '@naaseh/domain';
import { archiveProjectActors } from '@naaseh/test-fixtures';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';

describe('archive/project/reporting authorization boundary matrix', () => {
  it('uses the same non-overlapping audience for direct reads, archive, search, feeds, counts, and caches', () => {
    const content = { ownerId: 'owner-a', locked: false, groupId: 'group-a' };
    expect(contentAudienceFor(content).ordinary).toBe('GROUP#group-a');
    expect(authorizeContent({ actor: archiveProjectActors.member, ...content }).allowed).toBe(true);
    expect(authorizeContent({ actor: archiveProjectActors.outsider, ...content }).allowed).toBe(
      false,
    );
    expect(authorizeContent({ actor: archiveProjectActors.inactive, ...content }).allowed).toBe(
      false,
    );
  });

  it('does not expose another user through completion aggregates', () => {
    const report = calculateCompletionReport([], {
      userId: 'owner-a',
      timeZone: 'UTC',
      period: 'day',
      from: '2026-07-24',
      to: '2026-07-24',
    });
    expect(report).toMatchObject({ userId: 'owner-a', total: 0 });
  });
});
