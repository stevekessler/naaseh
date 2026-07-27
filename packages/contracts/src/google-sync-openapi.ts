import { z } from 'zod';
import { googleConnectionStateSchema, googleSyncConflictSchema } from '@naaseh/domain';

export const googleSyncContractVersion = 1 as const;
export const googleSyncContractVersionSchema = z.literal(googleSyncContractVersion);
export const googleSyncOpenApiPath =
  'specs/004-google-tasks-sync/contracts/google-tasks-sync.openapi.yaml' as const;

export const googleConnectResponseSchema = z
  .object({ authorizationUrl: z.string().url(), expiresAt: z.string().datetime() })
  .strict();

export const googleTaskListChoiceSchema = z
  .object({
    id: z.string().min(1).max(1024),
    title: z.string().min(1).max(1024),
    etag: z.string().optional(),
  })
  .strict();

export const googleSyncSettingsPatchSchema = z
  .object({
    selectedTaskListId: z.string().min(1).max(1024).optional(),
    selectedTaskListTitle: z.string().min(1).max(1024).optional(),
    defaultLocalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    defaultTimeZone: z.string().min(1).max(100).optional(),
    state: z.enum(['active', 'paused']).optional(),
    listChangeMode: z.enum(['leavePrevious', 'deleteNaasehOriginPrevious']).optional(),
    expectedVersion: z.number().int().positive(),
    mutationId: z.string().min(1).max(200),
  })
  .strict();

export const googleSyncPreviewRequestSchema = z
  .object({
    taskListId: z.string().min(1).max(1024),
    publishExisting: z.boolean().default(true),
    importExisting: z.boolean().default(true),
  })
  .strict();

export const googleSyncPreviewSchema = z
  .object({
    publishCount: z.number().int().nonnegative(),
    importCount: z.number().int().nonnegative(),
    skippedPrivateCount: z.number().int().nonnegative(),
    skippedUndatedCount: z.number().int().nonnegative(),
    conflictRiskCount: z.number().int().nonnegative(),
  })
  .strict();

export const googleConflictResolutionSchema = z
  .object({
    source: z.enum(['local', 'google', 'edited']),
    editedValue: z.string().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
    mutationId: z.string().min(1).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'edited' && value.editedValue === undefined)
      context.addIssue({
        code: 'custom',
        path: ['editedValue'],
        message: 'Edited resolution requires a value.',
      });
    if (value.source !== 'edited' && value.editedValue !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['editedValue'],
        message: 'Edited value is only valid for edited resolution.',
      });
  });

export const googleTaskSharingRequestSchema = z
  .object({
    approved: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    mutationId: z.string().min(1).max(200),
  })
  .strict();

export const googleDisconnectRequestSchema = z
  .object({
    cleanup: z.enum(['retain', 'deleteNaasehOrigin']),
    expectedVersion: z.number().int().positive(),
    mutationId: z.string().min(1).max(200),
  })
  .strict();

export const googleDisconnectPreviewSchema = z
  .object({
    linkedCount: z.number().int().nonnegative(),
    naasehOriginCount: z.number().int().nonnegative(),
  })
  .strict();

export const googleSyncStatusSchema = z
  .object({
    state: googleConnectionStateSchema,
    connectionId: z.string().optional(),
    selectedTaskListTitle: z.string().optional(),
    defaultLocalTime: z.string().optional(),
    defaultTimeZone: z.string().optional(),
    version: z.number().int().positive().optional(),
    lastAttemptAt: z.string().datetime().optional(),
    lastSuccessAt: z.string().datetime().optional(),
    pendingCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    quarantineCount: z.number().int().nonnegative(),
    skippedUndatedCount: z.number().int().nonnegative(),
  })
  .strict();

export const googleConflictListSchema = z.array(googleSyncConflictSchema);

export const googleSyncRunStatusSchema = z
  .object({
    runId: z.string().min(1),
    state: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed']),
    trigger: z.enum(['scheduled', 'manual', 'initial', 'disconnect']),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export const googleQuarantineListSchema = z.array(
  z
    .object({
      id: z.string().min(1).max(300),
      direction: z.enum(['toGoogle', 'fromGoogle']),
      type: z.enum(['create', 'update', 'complete', 'reopen', 'archive', 'retire', 'resolve']),
      attemptCount: z.number().int().nonnegative(),
      safeErrorCode: z.string().max(100).optional(),
      providerStatusClass: z
        .string()
        .regex(/^[1-5]xx$/)
        .optional(),
      updatedAt: z.string().datetime(),
    })
    .strict(),
);
