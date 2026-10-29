import { describe, expect, it } from 'vitest';
import { createImportReviewIssue, resolveImportReviewIssue } from './review-issue.js';

describe('Finance import review issues', () => {
  it('bounds distinct candidates and records reconciliation decisions', () => {
    const issue = createImportReviewIssue({
      id: '01J00000000000000000000081',
      accountId: '01J00000000000000000000001',
      kind: 'provisional-reconciliation',
      candidateIds: ['01J00000000000000000000011', '01J00000000000000000000012'],
      providerSourceIdentity: 'fixture-provider-identity',
    });
    expect(() =>
      createImportReviewIssue({
        ...issue,
        candidateIds: [issue.candidateIds[0]!, issue.candidateIds[0]!],
      }),
    ).toThrow(/distinct/i);
    expect(
      resolveImportReviewIssue(
        issue,
        'kept-separate',
        'owner-1',
        new Date('2026-01-04T00:00:00.000Z'),
      ),
    ).toMatchObject({
      status: 'resolved',
      decision: 'kept-separate',
      resolvedBy: 'owner-1',
      version: 2,
    });
  });
});
