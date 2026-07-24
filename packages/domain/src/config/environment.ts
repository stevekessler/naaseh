import { z } from 'zod';

const schema = z.object({
  VERBOSE_LOGGING: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  AWS_REGION: z.literal('us-west-2').default('us-west-2'),
  NAASEH_TABLE: z.string().default('naaseh-local'),
});

export type Environment = z.infer<typeof schema>;
export const parseEnvironment = (source: Record<string, string | undefined>): Environment =>
  schema.parse(source);
