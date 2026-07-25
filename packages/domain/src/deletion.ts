import { z } from 'zod';
import { ulidSchema } from './primitives.js';

export const deletableResourceTypeSchema = z.enum(['task', 'list', 'category', 'project']);
export const deletionJobStatusSchema = z.enum([
  'pending',
  'locking',
  'purging',
  'publishing',
  'complete',
  'failed',
]);

export const deletionPreviewSchema = z
  .object({
    resourceType: deletableResourceTypeSchema,
    resourceId: ulidSchema,
    displayLabel: z.string().min(1).max(300),
    targetVersion: z.number().int().positive(),
    dependentCounts: z.record(z.string(), z.number().int().nonnegative()),
    blockers: z.array(z.string().min(1).max(120)),
    reportingImpact: z.string().min(1).max(300),
    irreversible: z.literal(true),
    expiresAt: z.string().datetime(),
    confirmationToken: z.string().min(16),
  })
  .strict();
export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;

export const deletionJobSchema = z
  .object({
    id: ulidSchema,
    resourceType: deletableResourceTypeSchema,
    resourceId: ulidSchema,
    requestedBy: z.string().min(1),
    requestMutationId: z.string().min(1),
    targetVersion: z.number().int().positive(),
    dependencyDigest: z.string().min(32),
    status: deletionJobStatusSchema,
    progress: z.number().int().min(0).max(100).default(0),
    checkpoint: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    safeFailureCode: z.string().min(1).max(100).optional(),
  })
  .strict();
export type DeletionJob = z.infer<typeof deletionJobSchema>;

export const deletionLedgerEntrySchema = z
  .object({
    resourceType: deletableResourceTypeSchema,
    resourceId: ulidSchema,
    deletedAt: z.string().datetime(),
    deletionJobId: ulidSchema,
    scopeDigest: z.string().min(32),
    ledgerVersion: z.number().int().positive(),
  })
  .strict();
export type DeletionLedgerEntry = z.infer<typeof deletionLedgerEntrySchema>;
