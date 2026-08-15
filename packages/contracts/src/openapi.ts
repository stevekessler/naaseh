import { z } from 'zod';
import {
  entityTypeSchema,
  attachmentSchema,
  copyJobSchema,
  directoryItemSchema,
  exportJobSchema,
  groupPinSchema,
  mutationOperationSchema,
  defaultUrgency,
  urgencySchema,
  taskInputSchema,
  taskSchema,
  memoDocumentSchema,
  postItColorSchema,
  listItemSchema,
  listSchema,
  ulidSchema,
} from '@naaseh/domain';
import {
  stackSyncMutationSchema,
  urgencyStackRankingContractVersionSchema,
} from './urgency-stack-ranking-openapi.js';
export const enhancedListContractVersion = 2 as const;
export const enhancedListContractVersionSchema = z.literal(enhancedListContractVersion);
export const archiveProjectContractVersionSchema = z.literal(3);
export const featureMigrationStatusSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(['pending', 'running', 'ready', 'failed']),
  })
  .strict();
export const syncVersionNegotiationRequestSchema = z
  .object({ contractVersion: z.number().int().positive() })
  .strict();
export const syncVersionNegotiationResultSchema = z
  .object({
    accepted: z.boolean(),
    requestedVersion: z.number().int().positive(),
    minimumSupportedVersion: z.number().int().positive(),
    currentVersion: z.number().int().positive(),
    migration: featureMigrationStatusSchema,
  })
  .strict();
export const syncCompatibilityProblemSchema = z
  .object({
    type: z.literal('https://naaseh.example/problems/sync-version'),
    reason: z.enum(['client_version_unsupported', 'client_version_newer']),
    requestedVersion: z.number().int(),
    minimumSupportedVersion: z.number().int().positive(),
    currentVersion: z.number().int().positive(),
    retryable: z.boolean(),
  })
  .strict();
export const loginRequestSchema = z
  .object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(1024) })
  .strict();
export const tfaNextStepSchema = z
  .object({
    next: z.enum(['tfa_challenge', 'tfa_enrollment']),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const tfaChallengeRequestSchema = z
  .object({
    method: z.enum(['totp', 'recovery_code']),
    code: z.string().min(6).max(64),
  })
  .strict();
export const tfaEnrollmentResponseSchema = z
  .object({
    secret: z.string().min(16).max(128),
    otpauthUri: z.string().startsWith('otpauth://totp/'),
  })
  .strict();
export const tfaEnrollmentConfirmRequestSchema = z
  .object({ code: z.string().regex(/^[0-9]{6}$/) })
  .strict();
export const factorChangeProofSchema = z
  .object({
    password: z.string().max(256),
    method: z.enum(['totp', 'recovery_code']),
    code: z.string().min(6).max(64),
  })
  .strict();
export const passwordProofSchema = z.object({ password: z.string().max(256) }).strict();
export const passwordChangeRequestSchema = factorChangeProofSchema
  .extend({
    newPassword: z.string().min(12).max(256),
    confirmPassword: z.string().min(12).max(256),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New passwords must match',
    path: ['confirmPassword'],
  });
export const passwordResetRequestSchema = z
  .object({
    username: z.string().trim().min(1).max(128),
    pin: z.string().regex(/^[0-9]{6,12}$/),
    newPassword: z.string().min(12).max(256),
    confirmPassword: z.string().min(12).max(256),
  })
  .strict()
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New passwords must match',
    path: ['confirmPassword'],
  });
export const profileSecurityResponseSchema = z
  .object({
    tfaStatus: z.enum(['disabled', 'enrollment_required', 'enabled', 'recovery_required']),
    enrolledAt: z.string().datetime().nullable().optional(),
    recoveryCodesRemaining: z.number().int().min(0).max(10),
  })
  .strict();
export const taskCreateSchema = taskInputSchema;
const taskHttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'Task links must use HTTPS.');
export const taskPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(300).optional(),
    link: taskHttpsUrlSchema.or(z.literal('')).optional(),
    memo: z.string().max(20_000).optional(),
    memoDocument: memoDocumentSchema.optional(),
    memoHidden: z.boolean().optional(),
    encryptedMemo: z.string().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    dueKind: z.enum(['date', 'timed']).nullable().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    dueTimeZone: z.string().min(1).nullable().optional(),
    assigneeId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    projectId: ulidSchema.nullable().optional(),
    groupId: z.string().min(1).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    visibility: z.enum(['public', 'private']).optional(),
    status: z.enum(['open', 'completed', 'archived']).optional(),
    urgency: urgencySchema.optional(),
    postItColor: postItColorSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Patch cannot be empty.');
export const taskResponseSchema = taskSchema;
export const listCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    groupId: z.string().min(1).optional(),
    projectId: ulidSchema.nullable().optional(),
    urgency: urgencySchema.default(defaultUrgency),
  })
  .strict();
export const listPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    groupId: z.string().min(1).nullable().optional(),
    locked: z.boolean().optional(),
    status: z.enum(['active', 'archived']).optional(),
    projectId: ulidSchema.nullable().optional(),
    urgency: urgencySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Patch cannot be empty.');
export const listResponseSchema = listSchema;
export const listItemCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    amountMinor: z.number().int().safe().nullable().optional(),
    directoryItemId: ulidSchema.optional(),
    directoryVersion: z.number().int().positive().optional(),
  })
  .strict();
