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
export const sessionActive = (session: SessionRecord, epoch: number, now = new Date()) =>
  !session.revokedAt &&
  session.sessionEpoch === epoch &&
  new Date(session.idleExpiresAt) > now &&
  new Date(session.absoluteExpiresAt) > now;
