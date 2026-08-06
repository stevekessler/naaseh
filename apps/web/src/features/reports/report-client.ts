import { zeroUrgencyCounts, type Urgency, type UrgencyCounts } from '@naaseh/domain';
import { db } from '../../db/database.js';
import { decryptLocalValue, encryptLocalValue } from '../../db/task-repository.js';
import type { CompletionFilterValue } from './CompletionFilters.js';
import type { CompletionDetailRow, CompletionReportError } from './CompletionDashboard.js';

export interface CompletionReportPayload {
  asOf: string;
  total: number;
  urgencyCounts: UrgencyCounts;
  buckets: Array<{ key: string; count: number; urgencyCounts?: UrgencyCounts }>;
}

export class ReportProblem extends Error {
  constructor(public readonly kind: CompletionReportError, message: string) {
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
    throw new ReportProblem('calculation_failed', 'The report request timed out. Retry the report.');
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
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
    timeZone: filters.timeZone,
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
  }>(
    `/api/v1/reporting/completion-report/drilldown?${completionReportQuery(filters, cursor)}`,
  );
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
  return { asOf: new Date().toISOString(), total: 0, urgencyCounts: zeroUrgencyCounts(), buckets: [] };
}

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function downloadCompletionCsv(rows: readonly CompletionDetailRow[]) {
  const lines = [
    'label,urgency,overallRank,projectRank',
    ...rows.map((row) =>
      [row.label, row.urgencyAtCompletion, row.overallRank ?? '', row.projectRank ?? '']
        .map(csvCell)
        .join(','),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'completion-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}
