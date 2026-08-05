import { normalizeUrgencySet, type Urgency } from '@naaseh/domain';
import {
  PaginationCursorError,
  createPaginationCursorPayload,
  decodePaginationCursor,
  encodePaginationCursor,
  validatePaginationCursorContext,
  type PaginationCursorContext,
} from '../shared/pagination-cursor.js';
import type { PaginationCursorCodec } from '../shared/persistent-pagination-cursor.js';

export const MAX_FILTERED_STACK_CANDIDATES = 1_000;
export const MAX_FILTERED_STACK_SOURCE_PAGES = 4;
export const MAX_FILTERED_STACK_PAGE_SIZE = 200;
export const DEFAULT_FILTERED_STACK_DEADLINE_MS = 900;

export interface FilteredStackCandidate {
  id: string;
  urgency: Urgency;
  canonicalPosition: number;
  sourcePage: number;
  audience?: string | undefined;
  authorized?: boolean | undefined;
  lifecycle?: 'active' | 'archived' | 'deleting' | undefined;
  projectId?: string | undefined;
  categoryId?: string | undefined;
  assigneeId?: string | undefined;
  dueDate?: string | undefined;
  contentType?: 'todos' | 'lists' | undefined;
  [key: string]: unknown;
}

export interface FilteredStackReadContext extends PaginationCursorContext {
  endpoint: 'overall_stack' | 'project_stack' | 'archive' | 'workload' | 'drilldown';
  orderBy: 'overallRank' | 'projectRank' | 'source';
  filters: {
    urgencies?: Urgency[] | undefined;
    from?: string | undefined;
    to?: string | undefined;
    assigneeId?: string | undefined;
    categoryId?: string | undefined;
    projectId?: string | undefined;
    lifecycle?: 'active' | 'archived' | undefined;
    contentType?: 'all' | 'todos' | 'lists' | undefined;
  };
}

export interface FilteredStackReadInput<T extends FilteredStackCandidate> {
  context: FilteredStackReadContext;
  candidates: T[];
  cursor?: string | undefined;
  limit: number;
  cursorSecret?: string | undefined;
  cursorCodec?: PaginationCursorCodec | undefined;
  deadlineMs?: number | undefined;
  hydrateCandidates?: ((candidates: readonly T[]) => Promise<T[]>) | undefined;
  authorizeCandidate?:
    | ((candidate: T, context: FilteredStackReadContext) => boolean | Promise<boolean>)
    | undefined;
}

export interface FilteredStackPage<T extends FilteredStackCandidate> {
  items: T[];
  nextCursor: string | null;
  examinedCandidates: number;
  sourcePagesRead: number;
}

function matchesScope(candidate: FilteredStackCandidate, context: FilteredStackReadContext) {
  if (context.endpoint !== 'project_stack') return true;
  const projectId = context.scope.startsWith('project:')
    ? context.scope.slice('project:'.length)
    : context.scope;
  return candidate.projectId === projectId;
}

function matchesFilters(candidate: FilteredStackCandidate, context: FilteredStackReadContext) {
  const filters = context.filters;
  if (filters.urgencies !== undefined && !filters.urgencies.includes(candidate.urgency))
    return false;
  if (
    filters.from !== undefined &&
    (candidate.dueDate === undefined || candidate.dueDate < filters.from)
  )
    return false;
  if (
    filters.to !== undefined &&
    (candidate.dueDate === undefined || candidate.dueDate > filters.to)
  )
    return false;
  if (filters.assigneeId !== undefined && candidate.assigneeId !== filters.assigneeId) return false;
  if (filters.categoryId !== undefined && candidate.categoryId !== filters.categoryId) return false;
  if (filters.projectId !== undefined && candidate.projectId !== filters.projectId) return false;
  if (filters.lifecycle !== undefined && candidate.lifecycle !== filters.lifecycle) return false;
  if (
    filters.contentType !== undefined &&
    filters.contentType !== 'all' &&
    candidate.contentType !== filters.contentType
  )
    return false;
  return matchesScope(candidate, context);
}

