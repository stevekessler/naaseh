export type ImportReviewIssueKind =
  | 'possible-duplicate'
  | 'pending-posted-identity'
  | 'provisional-reconciliation'
  | 'merchant-ambiguous'
  | 'allocation-invalidated';

export interface ImportReviewIssue {
  id: string;
  accountId: string;
  kind: ImportReviewIssueKind;
  candidateIds: string[];
  providerSourceIdentity?: string;
  status: 'open' | 'resolved' | 'dismissed';
  decision?: 'reconciled' | 'kept-separate';
  resolvedBy?: string;
  resolvedAt?: string;
  version: number;
}

export function createImportReviewIssue(input: {
  id: string;
  accountId: string;
  kind: ImportReviewIssueKind;
  candidateIds: readonly string[];
  providerSourceIdentity?: string;
}): ImportReviewIssue {
  if (input.candidateIds.length < 1 || input.candidateIds.length > 100) {
    throw new Error('A review issue requires 1–100 candidates.');
  }
  if (new Set(input.candidateIds).size !== input.candidateIds.length) {
    throw new Error('Review issue candidates must be distinct.');
  }
  if (input.kind === 'provisional-reconciliation' && !input.providerSourceIdentity) {
    throw new Error('A reconciliation review requires provider source identity.');
  }
  return { ...input, candidateIds: [...input.candidateIds], status: 'open', version: 1 };
}

export function resolveImportReviewIssue(
  issue: ImportReviewIssue,
  decision: 'reconciled' | 'kept-separate',
  actorId: string,
  now = new Date(),
): ImportReviewIssue {
  if (issue.status !== 'open') throw new Error('Only open review issues can be resolved.');
  if (issue.kind !== 'provisional-reconciliation')
    throw new Error('This review issue does not accept a reconciliation decision.');
  return {
    ...issue,
    status: 'resolved',
    decision,
    resolvedBy: actorId,
    resolvedAt: now.toISOString(),
    version: issue.version + 1,
  };
}

export function dismissImportReviewIssue(
  issue: ImportReviewIssue,
  actorId: string,
  now = new Date(),
): ImportReviewIssue {
  if (issue.status !== 'open') throw new Error('Only open review issues can be dismissed.');
  return {
    ...issue,
    status: 'dismissed',
    resolvedBy: actorId,
    resolvedAt: now.toISOString(),
    version: issue.version + 1,
  };
}
