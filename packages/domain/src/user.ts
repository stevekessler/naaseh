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
});
export type UserRecord = z.infer<typeof userSchema>;
