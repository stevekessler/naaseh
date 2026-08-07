import {
  deterministicCopyId,
  exportJobSchema,
  transitionExportJob,
  type ExportJob,
} from '@naaseh/domain';
import { getRecord, putRecord } from '../shared/store.js';
import { keys } from '../shared/keys.js';
export async function findExportJob(id: string) {
  return (await getRecord<{ data: ExportJob }>(keys.exportJob(id).PK, 'CURRENT'))?.data;
}
async function save(job: ExportJob) {
  await putRecord({ ...keys.exportJob(job.id), data: job, version: job.updatedAt });
  return job;
}
export async function startExport(idempotencyKey: string, principal: string, now = new Date()) {
  const jobId = /^[0-9A-HJKMNP-TV-Z]{26}$/.test(idempotencyKey)
    ? idempotencyKey
    : deterministicCopyId(principal, idempotencyKey);
  const existing = await findExportJob(jobId);
  if (existing) {
    if (existing.requestedByPrincipal !== principal)
      throw new Error('Idempotency key belongs to another principal.');
    return existing;
  }
  const timestamp = now.toISOString();
  return save(
    exportJobSchema.parse({
      id: jobId,
      requestedByPrincipal: principal,
      status: 'pending',
      snapshotTime: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
}
export async function updateExport(
  job: ExportJob,
  status: ExportJob['status'],
  patch: Partial<ExportJob> = {},
) {
  return save(transitionExportJob(job, status, patch));
}
export function publicExportJob(job: ExportJob) {
  const safe = { ...job };
  delete safe.stagingPrefix;
  delete safe.resultKey;
  return safe;
}

/** Build an owner-private rank overlay; callers must pass only the requesting viewer's ranks. */
export async function viewerExportRanks(
  workIds: readonly string[],
  loadRank: (workId: string) => Promise<{ overallRank?: number; projectRank?: number } | undefined>,
) {
  return new Map(
    (
      await Promise.all(workIds.map(async (workId) => [workId, await loadRank(workId)] as const))
    ).filter((entry): entry is readonly [string, { overallRank?: number; projectRank?: number }] =>
      Boolean(entry[1]),
    ),
  );
}
