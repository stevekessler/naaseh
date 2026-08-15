import { z } from 'zod';
export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  csrfToken: z.string().min(32),
  sessionEpoch: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  idleExpiresAt: z.string().datetime(),
  absoluteExpiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
});
export type SessionRecord = z.infer<typeof sessionSchema>;
export const loginTransactionSchema = z
  .object({
    tokenDigest: z.string().min(64).max(128),
    userId: z.string().min(1),
    purpose: z.enum(['tfa_challenge', 'tfa_enrollment']),
    sessionEpoch: z.number().int().nonnegative(),
    credentialVersion: z.number().int().nonnegative(),
    attemptCount: z.number().int().min(0).max(5),
    pendingSecretCiphertext: z.string().optional(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    ttl: z.number().int().positive(),
  })
  .strict();
export type LoginTransaction = z.infer<typeof loginTransactionSchema>;
export const sessionActive = (session: SessionRecord, epoch: number, now = new Date()) =>
  !session.revokedAt &&
  session.sessionEpoch === epoch &&
  new Date(session.idleExpiresAt) > now &&
  new Date(session.absoluteExpiresAt) > now;
