import { z } from 'zod';
import { ulidSchema } from './primitives.js';

const timestampSchema = z.string().datetime();
const providerIdSchema = z.string().min(1).max(1024);
const ianaZoneSchema = z.string().min(1).max(100);

export const googleConnectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'preview',
  'active',
  'paused',
  'reauthRequired',
  'disconnecting',
]);

export const googleTaskSnapshotSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    dueDate: z.string().date(),
    status: z.enum(['open', 'completed']),
  })
  .strict();

export const googleConnectionSchema = z
  .object({
    id: ulidSchema,
    userId: z.string().min(1),
    state: googleConnectionStateSchema,
    selectedTaskListId: providerIdSchema.optional(),
    selectedTaskListTitle: z.string().min(1).max(1024).optional(),
    encryptedRefreshToken: z.string().min(1).optional(),
    tokenKeyVersion: z.string().min(1).optional(),
    scope: z.literal('https://www.googleapis.com/auth/tasks').optional(),
    defaultLocalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('09:00'),
    defaultTimeZone: ianaZoneSchema,
    privateTaskMode: z.literal('exclude').default('exclude'),
    syncIntervalMinutes: z.literal(5).default(5),
    checkpointAt: timestampSchema.optional(),
    overlapMinutes: z.literal(5).default(5),
    lastAttemptAt: timestampSchema.optional(),
    lastSuccessAt: timestampSchema.optional(),
    pendingCount: z.number().int().nonnegative().default(0),
    conflictCount: z.number().int().nonnegative().default(0),
    quarantineCount: z.number().int().nonnegative().default(0),
    skippedUndatedCount: z.number().int().nonnegative().default(0),
    leaseOwner: z.string().min(1).optional(),
    leaseExpiresAt: timestampSchema.optional(),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const requiresList = ['active', 'paused', 'reauthRequired', 'disconnecting'].includes(
      value.state,
    );
    if (requiresList && (!value.selectedTaskListId || !value.encryptedRefreshToken))
      context.addIssue({
        code: 'custom',
        message: 'Active Google state requires a task list and encrypted refresh token.',
      });
    if (value.state === 'preview' && !value.encryptedRefreshToken)
      context.addIssue({
        code: 'custom',
        message: 'Preview state requires an encrypted refresh token.',
      });
    if (Boolean(value.leaseOwner) !== Boolean(value.leaseExpiresAt))
      context.addIssue({ code: 'custom', message: 'Run lease fields must be provided together.' });
  });

export const googleTaskLinkSchema = z
  .object({
    connectionId: ulidSchema,
    userId: z.string().min(1),
    naasehTaskId: ulidSchema,
    googleTaskId: providerIdSchema,
    googleTaskListId: providerIdSchema,
    origin: z.enum(['naaseh', 'google']),
    marker: z
      .string()
      .regex(/^naaseh:[0-9A-HJKMNP-TV-Z]{26}$/)
      .optional(),
    base: googleTaskSnapshotSchema,
    googleEtag: z.string().max(2048).optional(),
    googleUpdatedAt: timestampSchema.optional(),
    localVersion: z.number().int().positive(),
    state: z.enum(['linked', 'pending', 'conflicted', 'quarantined', 'remoteDeleted', 'retired']),
    lastSyncedAt: timestampSchema.optional(),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.origin === 'naaseh' && value.marker !== `naaseh:${value.naasehTaskId}`)
      context.addIssue({
        code: 'custom',
        path: ['marker'],
        message: 'Invalid Naaseh task marker.',
      });
    if (value.origin === 'google' && value.marker)
      context.addIssue({
        code: 'custom',
        path: ['marker'],
        message: 'Imported tasks have no marker.',
      });
  });

export const googleSyncOperationSchema = z
  .object({
    id: z.string().min(1).max(300),
    connectionId: ulidSchema,
    userId: z.string().min(1),
    taskId: ulidSchema.optional(),
    googleTaskId: providerIdSchema.optional(),
    linkTaskId: ulidSchema.optional(),
    direction: z.enum(['toGoogle', 'fromGoogle']),
    type: z.enum(['create', 'update', 'complete', 'reopen', 'archive', 'retire', 'resolve']),
    expectedLocalVersion: z.number().int().positive().optional(),
    expectedLinkVersion: z.number().int().positive().optional(),
    providerRevision: z.string().max(2048).optional(),
    state: z.enum(['pending', 'running', 'succeeded', 'retry', 'quarantined', 'cancelled']),
    attemptCount: z.number().int().nonnegative(),
    nextAttemptAt: timestampSchema.optional(),
    safeErrorCode: z.string().max(100).optional(),
    providerStatusClass: z
      .string()
      .regex(/^[1-5]xx$/)
      .optional(),
    correlationId: z.string().min(1).max(200),
    runId: ulidSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.direction === 'toGoogle' && !value.taskId)
      context.addIssue({
        code: 'custom',
        path: ['taskId'],
        message: 'Outbound operation requires a task.',
      });
    if (value.direction === 'fromGoogle' && !value.googleTaskId)
      context.addIssue({
        code: 'custom',
        path: ['googleTaskId'],
        message: 'Inbound operation requires a Google task.',
      });
  });

export const googleSyncConflictSchema = z
  .object({
    id: ulidSchema,
    connectionId: ulidSchema,
    userId: z.string().min(1),
    taskId: ulidSchema,
    field: z.enum(['title', 'dueDate', 'status']),
    baseValue: z.string().max(2000),
    localValue: z.string().max(2000),
    remoteValue: z.string().max(2000),
    detectedLocalVersion: z.number().int().positive(),
    detectedLinkVersion: z.number().int().positive(),
    state: z.enum(['open', 'resolved', 'superseded']),
    resolutionSource: z.enum(['local', 'google', 'edited']).optional(),
    resolvedValue: z.string().max(2000).optional(),
    resolvedBy: z.string().min(1).optional(),
    resolvedAt: timestampSchema.optional(),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const googleSyncRunSchema = z
  .object({
    id: ulidSchema,
    connectionId: ulidSchema,
    userId: z.string().min(1),
    trigger: z.enum(['scheduled', 'manual', 'initial', 'disconnect']),
    state: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed']),
    checkpointStart: timestampSchema.optional(),
    checkpointEnd: timestampSchema.optional(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    correlationId: z.string().min(1).max(200),
    startedAt: timestampSchema,
    completedAt: timestampSchema.optional(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export const googleTaskSharingConsentSchema = z
  .object({
    taskId: ulidSchema,
    userId: z.string().min(1),
    approved: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: timestampSchema,
  })
  .strict();

export type GoogleConnection = z.infer<typeof googleConnectionSchema>;
export type GoogleTaskSnapshot = z.infer<typeof googleTaskSnapshotSchema>;
export type GoogleTaskLink = z.infer<typeof googleTaskLinkSchema>;
export type GoogleSyncOperation = z.infer<typeof googleSyncOperationSchema>;
export type GoogleSyncConflict = z.infer<typeof googleSyncConflictSchema>;
export type GoogleSyncRun = z.infer<typeof googleSyncRunSchema>;
export type GoogleTaskSharingConsent = z.infer<typeof googleTaskSharingConsentSchema>;
