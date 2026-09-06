import { z } from 'zod';

const base64urlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const positiveVersionSchema = z.number().int().positive();
export const opaqueDateTokenSchema = base64urlSchema.min(43).max(64);
export const ciphertextEnvelopeSchema = z
  .object({
    recordKind: z.enum(['profile', 'projection', 'body']),
    schemaVersion: positiveVersionSchema,
    keyVersion: positiveVersionSchema,
    iv: base64urlSchema.min(16).max(32),
    ciphertext: base64urlSchema.min(24).max(409_600),
    byteSize: z.number().int().min(16).max(307_200),
  })
  .strict();
export type CiphertextEnvelope = z.infer<typeof ciphertextEnvelopeSchema>;
export const ownerWrapSchema = z
  .object({
    algorithm: z.literal('ARGON2ID-AES-256-GCM'),
    salt: base64urlSchema.min(22).max(128),
    parameters: z
      .object({
        memoryKiB: z.number().int().min(65_536).max(262_144),
        iterations: z.number().int().min(2).max(10),
        parallelism: z.number().int().min(1).max(4),
      })
      .strict(),
    iv: base64urlSchema.min(16).max(32),
    ciphertext: base64urlSchema.min(24).max(1024),
  })
  .strict();
export const recoveryWrapSchema = z
  .object({
    algorithm: z.literal('RSA-OAEP-256'),
    authority: z.literal('recovery'),
    keyVersion: positiveVersionSchema,
    ciphertext: base64urlSchema.min(128).max(8192),
  })
  .strict();
export const journalKeyEnvelopeSchema = z
  .object({
    id: z.literal('journal-key'),
    ownerId: z.string().min(1),
    version: positiveVersionSchema,
    keyVersion: positiveVersionSchema,
    ownerWrap: ownerWrapSchema,
    recoveryWrap: recoveryWrapSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type JournalKeyEnvelope = z.infer<typeof journalKeyEnvelopeSchema>;
export const journalEntryCiphertextSchema = z
  .object({
    entryId: z.string().uuid(),
    dateToken: opaqueDateTokenSchema,
    projection: ciphertextEnvelopeSchema.refine((value) => value.recordKind === 'projection'),
    body: ciphertextEnvelopeSchema.refine((value) => value.recordKind === 'body'),
  })
  .strict();
export type JournalEntryCiphertext = z.infer<typeof journalEntryCiphertextSchema>;
export const journalMutationSchema = z
  .object({
    id: z.string().uuid(),
    entityType: z.enum(['journalEntry', 'journalProfile']),
    operation: z.literal('upsert'),
    entityId: z.string().min(1).max(128),
    baseVersion: z.number().int().nonnegative(),
    dateToken: opaqueDateTokenSchema.optional(),
    priorDateToken: opaqueDateTokenSchema.optional(),
    payload: z.union([journalEntryCiphertextSchema, ciphertextEnvelopeSchema]),
    createdAt: z.string().datetime(),
  })
  .strict();
export type JournalMutation = z.infer<typeof journalMutationSchema>;
export interface JournalAadInput {
  ownerId: string;
  recordId: string;
  recordKind: 'profile' | 'projection' | 'body';
  schemaVersion: number;
  keyVersion: number;
  dateToken?: string;
}
export function canonicalJournalAad(input: JournalAadInput): string {
  return [
    'journal',
    input.ownerId,
    input.recordId,
    input.recordKind,
    input.schemaVersion,
    input.keyVersion,
    input.dateToken ?? '',
  ].join('|');
}
export const journalRecoveryStateSchema = z.enum([
  'requested',
  'adminApproved',
  'rewrapped',
  'consumed',
  'completed',
  'cancelled',
  'expired',
  'denied',
]);
export const ownerRecoveryViewSchema = z
  .object({
    requestId: z.string().min(16).max(128),
    state: journalRecoveryStateSchema,
    expiresAt: z.string().datetime(),
    recoveryKeyVersion: positiveVersionSchema.optional(),
  })
  .strict();