function canonicalCandidates<T extends FilteredStackCandidate>(candidates: readonly T[]): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        left.candidate.canonicalPosition - right.candidate.canonicalPosition ||
        left.index - right.index,
    )
    .map(({ candidate }) => candidate);
}

function normalizeContext(context: FilteredStackReadContext): FilteredStackReadContext {
  const filters = context.filters;
  const defaultLifecycle =
    context.endpoint === 'overall_stack' || context.endpoint === 'project_stack'
      ? 'active'
      : undefined;
  return {
    ...context,
    filters: {
      ...(filters.urgencies?.length ? { urgencies: normalizeUrgencySet(filters.urgencies) } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...((filters.lifecycle ?? defaultLifecycle)
        ? { lifecycle: filters.lifecycle ?? defaultLifecycle }
        : {}),
      contentType: filters.contentType ?? 'all',
    },
  };
}

export async function readFilteredStackPage<T extends FilteredStackCandidate>(
  input: FilteredStackReadInput<T>,
): Promise<FilteredStackPage<T>> {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_FILTERED_STACK_PAGE_SIZE
  )
    throw new PaginationCursorError(400, 'invalid_cursor', 'Page limit is invalid.');

  const context = normalizeContext(input.context);
  const candidates = canonicalCandidates(input.candidates);
  let nextIndex = 0;
  if (input.cursor !== undefined) {
    const cursor = input.cursorCodec
      ? await input.cursorCodec.decode(input.cursor, context.actorId, context.now)
      : decodePaginationCursor(input.cursor, input.cursorSecret);
    validatePaginationCursorContext(cursor, context);
    nextIndex = cursor.nextIndex;
    if (nextIndex > candidates.length)
      throw new PaginationCursorError(400, 'invalid_cursor', 'Cursor position is invalid.');
  }

  const sourcePages = new Set<number>();
  let windowEnd = nextIndex;
  while (windowEnd < candidates.length && windowEnd - nextIndex < MAX_FILTERED_STACK_CANDIDATES) {
    const sourcePage = candidates[windowEnd]!.sourcePage;
    if (!sourcePages.has(sourcePage) && sourcePages.size === MAX_FILTERED_STACK_SOURCE_PAGES) break;
    sourcePages.add(sourcePage);
    windowEnd += 1;
  }

  const rawWindow = candidates.slice(nextIndex, windowEnd);
  const hydrated = input.hydrateCandidates ? await input.hydrateCandidates(rawWindow) : rawWindow;
  const hydratedById = new Map(hydrated.map((candidate) => [candidate.id, candidate] as const));
  const items: T[] = [];
  let examinedCandidates = 0;
  const startedAt = Date.now();
  const deadlineMs = Math.max(1, input.deadlineMs ?? DEFAULT_FILTERED_STACK_DEADLINE_MS);

  for (const candidatePointer of rawWindow) {
    if (examinedCandidates > 0 && Date.now() - startedAt >= deadlineMs) break;
    examinedCandidates += 1;
    nextIndex += 1;
    const candidate = hydratedById.get(candidatePointer.id);
    if (candidate === undefined || candidate.authorized === false) continue;
    if (
      input.authorizeCandidate !== undefined &&
      !(await input.authorizeCandidate(candidate, context))
    )
      continue;
    if (!matchesFilters(candidate, context)) continue;
    items.push(candidate);
    if (items.length === input.limit) break;
  }

  const nextCursor =
    nextIndex < candidates.length
      ? input.cursorCodec
        ? await input.cursorCodec.encode(createPaginationCursorPayload(context, nextIndex))
        : encodePaginationCursor(
            createPaginationCursorPayload(context, nextIndex),
            input.cursorSecret,
          )
      : null;
  return {
    items,
    nextCursor,
    examinedCandidates,
    sourcePagesRead: sourcePages.size,
  };
}
