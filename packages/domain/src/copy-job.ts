import { z } from 'zod';
import { ulidSchema } from './primitives.js';
export const copyJobSchema = z
  .object({
    id: ulidSchema,
    sourceListId: ulidSchema,
    sourceVersion: z.number().int().positive(),
    destinationListId: ulidSchema,
    requestedBy: z.string().min(1),
    status: z.enum(['pending', 'copying', 'ready', 'failed']),
    itemCount: z.number().int().nonnegative(),
    copiedCount: z.number().int().nonnegative(),
    attachmentCount: z.number().int().nonnegative(),
    linkedCount: z.number().int().nonnegative(),
    checkpoint: z.string().optional(),
    errorCode: z
      .enum(['source_changed', 'authorization_changed', 'storage_failure', 'invalid_source'])
      .optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((job, ctx) => {
    if (job.copiedCount > job.itemCount || job.linkedCount > job.attachmentCount)
      ctx.addIssue({ code: 'custom', message: 'Job progress exceeds its manifest.' });
    if (
      job.status === 'ready' &&
      (job.copiedCount !== job.itemCount || job.linkedCount !== job.attachmentCount)
    )
      ctx.addIssue({ code: 'custom', message: 'Ready jobs must be complete.' });
  });
export type CopyJob = z.infer<typeof copyJobSchema>;
export const deterministicCopyId = (jobId: string, sourceId: string) => {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const input = `${jobId}:${sourceId}`;
  const state = [1779033703, 3144134277, 1013904242, 2773480762];
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    state[index % 4] = Math.imul((state[index % 4] ?? 0) ^ code, 3432918353);
  }
  let value = '0';
  for (let index = 0; index < 25; index += 1) {
    const slot = index % 4;
    let next = state[slot] ?? 0;
    next ^= next << 13;
    next ^= next >>> 17;
    next ^= next << 5;
    state[slot] = next;
    value += alphabet[(next >>> 0) % alphabet.length];
  }
  return value;
};
export function transitionCopyJob(
  job: CopyJob,
  status: CopyJob['status'],
  patch: Partial<CopyJob> = {},
  now = new Date(),
): CopyJob {
  const allowed: Record<CopyJob['status'], CopyJob['status'][]> = {
    pending: ['copying', 'failed'],
    copying: ['copying', 'ready', 'failed'],
    ready: [],
    failed: ['copying'],
  };
  if (!allowed[job.status].includes(status)) throw new Error('Invalid copy job transition.');
  return copyJobSchema.parse({ ...job, ...patch, status, updatedAt: now.toISOString() });
}
