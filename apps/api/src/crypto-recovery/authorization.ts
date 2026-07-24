import { z } from 'zod';

const recoveryAuthorizationBase = z.object({
  actorId: z.string().min(1).max(128),
  role: z.literal('recovery'),
  recoveryApproved: z.literal(true),
  approvalId: z.string().min(1).max(128),
  isolatedEnvironment: z.literal(true),
});

const recoveryAuthorizationSchema = z.discriminatedUnion('approvalKind', [
  recoveryAuthorizationBase
    .extend({
      approvalKind: z.literal('manual'),
      approvalExpiresAt: z.string().datetime(),
    })
    .strict(),
  recoveryAuthorizationBase
    .extend({
      approvalKind: z.literal('scheduled-quarterly'),
      scheduledAt: z.string().datetime(),
    })
    .strict(),
]);

export type RecoveryAuthorization = z.infer<typeof recoveryAuthorizationSchema>;

export class RecoveryAuthorizationError extends Error {
  readonly code = 'recovery_authorization_denied';

  constructor() {
    super('Recovery authorization was not approved.');
    this.name = 'RecoveryAuthorizationError';
  }
}

/**
 * Fail closed unless the caller supplies the complete short-lived recovery approval.
 * The isolated-environment claim is mandatory because recovery roles must never mutate
 * production resources. IAM is the primary boundary; this is the application-level guard.
 */
export function authorizeRecovery(claims: unknown, now: Date = new Date()): RecoveryAuthorization {
  const parsed = recoveryAuthorizationSchema.safeParse(claims);
  if (!parsed.success) throw new RecoveryAuthorizationError();
  if (
    parsed.data.approvalKind === 'manual' &&
    Date.parse(parsed.data.approvalExpiresAt) <= now.getTime()
  )
    throw new RecoveryAuthorizationError();
  if (parsed.data.approvalKind === 'scheduled-quarterly') {
    const age = now.getTime() - Date.parse(parsed.data.scheduledAt);
    if (age < 0 || age > 2 * 60 * 60 * 1_000) throw new RecoveryAuthorizationError();
  }
  return parsed.data;
}

export function canRecover(claims: unknown, now: Date = new Date()): boolean {
  try {
    authorizeRecovery(claims, now);
    return true;
  } catch {
    return false;
  }
}
