import { z } from 'zod';
import { ulidSchema } from '@naaseh/domain';
import { isFinanceScopePartition } from './publication-change-journal.js';
import { financeAccountRelocationSchema } from './publication-relocation.js';

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const financeScopeRevisionVectorSchema = z
  .record(z.string().refine(isFinanceScopePartition), revision)
  .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 80);
const key = z.object({ PK: z.string().max(200), SK: z.string().max(200) }).strict();
const currentSchema = z
  .object({
    scopePK: z.string(),
    revision,
    publicationId: z.string().regex(/^[a-f0-9]{64}$/),
    changeIndex: z.number().int().min(0).max(100),
    modeIndex: z.number().int().min(0).max(2),
    cursor: key.optional(),
    queue: z.array(ulidSchema).max(5).optional(),
    queueNext: key.optional(),
    queueLast: z.boolean().optional(),
  })
  .strict();
export const financeAccountPublicationWindowSchema = z
  .object({
    version: z.literal(1),
    id: ulidSchema,
    generation: z.string().regex(/^[a-f0-9]{64}$/),
    baseline: financeScopeRevisionVectorSchema,
    target: financeScopeRevisionVectorSchema,
    progress: financeScopeRevisionVectorSchema,
    phase: z.enum(['relocation', 'journals', 'deferred', 'enrollment', 'complete']),
    relocationProbes: z.record(z.string().refine(isFinanceScopePartition), revision).optional(),
    relocations: z.array(financeAccountRelocationSchema).max(80).optional(),
    registryOffset: z.number().int().min(0).max(80),
    current: currentSchema.optional(),
  })
  .strict();
export type FinanceAccountPublicationWindow = z.infer<typeof financeAccountPublicationWindowSchema>;
