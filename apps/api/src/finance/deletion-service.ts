import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FinanceScope, FinancialTaskLink } from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';

type RecordType =
  | 'account'
  | 'transaction'
  | 'budget'
  | 'reusable-item'
  | 'match'
  | 'task-link'
  | 'merchant'
  | 'category';
export interface DeletionPreview {
  recordType: RecordType;
  recordId: string;
  expectedVersion: number;
  outcome: 'archive' | 'tombstone' | 'permanent-delete';
  dependentCounts: Record<string, number>;
  preservedRecordTypes: string[];
  confirmationToken: string;
  expiresAt: string;
}
export interface DeletionExecutionCheckpoint {
  operationId: string;
  recordType: RecordType;
  recordId: string;
  outcome: DeletionPreview['outcome'];
  nextDependent: number;
  completed: boolean;
  auditTombstone?: {
    recordType: RecordType;
    recordId: string;
    outcome: DeletionPreview['outcome'];
    completedAt: string;
  };
}
const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function createDeletionPreview(input: {
  recordType: RecordType;
  recordId: string;
  expectedVersion: number;
  visibleDependentCounts: Record<string, number>;
  hasReferences: boolean;
  isMistake: boolean;
  now: Date;
  signingSecret: string;
}): DeletionPreview {
  const outcome =
    !input.hasReferences && input.isMistake
      ? 'permanent-delete'
      : input.recordType === 'match' || input.recordType === 'task-link'
        ? 'tombstone'
        : 'archive';
  const expiresAt = new Date(input.now.getTime() + 5 * 60_000).toISOString();
  const claims = JSON.stringify({
    recordType: input.recordType,
    recordId: input.recordId,
    expectedVersion: input.expectedVersion,
    outcome,
    expiresAt,
  });
  const preservedByType: Partial<Record<RecordType, string[]>> = {
    account: ['balance-snapshot', 'transaction-reference'],
    transaction: ['category'],
    budget: ['reconciliation-history'],
    'reusable-item': ['budget-item-copy'],
    match: ['match-audit'],
    'task-link': ['task', 'budget-item'],
    merchant: ['historical-merchant-reference'],
    category: ['historical-category-reference'],
  };
  return {
    recordType: input.recordType,
    recordId: input.recordId,
    expectedVersion: input.expectedVersion,
    outcome,
    dependentCounts: { ...input.visibleDependentCounts },
    preservedRecordTypes: preservedByType[input.recordType] ?? [],
    confirmationToken: `${Buffer.from(claims).toString('base64url')}.${sign(claims, input.signingSecret)}`,
    expiresAt,
  };
}

/**
 * Advances a bounded destructive operation. Actual dependent identifiers are server-only and are
 * represented here only by their count so checkpoints and callers cannot disclose hidden records.
 */
export function advanceDeletionExecution(input: {
  preview: DeletionPreview;
  confirmation: { expectedVersion: number; confirmationToken: string };
  actualDependentCount: number;
  checkpoint?: DeletionExecutionCheckpoint;
  maxPerBatch?: number;
  now: Date;
  signingSecret: string;
}) {
  executeDeletion(input.preview, input.confirmation, input.now, input.signingSecret);
  if (!Number.isSafeInteger(input.actualDependentCount) || input.actualDependentCount < 0) {
    throw new Error('Deletion dependent count is invalid.');
  }
  const maxPerBatch = Math.min(Math.max(input.maxPerBatch ?? 100, 1), 500);
  const operationId = sign(
    `${input.preview.recordType}:${input.preview.recordId}:${input.preview.confirmationToken}`,
    input.signingSecret,
  );
  const checkpoint = input.checkpoint ?? {
    operationId,
    recordType: input.preview.recordType,
    recordId: input.preview.recordId,
    outcome: input.preview.outcome,
    nextDependent: 0,
    completed: false,
  };
  if (
    checkpoint.operationId !== operationId ||
    checkpoint.recordType !== input.preview.recordType ||
    checkpoint.recordId !== input.preview.recordId ||
    checkpoint.outcome !== input.preview.outcome
  )
    throw new Error('Deletion checkpoint does not match the confirmed preview.');
  if (checkpoint.completed) return checkpoint;
  const nextDependent = Math.min(
    checkpoint.nextDependent + maxPerBatch,
    input.actualDependentCount,
  );
  const completed = nextDependent === input.actualDependentCount;
  return {
    ...checkpoint,
    nextDependent,
    completed,
    ...(completed
      ? {
          auditTombstone: {
            recordType: input.preview.recordType,
            recordId: input.preview.recordId,
            outcome: input.preview.outcome,
            completedAt: input.now.toISOString(),
          },
        }
      : {}),
  } satisfies DeletionExecutionCheckpoint;
}

export function executeDeletion(
  preview: DeletionPreview,
  confirmation: { expectedVersion: number; confirmationToken: string },
  now: Date,
  signingSecret: string,
) {
  if (
    confirmation.expectedVersion !== preview.expectedVersion ||
    confirmation.confirmationToken !== preview.confirmationToken
  )
    throw new Error('Deletion preview is stale.');
  const [encoded, signature] = confirmation.confirmationToken.split('.');
  if (!encoded || !signature) throw new Error('Invalid deletion confirmation.');
  const claims = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = sign(claims, signingSecret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error('Invalid deletion confirmation.');
  if (now >= new Date(preview.expiresAt)) throw new Error('Deletion preview expired.');
  return {
    recordId: preview.recordId,
    outcome: preview.outcome,
    categoriesPreserved: preview.recordType === 'transaction',
  };
}

export function createAuthorizedDeletionPreview(
  actor: FinanceActor,
  scope: FinanceScope,
  input: Parameters<typeof createDeletionPreview>[0],
) {
  if (!authorizeFinanceScope(actor, scope, 'delete').allowed) {
    throw new Error('Finance record not found.');
  }
  return createDeletionPreview(input);
}

export function createFinancialTaskLinkDeletionPreview(input: {
  actor: FinanceActor;
  groupId: string;
  link: FinancialTaskLink;
  now: Date;
  signingSecret: string;
}) {
  return createAuthorizedDeletionPreview(
    input.actor,
    { type: 'group', groupId: input.groupId },
    {
      recordType: 'task-link',
      recordId: input.link.id,
      expectedVersion: input.link.version,
      visibleDependentCounts: { task: 1, budgetItem: 1 },
      hasReferences: true,
      isMistake: false,
      now: input.now,
      signingSecret: input.signingSecret,
    },
  );
}
