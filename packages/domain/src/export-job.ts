import { z } from 'zod';
import { ulidSchema } from './primitives.js';
export const exportManifestSchema = z
  .object({
    rowCount: z.number().int().nonnegative(),
    byteLength: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
export const exportJobSchema = z
  .object({
    id: ulidSchema,
    requestedByPrincipal: z.string().min(1),
    status: z.enum([
      'pending',
      'exporting',
      'transforming',
      'ready',
      'acknowledged',
      'expired',
      'failed',
    ]),
    snapshotTime: z.string().datetime(),
    manifest: exportManifestSchema.optional(),
    stagingPrefix: z.string().optional(),
    resultKey: z.string().optional(),
    downloadExpiresAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    failureCode: z
      .enum(['authorization', 'snapshot', 'transform', 'verification', 'expired', 'storage'])
      .optional(),
  })
  .strict()
  .superRefine((job, ctx) => {
    if (job.status === 'ready' && !job.manifest)
      ctx.addIssue({
        code: 'custom',
        path: ['manifest'],
        message: 'Ready exports require a verified manifest.',
      });
  });
export type ExportJob = z.infer<typeof exportJobSchema>;
export function transitionExportJob(
  job: ExportJob,
  status: ExportJob['status'],
  patch: Partial<ExportJob> = {},
  now = new Date(),
): ExportJob {
  const allowed: Record<ExportJob['status'], ExportJob['status'][]> = {
    pending: ['exporting', 'failed'],
    exporting: ['transforming', 'failed'],
    transforming: ['ready', 'failed'],
    ready: ['acknowledged', 'expired'],
    acknowledged: [],
    expired: [],
    failed: [],
  };
  if (!allowed[job.status].includes(status)) throw new Error('Invalid export job transition.');
  return exportJobSchema.parse({ ...job, ...patch, status, updatedAt: now.toISOString() });
}
