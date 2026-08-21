import { z } from 'zod';
export const userSchema = z.object({
  id: z.string(),
  username: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((v) => v.toLocaleLowerCase('en-US')),
  displayName: z.string().min(1).max(200),
  pictureKey: z.string().optional(),
  role: z.enum(['admin', 'user']),
  active: z.boolean(),
  sessionEpoch: z.number().int().nonnegative().default(0),
  credentialVersion: z.number().int().nonnegative().default(0),
  tfaStatus: z
    .enum(['disabled', 'enrollment_required', 'enabled', 'recovery_required'])
    .default('disabled'),
  tfaEnrolledAt: z.string().datetime().optional(),
  securityUpdatedAt: z.string().datetime().optional(),
  version: z.number().int().positive().default(1),
});
export type UserRecord = z.infer<typeof userSchema>;

export const usernameLookupSchema = z
  .object({ userId: z.string().min(1), canonicalUsername: z.string().min(1).max(100) })
  .strict();
export type UsernameLookup = z.infer<typeof usernameLookupSchema>;
