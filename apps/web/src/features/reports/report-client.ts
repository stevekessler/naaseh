import { zeroUrgencyCounts, type Urgency, type UrgencyCounts } from '@naaseh/domain';
import { db } from '../../db/database.js';
import { decryptLocalValue, encryptLocalValue } from '../../db/task-repository.js';
import type { CompletionFilterValue } from './CompletionFilters.js';
import type { CompletionDetailRow, CompletionReportError } from './CompletionDashboard.js';
import {
  COMPLETED_TASK_CSV_HEADERS,
  completionExportJobResponseSchema,
  type CompletionExportRequest,
} from '@naaseh/contracts';

export interface CompletionReportPayload {
  asOf: string;
  total: number;
  urgencyCounts: UrgencyCounts;
  buckets: Array<{ key: string; count: number; urgencyCounts?: UrgencyCounts }>;
}

export class ReportProblem extends Error {
  constructor(
    public readonly kind: CompletionReportError,
    message: string,
  ) {
    super(message);
  }
}

const reportKey = (userId: string) => `completion-report-cache:${userId}`;

const errorKind = (status: number, code?: string): CompletionReportError => {
  if (status === 410 || code === 'cursor_expired') return 'expired_cursor';
  if (status === 409 || code === 'pagination_context_changed') return 'context_changed';
  if (status === 400 && code === 'invalid_cursor') return 'invalid_cursor';
  return 'calculation_failed';
};

async function readJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', signal: controller.signal });
  } catch {
    throw new ReportProblem(
      'calculation_failed',
      'The report request timed out. Retry the report.',
    );
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new ReportProblem(
      errorKind(response.status, problem.code),
      problem.message ?? `Unable to calculate this report (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

export function completionReportQuery(filters: CompletionFilterValue, cursor?: string) {
  const query = new URLSearchParams({
    period: filters.period,
    browserTimeZone: filters.timeZone,
    weekStartsOn: String(filters.weekStartsOn),
  });
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.projectId) query.set('projectId', filters.projectId);
  if (filters.urgencies.length) query.set('urgencies', filters.urgencies.join(','));
  if (cursor) query.set('cursor', cursor);
  return query;
}

export async function fetchCompletionReport(filters: CompletionFilterValue) {
  return readJson<CompletionReportPayload>(
    `/api/v1/reporting/completion-report?${completionReportQuery(filters)}`,
  );
}

export async function saveCompletionReportCache(userId: string, report: CompletionReportPayload) {
  const value = await encryptLocalValue('completionReport', userId, report);
  await db.settings.put({ key: reportKey(userId), value: JSON.stringify(value) });
}

export async function readCompletionReportCache(userId: string) {
  const stored = await db.settings.get(reportKey(userId));
  if (!stored) return undefined;
  try {
    return await decryptLocalValue<CompletionReportPayload>(
      'completionReport',
      userId,
      JSON.parse(stored.value),
    );
  } catch {
    return undefined;
  }
}

export async function fetchCompletionDetail(filters: CompletionFilterValue, cursor?: string) {
  const page = await readJson<{
    items: Array<{
      eventId: string;
      workId: string;
      urgencyAtCompletion: Urgency;
      overallRank?: number;
      projectRank?: number;
    }>;
    nextCursor: string | null;
  }>(`/api/v1/reporting/completion-report/drilldown?${completionReportQuery(filters, cursor)}`);
  return {
    rows: page.items.map(
      (item): CompletionDetailRow => ({
        id: item.eventId,
        label: `To-do ${item.workId}`,
        urgencyAtCompletion: item.urgencyAtCompletion,
        ...(item.overallRank === undefined ? {} : { overallRank: item.overallRank }),
        ...(item.projectRank === undefined ? {} : { projectRank: item.projectRank }),
      }),
    ),
    nextCursor: page.nextCursor,
  };
}

export function emptyCompletionReport(): CompletionReportPayload {
  return {
    asOf: new Date().toISOString(),
    total: 0,
    urgencyCounts: zeroUrgencyCounts(),
    buckets: [],
  };
}

type CompletionExportJob = ReturnType<typeof completionExportJobResponseSchema.parse>;

async function completionExportRequest(
  path: string,
  init?: RequestInit,
): Promise<CompletionExportJob> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) throw new Error(`Completion export failed (${response.status}).`);
  return completionExportJobResponseSchema.parse(await response.json());
}

function csvRecordCount(csv: string) {
  let records = 0;
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    if (csv[index] === '"') {
      if (quoted && csv[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && csv[index] === '\r' && csv[index + 1] === '\n') {
      records += 1;
      index += 1;
    }
  }
  if (quoted) throw new Error('Downloaded CSV is malformed.');
  return records;
}

async function sha256Hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function validateCompletionExport(
  bytes: ArrayBuffer,
  expected: { checksum: string; rowCount: number },
) {
  if ((await sha256Hex(bytes)) !== expected.checksum) throw new Error('Export checksum mismatch.');
  const text = new TextDecoder().decode(bytes);
  if (text.split('\r\n', 1)[0] !== COMPLETED_TASK_CSV_HEADERS.join(','))
    throw new Error('Export header mismatch.');
  if (csvRecordCount(text) !== expected.rowCount + 1) throw new Error('Export row count mismatch.');
}

export async function downloadVerifiedCompletionExport(job: CompletionExportJob) {
  if (!job.downloadAvailable || !job.downloadUrl || !job.checksum || job.rowCount === undefined)
    throw new Error('Completion export is not ready.');
  const response = await fetch(job.downloadUrl);
  if (!response.ok) throw new Error('Completion export download failed.');
  const bytes = await response.arrayBuffer();
  await validateCompletionExport(bytes, { checksum: job.checksum, rowCount: job.rowCount });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'completed-tasks.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export async function runCompletionExport(
  filters: CompletionFilterValue,
  csrfToken: string,
  scope: CompletionExportRequest['scope'] = 'self',
  adminConfirmed = false,
) {
  const body: CompletionExportRequest = {
    filters: {
      period: filters.period,
      weekStartsOn: filters.weekStartsOn,
      urgencies: filters.urgencies,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    },
    browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    asOf: new Date().toISOString(),
    idempotencyKey: crypto.randomUUID(),
    scope,
    adminConfirmed,
  };
  let job = await completionExportRequest('/api/v1/reporting/completion-export', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(body),
  });
  for (
    let attempt = 0;
    attempt < 240 && !['completed', 'failed'].includes(job.status);
    attempt += 1
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    job = await completionExportRequest(`/api/v1/reporting/completion-export/${job.id}`);
  }
  if (job.status !== 'completed') throw new Error('Completion export did not complete.');
  await downloadVerifiedCompletionExport(job);
  return job;
}
