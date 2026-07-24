import { z } from 'zod';
export const problemSchema = z.object({
  code: z.string(),
  message: z.string(),
  correlationId: z.string(),
});
export type Problem = z.infer<typeof problemSchema>;
