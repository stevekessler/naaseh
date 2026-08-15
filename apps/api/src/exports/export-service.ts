import {
  deterministicCopyId,
  exportJobSchema,
  transitionExportJob,
  type ExportJob,
} from '@naaseh/domain';
import { getRecord, putRecord } from '../shared/store.js';
import { keys } from '../shared/keys.js';
import { createHash } from 'node:crypto';
import {
  COMPLETED_TASK_CSV_SCHEMA_VERSION,
  completionExportRequestSchema,
  type CompletionExportRequest,
} from '@naaseh/contracts';
import { SafeApiError } from '../shared/http.js';
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

const stableRequest = (request: CompletionExportRequest) =>
  JSON.stringify({
    ...request,
    filters: {
      ...request.filters,
      urgencies: [...request.filters.urgencies].sort(),
    },
  });

export async function startCompletionExport(
  input: unknown,
  principal: string,
  administrator: boolean,
  authorizedGroupIds: readonly string[] = [],
  now = new Date(),
) {
  const request = completionExportRequestSchema.parse(input);
  if (request.scope === 'all_users' && (!administrator || !request.adminConfirmed))
    throw new SafeApiError(403, 'forbidden', 'Request rejected.', 'authorization');
  const jobId = deterministicCopyId(principal, request.idempotencyKey);
  const fingerprint = createHash('sha256').update(stableRequest(request)).digest('hex');
  const existing = await findExportJob(jobId);
  if (existing) {
    if (existing.requestedByPrincipal !== principal || existing.requestFingerprint !== fingerprint)
      throw new SafeApiError(
        409,
        'idempotency_mismatch',
        'The idempotency key was already used for a different export.',
        'conflict',
      );
    return existing;
  }
  const timestamp = now.toISOString();
  return save(
    exportJobSchema.parse({
      id: jobId,
      requestedByPrincipal: principal,
      exportKind: 'completed_tasks',
      schemaVersion: COMPLETED_TASK_CSV_SCHEMA_VERSION,
      scope: request.scope,
      normalizedFilters: request.filters,
      browserTimeZone: request.browserTimeZone,
      requestFingerprint: fingerprint,
      adminConfirmed: request.adminConfirmed,
      authorizedGroupIds: [...new Set(authorizedGroupIds)].sort(),
      status: 'pending',
      snapshotTime: request.asOf,
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

export function publicCompletionExportJob(job: ExportJob, downloadUrl?: string) {
  const status =
    job.status === 'ready' || job.status === 'acknowledged'
      ? 'completed'
      : job.status === 'failed' || job.status === 'expired'
        ? 'failed'
        : job.status === 'transforming'
          ? 'validating'
          : job.status === 'exporting'
            ? 'running'
            : 'pending';
  return {
    id: job.id,
    status,
    schemaVersion: job.schemaVersion ?? COMPLETED_TASK_CSV_SCHEMA_VERSION,
    asOf: job.snapshotTime,
    ...(job.manifest ? { rowCount: job.manifest.rowCount, checksum: job.manifest.sha256 } : {}),
    downloadAvailable: job.status === 'ready' && Boolean(downloadUrl),
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(job.failureCode ? { errorClass: job.failureCode } : {}),
  };
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
