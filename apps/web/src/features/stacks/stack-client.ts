import type { Urgency, WorkReference } from '@naaseh/domain';
import type { Filters } from '../../search/task-search.js';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import type { StackDisplayItem } from './StackRow.js';

export type StackReadError =
  | 'invalid_cursor'
  | 'expired_cursor'
  | 'context_changed'
  | 'failed'
  | 'timeout';

export class StackReadProblem extends Error {
  constructor(
    public readonly kind: StackReadError,
    message: string,
  ) {
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
    percentComplete?: number;
    dueDate?: string;
  };
  rank: { overallPosition: number; projectPosition?: number };
};

type StackPage = { items: WireStackItem[]; nextCursor: string | null };

type CanonicalStackPage = StackPage & { version: number };

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
  if (filters.progress && filters.progress !== 'all') query.set('progress', filters.progress);
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
      const problem = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
      };
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
        ...(item.work.workType === 'task'
          ? {
              percentComplete: item.work.percentComplete ?? 0,
              ...(item.work.dueDate ? { dueDate: item.work.dueDate } : {}),
            }
          : {}),
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

/**
 * Reload the unfiltered canonical order after the owner feed invalidates a stack.
 * Feed records intentionally contain only a pointer because a filtered permutation
 * can be too large to duplicate into the synchronization feed.
 */
export async function readCanonicalStack(scope: LocalStackScope): Promise<{
  version: number;
  work: WorkReference[];
}> {
  const work: WorkReference[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let version: number | undefined;
  do {
    const query = new URLSearchParams({ limit: '50', contentType: 'all' });
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`${pathFor(scope)}?${query}`, { credentials: 'include' });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
      };
      throw new StackReadProblem(
        problemKind(response.status, problem.code),
        problem.message ?? `Unable to refresh the stack (${response.status}).`,
      );
    }
    const page = (await response.json()) as CanonicalStackPage;
    if (!Number.isSafeInteger(page.version) || page.version < 0)
      throw new StackReadProblem('failed', 'The refreshed stack version is invalid.');
    if (version !== undefined && page.version !== version)
      throw new StackReadProblem('context_changed', 'The stack changed while it was refreshing.');
    version = page.version;
    for (const item of page.items) {
      const workId = item.work.id ?? item.work.workId;
      const membershipEpoch = item.work.membershipEpoch ?? String(item.work.version ?? '');
      if (!workId || !membershipEpoch) continue;
      work.push({ workType: item.work.workType, workId, membershipEpoch });
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor))
      throw new StackReadProblem('context_changed', 'The stack refresh cursor repeated.');
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return { version: version ?? 0, work };
}