export const listItemPatchSchema = z
  .object({
    nameOverride: z.string().trim().min(1).max(300).nullable().optional(),
    valueOverride: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('none') }),
        z.object({ kind: z.literal('amount'), amountMinor: z.number().int().safe() }),
      ])
      .nullable()
      .optional(),
    orderKey: z.string().min(1).max(128).optional(),
  })
  .strict();
export const listItemResponseSchema = listItemSchema;
export const listDetailResponseSchema = z
  .object({ list: listSchema, items: z.array(listItemSchema) })
  .strict();
export const completionRequestSchema = z.object({ completed: z.boolean() }).strict();
export const directoryItemCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    amountMinor: z.number().int().safe().nullable().default(null),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
  })
  .strict();
export const directoryItemPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    amountMinor: z.number().int().safe().nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();
export const directoryItemResponseSchema = directoryItemSchema;
export const directoryListResponseSchema = z
  .object({ items: z.array(directoryItemSchema), cursor: z.string().nullable().optional() })
  .strict();
export const copyJobResponseSchema = copyJobSchema;
export const attachmentResponseSchema = attachmentSchema;
export const attachmentInitiateSchema = z
  .object({
    parentType: z.enum(['task', 'listItem']),
    parentId: ulidSchema,
    originalFilename: z.string().trim().min(1).max(255),
    mediaType: z.string().min(1).max(255),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024),
    checksumSha256: z.string().min(32).max(128),
  })
  .strict();
export const attachmentCompleteSchema = z
  .object({ objectVersionId: z.string().min(1), etag: z.string().min(1) })
  .strict();
export const attachmentUploadGrantSchema = z
  .object({
    attachment: attachmentSchema,
    uploadSessionId: ulidSchema,
    uploadUrl: z.string().url(),
    requiredHeaders: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const taskLockRequestSchema = z.object({ locked: z.boolean() }).strict();
export const exportStartSchema = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();
export const exportJobResponseSchema = exportJobSchema
  .innerType()
  .omit({ stagingPrefix: true, resultKey: true });
const legacyMutationSchema = z.object({
  id: ulidSchema,
  entityId: ulidSchema,
  entityType: z.enum(['task', 'category', 'group']),
  operation: z.enum(['create', 'update', 'delete']),
  baseVersion: z.number().int().nonnegative(),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
});
export const enhancedMutationSchema = z.object({
  id: ulidSchema,
  entityId: ulidSchema,
  entityType: entityTypeSchema,
  operation: mutationOperationSchema,
  baseVersion: z.number().int().nonnegative(),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
});
export const mutationSchema = enhancedMutationSchema;
export const pushRequestSchema = z
  .object({
    contractVersion: z
      .union([
        z.literal(1),
        enhancedListContractVersionSchema,
        archiveProjectContractVersionSchema,
        urgencyStackRankingContractVersionSchema,
        z.literal(5),
      ])
      .default(1),
    mutations: z
      .array(z.union([enhancedMutationSchema, stackSyncMutationSchema]))
      .min(1)
      .max(100),
    backlog: z
      .object({
        depth: z.number().int().min(1).max(100_000),
        oldestAgeSeconds: z.number().int().nonnegative().max(31_536_000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.contractVersion !== 5) {
      request.mutations.forEach((mutation, index) => {
        if (mutation.entityType === 'taskTimer')
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Task timer commands require contract version 5',
            path: ['mutations', index],
          });
      });
    }
    if (request.contractVersion !== 4) {
      request.mutations.forEach((mutation, index) => {
        if (stackSyncMutationSchema.safeParse(mutation).success)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Personal stack operations require contract version 4',
            path: ['mutations', index],
          });
      });
    }
    if (request.contractVersion !== 1) return;
    request.mutations.forEach((mutation, index) => {
      if (!legacyMutationSchema.safeParse(mutation).success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enhanced entities and operations require contract version 2',
          path: ['mutations', index],
        });
      }
    });
  });
export const groupCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    joinPin: groupPinSchema.optional(),
  })
  .strict();
export const groupJoinSchema = z.object({ pin: groupPinSchema.optional() }).strict();
export const groupViewSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    ownerId: z.string().min(1),
    status: z.enum(['active', 'archived']),
    hasJoinPin: z.boolean(),
    joined: z.boolean(),
    role: z.enum(['owner', 'manager', 'member']).optional(),
    version: z.number().int().positive(),
  })
  .strict();
export const groupMembershipViewSchema = z
  .object({
    groupId: z.string().min(1),
    userId: z.string().min(1),
    role: z.enum(['owner', 'manager', 'member']),
    status: z.enum(['active', 'revoked']),
    joinedAt: z.string().datetime(),
    revokedAt: z.string().datetime().optional(),
    version: z.number().int().positive(),
  })
  .strict();
export const groupListResponseSchema = z.object({ items: z.array(groupViewSchema) }).strict();
export const groupDetailResponseSchema = z
  .object({ group: groupViewSchema, members: z.array(groupMembershipViewSchema) })
  .strict();
export const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    defaultAssigneeId: z.string().optional(),
  })
  .strict();
export const provisionUserSchema = z
  .object({
    username: z.string().trim().min(1),
    password: z.string().min(12),
    pin: z.string().min(6),
    displayName: z.string().min(1),
    pictureKey: z.string().optional(),
    role: z.enum(['admin', 'user']).default('user'),
  })
  .strict();
export const pushSubscriptionSchema = z
  .object({
    clientId: z.string(),
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  })
  .strict();
