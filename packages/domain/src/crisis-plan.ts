import { z } from 'zod';

const base64urlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/u);
const positiveVersionSchema = z.number().int().positive();
export const CRISIS_PLAN_MAX_RECIPIENTS = 90;
export const CRISIS_PLAN_MAX_CIPHERTEXT_BYTES = 307_200;
export const crisisPlanIdSchema = z.string().uuid().brand<'CrisisPlanId'>();
export const crisisPlanMutationIdSchema = z.string().uuid().brand<'CrisisPlanMutationId'>();
export const crisisPlanShareStateSchema = z.enum(['active', 'revoked', 'recipient_removed']);
export const crisisPlanRotationStateSchema = z.enum(['current', 'rotation_required']);

export const crisisPlanCiphertextSchema = z
  .object({
    algorithm: z.literal('AES-256-GCM'),
    schemaVersion: z.literal(1),
    keyGeneration: positiveVersionSchema,
    iv: base64urlSchema.min(16).max(32),
    ciphertext: base64urlSchema.min(24).max(409_600),
    byteSize: z.number().int().min(16).max(CRISIS_PLAN_MAX_CIPHERTEXT_BYTES),
  })
  .strict();

export const crisisPlanOwnerWrapSchema = z
  .object({
    algorithm: z.literal('JMK-HKDF-AES-256-GCM'),
    keyGeneration: positiveVersionSchema,
    iv: base64urlSchema.min(16).max(32),
    ciphertext: base64urlSchema.min(24).max(1024),
  })
  .strict();

export const crisisPlanRecipientGrantSchema = z
  .object({
    algorithm: z.literal('RSA-OAEP-256'),
    ownerId: z.string().min(1).max(128),
    planId: crisisPlanIdSchema,
    recipientId: z.string().min(1).max(128),
    shareVersion: positiveVersionSchema,
    keyGeneration: positiveVersionSchema,
    sharingKeyVersion: positiveVersionSchema,
    ciphertext: base64urlSchema.min(128).max(8192),
  })
  .strict();

export const crisisPlanRecordSchema = z
  .object({
    planId: crisisPlanIdSchema,
    ownerId: z.string().min(1).max(128),
    version: positiveVersionSchema,
    keyGeneration: positiveVersionSchema,
    rotationState: crisisPlanRotationStateSchema,
    body: crisisPlanCiphertextSchema,
    ownerWrap: crisisPlanOwnerWrapSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const crisisPlanShareBaseSchema = z
  .object({
    planId: crisisPlanIdSchema,
    ownerId: z.string().min(1).max(128),
    recipientId: z.string().min(1).max(128),
    version: positiveVersionSchema,
    state: crisisPlanShareStateSchema,
    grant: crisisPlanRecipientGrantSchema.optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const crisisPlanShareSchema = crisisPlanShareBaseSchema.superRefine((share, context) => {
  if (share.state === 'active' && !share.grant)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Active shares require an encrypted grant.',
      path: ['grant'],
    });
});

export const crisisPlanMutationSchema = z
  .object({
    id: crisisPlanMutationIdSchema,
    entityType: z.literal('crisisPlan'),
    operation: z.enum(['create', 'replace', 'share', 'revoke', 'removeAccess', 'rotate']),
    planId: crisisPlanIdSchema,
    baseVersion: z.number().int().nonnegative(),
    payload: z.union([
      crisisPlanRecordSchema.omit({ ownerId: true, createdAt: true, updatedAt: true }),
      crisisPlanShareBaseSchema.omit({ ownerId: true, updatedAt: true }),
    ]),
    createdAt: z.string().datetime(),
  })
  .strict();

export type CrisisPlanCiphertext = z.infer<typeof crisisPlanCiphertextSchema>;
export type CrisisPlanOwnerWrap = z.infer<typeof crisisPlanOwnerWrapSchema>;
export type CrisisPlanRecipientGrant = z.infer<typeof crisisPlanRecipientGrantSchema>;
export type CrisisPlanRecord = z.infer<typeof crisisPlanRecordSchema>;
export type CrisisPlanShare = z.infer<typeof crisisPlanShareSchema>;
export type CrisisPlanMutation = z.infer<typeof crisisPlanMutationSchema>;

export function assertCrisisPlanRecipientLimit(recipientCount: number): void {
  if (
    !Number.isInteger(recipientCount) ||
    recipientCount < 0 ||
    recipientCount > CRISIS_PLAN_MAX_RECIPIENTS
  )
    throw Object.assign(
      new Error(
        `A Crisis Plan can be shared with at most ${CRISIS_PLAN_MAX_RECIPIENTS} active users.`,
      ),
      { code: 'CRISIS_PLAN_RECIPIENT_LIMIT' },
    );
}

export function assertCrisisPlanVersion(currentVersion: number, baseVersion: number): void {
  if (currentVersion !== baseVersion)
    throw Object.assign(
      new Error('The Crisis Plan changed on another device. Reload it and try again.'),
      { code: 'CRISIS_PLAN_CONFLICT', currentVersion },
    );
}

export const crisisPlanOperations = Object.freeze([
  'create',
  'replace',
  'share',
  'revoke',
  'removeAccess',
  'rotate',
] as const);
export function canonicalCrisisPlanAad(
  ownerId: string,
  planId: string,
  keyGeneration: number,
): string {
  return ['crisis-plan', ownerId, planId, 'body', 1, keyGeneration].join('|');
}
