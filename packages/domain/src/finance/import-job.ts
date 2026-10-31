export type ImportJobStatus =
  | 'queued'
  | 'running'
  | 'partial'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export interface ImportJob {
  id: string;
  connectionId: string;
  status: ImportJobStatus;
  windowStart?: string;
  windowEnd?: string;
  counts: {
    accounts: number;
    inserted: number;
    updated: number;
    duplicateSuppressed: number;
    reviewIssues: number;
  };
  errors: ReadonlyArray<{ class: string; message: string }>;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
}

export function createImportJob(
  id: string,
  connectionId: string,
  windowStart?: string,
  windowEnd?: string,
): ImportJob {
  if (windowStart && windowEnd) {
    const days =
      (Date.parse(`${windowEnd}T00:00:00Z`) - Date.parse(`${windowStart}T00:00:00Z`)) / 86_400_000;
    if (days < 0 || days > 90) throw new Error('Import windows must be between zero and 90 days.');
  }
  return {
    id,
    connectionId,
    status: 'queued',
    ...(windowStart ? { windowStart } : {}),
    ...(windowEnd ? { windowEnd } : {}),
    counts: { accounts: 0, inserted: 0, updated: 0, duplicateSuppressed: 0, reviewIssues: 0 },
    errors: [],
    attempts: 0,
  };
}

export function transitionImportJob(job: ImportJob, status: ImportJobStatus): ImportJob {
  const allowed: Record<ImportJobStatus, ImportJobStatus[]> = {
    queued: ['running', 'cancelled'],
    running: ['partial', 'succeeded', 'failed', 'cancelled'],
    partial: ['running', 'succeeded', 'failed', 'cancelled'],
    succeeded: [],
    failed: ['running'],
    cancelled: [],
  };
  if (!allowed[job.status].includes(status))
    throw new Error(`Invalid import-job transition ${job.status} -> ${status}.`);
  return { ...job, status, attempts: status === 'running' ? job.attempts + 1 : job.attempts };
}
