import { z } from 'zod';
import {
  ciphertextEnvelopeSchema,
  journalEntryCiphertextSchema,
  journalKeyEnvelopeSchema,
  journalMutationSchema,
  ownerRecoveryViewSchema,
} from '@naaseh/domain';

export const journalContractVersion = 5 as const;
export const journalMutationRequestSchema = journalMutationSchema;
export const journalPushRequestSchema = z
  .object({
    version: z.literal(5),
    clientId: z.string().min(1).max(128),
    mutations: z.array(journalMutationSchema).max(100),
  })
  .strict();
export const journalMutationResultSchema = z
  .object({
    mutationId: z.string().uuid(),
    status: z.enum(['applied', 'alreadyApplied', 'conflict', 'rejected']),
    version: z.number().int().positive().optional(),
    conflictKind: z.enum(['version', 'dateToken']).optional(),
  })
  .strict();
export const journalPushResponseSchema = z
  .object({ version: z.literal(5), results: z.array(journalMutationResultSchema) })
  .strict();
export const journalKeyEnvelopeResponseSchema = journalKeyEnvelopeSchema;
export const journalRecoveryViewSchema = ownerRecoveryViewSchema;
export const journalChangeSchema = z
  .object({
    sequence: z.number().int().positive(),
    entityType: z.enum(['journalEntry', 'journalProfile']),
    entityId: z.string().min(1).max(128),
    entityVersion: z.number().int().positive(),
    payload: z.union([journalEntryCiphertextSchema, ciphertextEnvelopeSchema]),
  })
  .strict();
export const journalPullResponseSchema = z
  .object({
    version: z.literal(5),
    changes: z.array(journalChangeSchema).max(100),
    journalCursor: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .strict();
export const journalBootstrapResponseSchema = z
  .object({
    version: z.literal(5),
    records: z.array(journalChangeSchema).max(100),
    nextPageCursor: z.string().max(2048).optional(),
    journalCursor: z.number().int().nonnegative(),
  })
  .strict();
export const journalRoutes = Object.freeze([
  { method: 'GET', path: '/journal/key-envelope', sensitive: true, cacheControl: 'no-store' },
  { method: 'PUT', path: '/journal/key-envelope', sensitive: true, cacheControl: 'no-store' },
  { method: 'POST', path: '/sync/push', sensitive: false },
  { method: 'POST', path: '/sync/pull', sensitive: false },
  { method: 'GET', path: '/sync/bootstrap', sensitive: false },
  { method: 'POST', path: '/journal/recovery/requests', sensitive: true, cacheControl: 'no-store' },
  {
    method: 'GET',
    path: '/journal/recovery/requests/{requestId}',
    sensitive: true,
    cacheControl: 'no-store',
  },
  {
    method: 'POST',
    path: '/journal/recovery/requests/{requestId}/consume',
    sensitive: true,
    cacheControl: 'no-store',
  },
  {
    method: 'POST',
    path: '/admin/journal-recovery/{requestId}/approve',
    sensitive: true,
    cacheControl: 'no-store',
  },
] as const);
