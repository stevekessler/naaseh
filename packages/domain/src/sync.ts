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
  reason: 'version_mismatch' | 'authorization_changed' | 'validation_failed';
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
