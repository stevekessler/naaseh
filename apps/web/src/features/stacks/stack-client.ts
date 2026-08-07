import type { Urgency, WorkReference } from '@naaseh/domain';
import type { Filters } from '../../search/task-search.js';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import type { StackDisplayItem } from './StackRow.js';

export type StackReadError = 'invalid_cursor' | 'expired_cursor' | 'context_changed' | 'failed' | 'timeout';

export class StackReadProblem extends Error {
  constructor(public readonly kind: StackReadError, message: string) {
    super(message);
  }
}

type WireStackItem = {
  work: {
    id?: string;
    workId?: string;
    workType: 'task' | 'list';
    membershipEpoch?: string;
    version?: number;
    label?: string;
    name?: string;
    urgency: Urgency;
  };
  rank: { overallPosition: number; projectPosition?: number };
};

type StackPage = { items: WireStackItem[]; nextCursor: string | null };

const problemKind = (status: number, code?: string): StackReadError => {
  if (status === 410 || code === 'cursor_expired') return 'expired_cursor';
  if (status === 409 || code === 'pagination_context_changed') return 'context_changed';
  if (status === 400 || code === 'invalid_cursor') return 'invalid_cursor';
  return 'failed';
};

const pathFor = (scope: LocalStackScope) =>
  scope.scopeType === 'overall'
    ? '/api/v1/stacks/overall'
    : `/api/v1/projects/${encodeURIComponent(scope.scopeId)}/stack`;

function queryFor(filters: Filters, cursor?: string) {
  const query = new URLSearchParams({ limit: '50', contentType: filters.contentType ?? 'all' });
  if (filters.urgencies.length) query.set('urgencies', filters.urgencies.join(','));
  if (cursor) query.set('cursor', cursor);
  return query;
}

export async function readFilteredStack(
  scope: LocalStackScope,
  filters: Filters,
  localLabels: ReadonlyMap<string, string>,
): Promise<StackDisplayItem[]> {
  const rows: StackDisplayItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    let response: Response;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      response = await fetch(`${pathFor(scope)}?${queryFor(filters, cursor)}`, {
        credentials: 'include',
        signal: controller.signal,
      });
    } catch {
      throw new StackReadProblem('timeout', 'Filtered stack read timed out.');
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      throw new StackReadProblem(
        problemKind(response.status, problem.code),
        problem.message ?? `Unable to read the filtered stack (${response.status}).`,
      );
    }
    const page = (await response.json()) as StackPage;
    for (const item of page.items) {
      const workId = item.work.id ?? item.work.workId;
      if (!workId) continue;
      const reference: WorkReference = {
        workType: item.work.workType,
        workId,
        membershipEpoch: item.work.membershipEpoch ?? String(item.work.version ?? 1),
      };
      rows.push({
        reference,
        label:
          item.work.label ??
          item.work.name ??
          localLabels.get(`${reference.workType}:${workId}`) ??
          (reference.workType === 'task' ? 'To-do' : 'List'),
        urgency: item.work.urgency,
        overallPosition: item.rank.overallPosition,
        ...(item.rank.projectPosition === undefined
          ? {}
          : { projectPosition: item.rank.projectPosition }),
      });
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new StackReadProblem(
        'context_changed',
        'The filtered stack pagination context changed. Restart the filtered read.',
      );
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return rows;
}
