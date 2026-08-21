import { z } from 'zod';
import type { Task } from './task.js';

export const entityTypeSchema = z.enum([
  'task',
  'category',
  'group',
  'list',
  'listItem',
  'directoryItem',
  'attachment',
  'copyJob',
  'accessControl',
  'project',
  'completionEvent',
  'deletionJob',
  'taskTimer',
]);
export type EntityType = z.infer<typeof entityTypeSchema>;
export const supportedEntityTypes = entityTypeSchema.options;
export const isSupportedEntityType = (value: unknown): value is EntityType =>
  entityTypeSchema.safeParse(value).success;

export const mutationOperationSchema = z.enum([
  'create',
  'update',
  'delete',
  'patch',
  'complete',
  'reopen',
  'lock',
  'unlock',
  'resetOverrides',
  'reorder',
  'archive',
  'restore',
  'releaseAttachment',
  'completeAndArchive',
  'reopenAndRestore',
  'finish',
  'assignProject',
  'archiveOrganization',
  'restoreOrganization',
  'timerCommand',
]);
export type MutationOperation = z.infer<typeof mutationOperationSchema>;

export const stableMutationStatusSchema = z.enum([
  'applied',
  'alreadyApplied',
  'duplicate',
  'conflict',
  'rejected',
  'retry',
]);
export type StableMutationStatus = z.infer<typeof stableMutationStatusSchema>;

export const supportedSyncContractVersionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type SupportedSyncContractVersion = z.infer<typeof supportedSyncContractVersionSchema>;
export const currentSyncContractVersion = 5 as const;
export const minimumNegotiatedSyncContractVersion = 4 as const;

const mutationResultIdSchema = z.string().min(1).max(300);
const syncProblemEnvelopeBaseSchema = z
  .object({
    code: z.string().min(1).max(200),
    message: z.string().min(1).max(1_000),
    correlationId: z.string().min(1).max(200),
  })
  .strict();

/** The stable per-mutation result emitted by sync contract version 4. */
export const contractV4MutationResultSchema = z
  .object({
    mutationId: mutationResultIdSchema,
    status: stableMutationStatusSchema,
    version: z.number().int().nonnegative().optional(),
    operationId: mutationResultIdSchema.optional(),
  })
  .strict();
export type ContractV4MutationResult = z.infer<typeof contractV4MutationResultSchema>;

/** Actionable problem returned when a sync operation can be retried safely. */
export const syncRetryEnvelopeSchema = syncProblemEnvelopeBaseSchema
  .extend({ retryAfterSeconds: z.number().int().positive() })
  .strict();
export type SyncRetryEnvelope = z.infer<typeof syncRetryEnvelopeSchema>;

export const stackConflictReasonSchema = z.enum([
  'version_mismatch',
  'anchor_removed',
  'authorization_changed',
  'lifecycle_changed',
  'project_changed',
  'filter_basis_changed',
  'hard_deleted',
]);
export type StackConflictReason = z.infer<typeof stackConflictReasonSchema>;

/** Actionable problem returned for a rejected personal-stack ordering basis. */
export const syncConflictEnvelopeSchema = syncProblemEnvelopeBaseSchema
  .extend({
    reason: stackConflictReasonSchema,
    currentVersion: z.number().int().nonnegative(),
  })
  .strict();
export type SyncConflictEnvelope = z.infer<typeof syncConflictEnvelopeSchema>;

/*
 * Contracts 1-3 used `entityVersion` and could echo hydrated entity/problem
 * data. Keep that read shape isolated here so new writers expose only the v4
 * result fields while upgraded clients can drain an older durable outbox.
 */
export const compatibleMutationResultSchema = z.union([
  contractV4MutationResultSchema,
  z
    .object({
      mutationId: mutationResultIdSchema,
      status: stableMutationStatusSchema,
      version: z.number().int().nonnegative().optional(),
      entityVersion: z.number().int().nonnegative().optional(),
      operationId: mutationResultIdSchema.optional(),
      entity: z.unknown().optional(),
      current: z.unknown().optional(),
      conflict: z.unknown().optional(),
      problem: z.unknown().optional(),
    })
    .passthrough(),
]);
export type CompatibleMutationResult = z.infer<typeof compatibleMutationResultSchema>;

export function normalizeMutationResult(value: unknown): ContractV4MutationResult {
  const parsed = compatibleMutationResultSchema.parse(value);
  const legacyVersion = 'entityVersion' in parsed ? parsed.entityVersion : undefined;
  return contractV4MutationResultSchema.parse({
    mutationId: parsed.mutationId,
    status: parsed.status,
    ...(parsed.version !== undefined
      ? { version: parsed.version }
      : legacyVersion !== undefined
        ? { version: legacyVersion }
        : {}),
    ...(parsed.operationId ? { operationId: parsed.operationId } : {}),
  });
}

export interface Mutation {
  id: string;
  entityId: string;
  entityType: EntityType;
  operation: MutationOperation;
  baseVersion: number;
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export interface SyncConflict<TLocal = Task, TRemote = Task> {
  mutationId: string;
  local: TLocal;
  remote: TRemote;
  reason:
    | 'version_mismatch'
    | 'authorization_changed'
    | 'validation_failed'
    | 'lifecycle_changed'
    | 'project_unavailable'
    | 'hard_deleted';
}
export interface SyncChange {
  audience: string;
  sequence: number;
  entityId: string;
  entityType?: EntityType;
  version?: number;
  operation: 'upsert' | 'tombstone';
  payload?: unknown;
  changedAt: string;
}
export type VectorCursor = Record<string, number>;
export interface StableMutationResult {
  mutationId: string;
  status: StableMutationStatus;
  version?: number;
  conflict?: SyncConflict;
}

export function nextRetryDelay(attempt: number, random = Math.random): number {
  const ceiling = Math.min(30_000, 500 * 2 ** Math.max(0, attempt));
  return Math.floor(ceiling / 2 + (random() * ceiling) / 2);
}
