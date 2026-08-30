import { z } from 'zod';
import {
  crisisPlanCiphertextSchema,
  crisisPlanMutationSchema,
  crisisPlanOwnerWrapSchema,
  crisisPlanRecipientGrantSchema,
  crisisPlanRecordSchema,
  crisisPlanRotationStateSchema,
  crisisPlanShareSchema,
} from '@naaseh/domain';

export const crisisPlanContractVersion = 6 as const;
export const crisisPlanErrorCodeSchema = z.enum([
  'CRISIS_PLAN_REQUIRED',
  'CRISIS_PLAN_NOT_FOUND',
  'CRISIS_PLAN_CONFLICT',
  'CRISIS_PLAN_ROTATION_REQUIRED',
  'CRISIS_PLAN_RECIPIENT_LIMIT',
  'CRISIS_PLAN_ONLINE_REQUIRED',
  'CRISIS_PLAN_ACCESS_DENIED',
  'CRISIS_PLAN_INVALID',
]);
export const crisisPlanProblemSchema = z
  .object({
    code: crisisPlanErrorCodeSchema,
    message: z.string().min(1).max(500),
    correlationId: z.string().min(1).max(128),
    currentVersion: z.number().int().positive().optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  })
  .strict();
export const crisisPlanOwnerSummarySchema = crisisPlanRecordSchema
  .pick({
    planId: true,
    version: true,
    keyGeneration: true,
    rotationState: true,
    body: true,
    ownerWrap: true,
    updatedAt: true,
  })
  .strict();
export const crisisPlanSharedSummarySchema = z
  .object({
    planId: crisisPlanRecordSchema.shape.planId,
    owner: z
      .object({ id: z.string().min(1).max(128), displayName: z.string().min(1).max(200) })
      .strict(),
    version: z.number().int().positive(),
    keyGeneration: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const crisisPlanCreateRequestSchema = z
  .object({
    mutationId: z.string().uuid(),
    planId: crisisPlanRecordSchema.shape.planId,
    baseVersion: z.literal(0),
    keyGeneration: z.literal(1),
    body: crisisPlanCiphertextSchema,
    ownerWrap: crisisPlanOwnerWrapSchema,
  })
  .strict();
export const crisisPlanReplaceRequestSchema = z
  .object({
    mutationId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    keyGeneration: z.number().int().positive(),
    body: crisisPlanCiphertextSchema,
    ownerWrap: crisisPlanOwnerWrapSchema,
  })
  .strict();
export const crisisPlanResponseSchema = crisisPlanOwnerSummarySchema;
export const crisisPlanSyncPushSchema = z
  .object({
    version: z.literal(6),
    clientId: z.string().min(1).max(128),
    mutations: z.array(crisisPlanMutationSchema).max(100),
  })
  .strict();
export const crisisPlanSyncChangeSchema = z
  .object({
    sequence: z.number().int().positive(),
    entityType: z.literal('crisisPlan'),
    entityId: crisisPlanRecordSchema.shape.planId,
    entityVersion: z.number().int().positive(),
    payload: z.union([crisisPlanRecordSchema, crisisPlanShareSchema]),
  })
  .strict();
export const crisisPlanSyncPullSchema = z
  .object({
    version: z.literal(6),
    changes: z.array(crisisPlanSyncChangeSchema).max(100),
    cursor: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .strict();
export const crisisPlanActiveUserSchema = z
  .object({
    id: z.string().min(1).max(128),
    displayName: z.string().min(1).max(200),
    username: z.string().min(1).max(200),
  })
  .strict();
export const crisisPlanActiveUserSearchResponseSchema = z
  .object({
    users: z.array(crisisPlanActiveUserSchema).max(20),
    nextCursor: z.string().max(512).optional(),
  })
  .strict();
export const crisisPlanShareRequestSchema = z
  .object({
    mutationId: z.string().uuid(),
    recipientId: z.string().min(1).max(128),
    baseVersion: z.number().int().positive(),
    grant: crisisPlanRecipientGrantSchema,
  })
  .strict();
export const crisisPlanShareListSchema = z
  .object({
    shares: z.array(crisisPlanShareSchema).max(90),
    rotationState: crisisPlanRotationStateSchema,
  })
  .strict();
export const crisisPlanRotationRequestSchema = z
  .object({
    mutationId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    keyGeneration: z.number().int().positive(),
    body: crisisPlanCiphertextSchema,
    ownerWrap: crisisPlanOwnerWrapSchema,
    grants: z
      .array(
        z
          .object({
            recipientId: z.string().min(1).max(128),
            grant: crisisPlanRecipientGrantSchema,
          })
          .strict(),
      )
      .max(90),
  })
  .strict();
export const sharingKeyRegistrySchema = z
  .object({
    keyVersion: z.number().int().positive(),
    publicKeySpki: z.string().min(400).max(4096),
    signingPublicKeySpki: z.string().min(300).max(4096),
    signingAlgorithm: z.literal('RSA-PSS-SHA256'),
    signature: z.string().min(128).max(4096),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const crisisPlanBrokerRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    planId: crisisPlanRecordSchema.shape.planId,
    ownerId: z.string().min(1).max(128),
    shareVersion: z.number().int().positive(),
    keyGeneration: z.number().int().positive(),
    ephemeralPublicKeySpki: z.string().min(400).max(4096),
  })
  .strict();
export const crisisPlanBrokerResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    algorithm: z.literal('RSA-OAEP-256'),
    wrappedCpk: z.string().min(128).max(8192),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const crisisPlanRoutes = Object.freeze([
  { method: 'GET', path: '/journal/crisis-plan', cacheControl: 'no-store' },
  { method: 'POST', path: '/journal/crisis-plan', cacheControl: 'no-store' },
  { method: 'PUT', path: '/journal/crisis-plan', cacheControl: 'no-store' },
  { method: 'GET', path: '/journal/crisis-plan/shareable-users', cacheControl: 'no-store' },
  { method: 'GET', path: '/journal/crisis-plan/shares', cacheControl: 'no-store' },
  { method: 'POST', path: '/journal/crisis-plan/shares', cacheControl: 'no-store' },
  { method: 'POST', path: '/journal/crisis-plan/broker', cacheControl: 'no-store' },
  {
    method: 'POST',
    path: '/journal/crisis-plan/shares/{recipientId}/revoke',
    cacheControl: 'no-store',
  },
  { method: 'POST', path: '/journal/crisis-plan/rotate', cacheControl: 'no-store' },
  { method: 'GET', path: '/journal/crisis-plan/shared', cacheControl: 'no-store' },
  { method: 'GET', path: '/journal/crisis-plan/shared/{planId}', cacheControl: 'no-store' },
  {
    method: 'POST',
    path: '/journal/crisis-plan/shared/{planId}/remove-access',
    cacheControl: 'no-store',
  },
  { method: 'GET', path: '/journal/crisis-plan/sharing-key', cacheControl: 'no-store' },
] as const);
