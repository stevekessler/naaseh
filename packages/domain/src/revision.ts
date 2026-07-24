import { z } from 'zod';
import { ulidSchema } from './primitives.js';
import { entityTypeSchema } from './sync.js';

export const revisionOperationSchema = z.enum([
  'create',
  'update',
  'patch',
  'complete',
  'reopen',
  'archive',
  'restore',
  'privacy',
  'conflict-resolve',
  'delete',
  'lock',
  'unlock',
  'resetOverrides',
  'reorder',
  'releaseAttachment',
]);

export const revisionSyncOutcomeSchema = z.enum(['local-pending', 'applied', 'replayed', 'merged']);
export const revisionValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const taskRevisionSchema = z
  .object({
    id: ulidSchema,
    taskId: ulidSchema,
    mutationId: ulidSchema.optional(),
    sourceClientId: ulidSchema.optional(),
    actorId: z.string().min(1),
    version: z.number().int().positive(),
    changedAt: z.string().datetime(),
    operation: revisionOperationSchema,
    changedFields: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/)).max(50),
    before: revisionValuesSchema.optional(),
    after: revisionValuesSchema.default({}),
    syncOutcome: revisionSyncOutcomeSchema.default('applied'),
    conflictResolution: z
      .object({ sourceVersions: z.array(z.number().int().positive()), strategy: z.string().min(1) })
      .optional(),
  })
  .strict();

export type TaskRevision = z.infer<typeof taskRevisionSchema>;

export const entityRevisionSchema = z
  .object({
    id: ulidSchema,
    entityType: entityTypeSchema,
    entityId: ulidSchema,
    mutationId: ulidSchema.optional(),
    sourceClientId: ulidSchema.optional(),
    actorId: z.string().min(1),
    version: z.number().int().positive(),
    changedAt: z.string().datetime(),
    operation: revisionOperationSchema,
    changedFields: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/)).max(50),
    before: revisionValuesSchema.optional(),
    after: revisionValuesSchema.default({}),
    syncOutcome: revisionSyncOutcomeSchema.default('applied'),
    conflictResolution: z
      .object({ sourceVersions: z.array(z.number().int().positive()), strategy: z.string().min(1) })
      .optional(),
  })
  .strict();

export type EntityRevision = z.infer<typeof entityRevisionSchema>;
