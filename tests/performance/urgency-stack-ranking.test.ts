import { readFileSync } from 'node:fs';
import {
  applyFilteredPermutation,
  applySimpleMove,
  urgencyValues,
  type PersonalStackScope,
  type WorkReference,
} from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  MAX_FILTERED_STACK_CANDIDATES,
  MAX_FILTERED_STACK_SOURCE_PAGES,
  readFilteredStackPage,
  type FilteredStackReadContext,
} from '../../apps/api/src/ranking/filtered-stack-reader.js';
import {
  buildStackAcceptanceTransaction,
  buildStackCompactionTransaction,
  compactStackSnapshot,
  decodeStackOperationChunks,
  MAX_COMPRESSED_STACK_CHUNK_BYTES,
  prepareStackOperationRecords,
  prepareStackSnapshot,
  validateStackSnapshot,
} from '../../apps/api/src/ranking/stack-repository.js';
import {
  createPersonalStackService,
  type PersonalStackReorderResult,
  type PersonalStackServiceRepository,
  type StoredPersonalStackScope,
} from '../../apps/api/src/ranking/stack-service.js';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';
import {
  readAuthorizedWorkViewPage,
  type WorkViewCandidate,
  type WorkViewReadContext,
} from '../../apps/api/src/reporting/work-view-repository.js';
import {
  createPaginationCursorPayload,
  decodePaginationCursor,
  encodePaginationCursor,
  MAX_PAGINATION_CURSOR_BYTES,
  PAGINATION_CURSOR_TTL_MS,
  PaginationCursorError,
  validatePaginationCursorContext,
} from '../../apps/api/src/shared/pagination-cursor.js';
import { calculateWorkloadTree } from '../../apps/web/src/db/workload-selector.js';
import {
  buildUrgencyStackRankingPerformanceFixture,
  PERFORMANCE_GROUP_ID,
  PERFORMANCE_OWNER_ID,
  PERFORMANCE_PROJECT_ID,
  URGENCY_STACK_RANKING_PROFILE,
  urgencyStackRankingPerformanceFixture as fixture,
  withPerformanceSourcePageSize,
  type UrgencyStackRankingPerformanceWork,
} from './fixtures/urgency-stack-ranking.js';

const WARMUP_COUNT = 5;
const SAMPLE_COUNT = 40;
const TARGET_MS = 1_000;

interface JourneyStatistics {
  name: string;
  p50Ms: number;
  p95Ms: number;
  maximumMs: number;
  thresholdPassCount: number;
}

function nearestRank(samples: readonly number[], fraction: number) {
  return [...samples].sort((left, right) => left - right)[
    Math.ceil(samples.length * fraction) - 1
  ]!;
}

async function measureJourney(
  name: string,
  prepare: () => () => unknown | Promise<unknown>,
): Promise<JourneyStatistics> {
  for (let index = 0; index < WARMUP_COUNT; index += 1) await prepare()();
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const run = prepare();
    const startedAt = performance.now();
    await run();
    samples.push(performance.now() - startedAt);
  }
  const statistics = {
    name,
    p50Ms: nearestRank(samples, 0.5),
    // 40 samples make nearest-rank p95 the 38th sorted observation.
    p95Ms: nearestRank(samples, 0.95),
    maximumMs: Math.max(...samples),
    thresholdPassCount: samples.filter((sample) => sample <= TARGET_MS).length,
  };
  console.info(
    JSON.stringify({
      metric: 'urgency-stack-ranking',
      fixtureVersion: URGENCY_STACK_RANKING_PROFILE.version,
      thresholdMs: TARGET_MS,
      ...statistics,
    }),
  );
  expect(statistics.p95Ms, `${name} nearest-rank p95`).toBeLessThanOrEqual(TARGET_MS);
  expect(statistics.thresholdPassCount, `${name} threshold passes`).toBeGreaterThanOrEqual(38);
  return statistics;
}

const countBy = <T, K extends string>(values: readonly T[], select: (value: T) => K) => {
  const counts = Object.fromEntries(
    [...new Set(values.map(select))].map((key) => [key, 0]),
  ) as Record<K, number>;
  for (const value of values) counts[select(value)] += 1;
  return counts;
};

const filteredContext = (
  filters: FilteredStackReadContext['filters'],
): FilteredStackReadContext => ({
  actorId: PERFORMANCE_OWNER_ID,
  accessEpoch: 7,
  endpoint: 'overall_stack',
  scope: 'overall',
  orderBy: 'overallRank',
  filters,
  sourceEpochs: { owner: 11, public: 12, [`group:${PERFORMANCE_GROUP_ID}`]: 13 },
  stackVersion: URGENCY_STACK_RANKING_PROFILE.state.overall.version,
  snapshotGeneration: 4,
  tailWatermark: fixture.overallStack.at(-1)!.membershipEpoch,
  now: Date.parse(URGENCY_STACK_RANKING_PROFILE.fixedNow),
});

const workViewContext = (
  endpoint: WorkViewReadContext['endpoint'] = 'archive',
  filters: WorkViewReadContext['filters'] = { lifecycle: 'active' },
): WorkViewReadContext => ({
  actorId: PERFORMANCE_OWNER_ID,
  accessEpoch: 7,
  endpoint,
  scope: endpoint === 'project_stack' ? `project:${PERFORMANCE_PROJECT_ID}` : 'overall',
  orderBy: endpoint === 'project_stack' ? 'projectRank' : 'source',
  filters,
  sourceEpochs: { owner: 11, public: 12, [`group:${PERFORMANCE_GROUP_ID}`]: 13 },
  now: Date.parse(URGENCY_STACK_RANKING_PROFILE.fixedNow),
});

const refs = (work: readonly UrgencyStackRankingPerformanceWork[]) =>
  work.map(({ reference }) => reference);

class PerformanceStackRepository implements PersonalStackServiceRepository {
  private current: StoredPersonalStackScope;
  private readonly receipts = new Map<string, PersonalStackReorderResult>();

  constructor(
    private readonly scope: PersonalStackScope,
    version: number,
    order: readonly WorkReference[],
  ) {
    this.current = { version, order: [...order] };
  }

  async loadScope(scope: PersonalStackScope) {
    expect(scope).toEqual(this.scope);
    return this.current;
  }

  async findMutation(userId: string, mutationId: string) {
    return this.receipts.get(`${userId}:${mutationId}`);
  }

  async commit(input: Parameters<PersonalStackServiceRepository['commit']>[0]) {
    if (input.expectedVersion !== this.current.version) return false;
    this.current = input.next;
    this.receipts.set(`${input.scope.userId}:${input.mutationId}`, input.result);
    return true;
  }

  state() {
    return this.current;
  }
}

function stackJourney(input: {
  scope: PersonalStackScope;
  version: number;
  stack: readonly WorkReference[];
  work: readonly UrgencyStackRankingPerformanceWork[];
  direction: 'first' | 'last';
}) {
  const repository = new PerformanceStackRepository(input.scope, input.version, input.stack);
  const eligible = input.work.map((item) => ({
    ...item.reference,
    urgency: item.urgency,
    projectId: item.projectId,
    categoryId: item.categoryId,
    assigneeId: item.assigneeId,
    dueDate: item.dueDate,
    lifecycle: item.lifecycle,
    active: true,
    authorized: true,
  }));
  const service = createPersonalStackService({
    repository,
    listEligibleWork: async () => eligible,
  });
  const first = input.stack[0]!;
  const last = input.stack.at(-1)!;
  return async () => {
    const result = await service.reorder({
      actorId: PERFORMANCE_OWNER_ID,
      scope: input.scope,
      mutationId: `performance-${input.scope.scopeType}-${input.direction}`,
      sourceClientId: 'performance-client',
      baseVersion: input.version,
      move:
        input.direction === 'first'
          ? { kind: 'simple_move', movedWork: last, afterWork: first }
          : { kind: 'simple_move', movedWork: first, beforeWork: last },
    });
    expect(result).toMatchObject({ status: 'applied', stackVersion: input.version + 1 });
    expect(
      repository.state().order[input.direction === 'first' ? 0 : input.stack.length - 1],
    ).toEqual(input.direction === 'first' ? last : first);
  };
}

describe('urgency stack ranking target-scale fixture', () => {
  it('is deterministic and matches every canonical distribution', () => {
    expect(fixture.overallWork).toHaveLength(50_000);
    expect(fixture.projectWork).toHaveLength(10_000);
    expect(fixture.overallStack).toHaveLength(50_000);
    expect(fixture.projectStack).toHaveLength(10_000);
    expect(fixture.completionEvents).toHaveLength(40_000);
    expect(countBy(fixture.overallWork, ({ kind }) => kind)).toEqual({
      task: 30_000,
      subtask: 10_000,
      list: 10_000,
    });
    expect(countBy(fixture.projectWork, ({ kind }) => kind)).toEqual({
      task: 6_000,
      subtask: 2_000,
      list: 2_000,
    });
    expect(countBy(fixture.overallWork, ({ urgency }) => urgency)).toEqual(
      Object.fromEntries(urgencyValues.map((urgency) => [urgency, 10_000])),
    );
    expect(countBy(fixture.projectWork, ({ urgency }) => urgency)).toEqual(
      Object.fromEntries(urgencyValues.map((urgency) => [urgency, 2_000])),
    );
    expect(countBy(fixture.overallWork, ({ audienceKind }) => audienceKind)).toEqual({
      owner: 30_000,
      group: 10_000,
      public: 10_000,
    });
    expect(
      countBy(fixture.completionEvents, ({ urgencyAtCompletion }) => urgencyAtCompletion),
    ).toEqual(Object.fromEntries(urgencyValues.map((urgency) => [urgency, 8_000])));
    expect(fixture.overallWork.filter(({ sparseSelector }) => sparseSelector)).toHaveLength(500);
    expect(
      new Set(fixture.completionEvents.map(({ occurredAt }) => occurredAt.slice(0, 10))),
    ).toEqual(
      new Set(
        Array.from({ length: 31 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`),
      ),
    );
    expect(fixture.projectStack[0]).toEqual(fixture.overallStack[4]);
    expect(
      fixture.projectWork.find(({ projectPosition }) => projectPosition === 1)?.overallPosition,
    ).toBe(5);
    expect(fixture.profile.state).toEqual({
      outboxCount: 0,
      overall: { version: 120, snapshotThroughVersion: 100 },
      project: { version: 40, snapshotThroughVersion: 30 },
    });
    expect(buildUrgencyStackRankingPerformanceFixture().checksum).toBe(fixture.checksum);
    expect(fixture.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('urgency stack ranking performance and boundedness', () => {
  it('meets warmed cache read, durable reorder, filtered permutation, and report p95 targets', async () => {
    const overallScope: PersonalStackScope = {
      userId: PERFORMANCE_OWNER_ID,
      scopeType: 'overall',
    };
    const projectScope: PersonalStackScope = {
      userId: PERFORMANCE_OWNER_ID,
      scopeType: 'project',
      scopeId: PERFORMANCE_PROJECT_ID,
    };
    const extraLow = fixture.overallWork.filter(({ urgency }) => urgency === 'extra_low');
    const workloadWork = fixture.overallWork.map((work) => ({
      kind: work.kind === 'list' ? ('list' as const) : ('task' as const),
      lifecycle: work.lifecycle,
      projectId: work.projectId,
      urgency: work.urgency,
    }));

    await measureJourney('20-percent-local-urgency-filter', () => () => {
      expect(fixture.overallWork.filter(({ urgency }) => urgency === 'extra_low')).toHaveLength(
        10_000,
      );
    });
    await measureJourney('1-percent-local-sparse-filter', () => () => {
      expect(fixture.overallWork.filter(({ sparseSelector }) => sparseSelector)).toHaveLength(500);
    });
    await measureJourney('overall-last-to-first-durable-ack', () =>
      stackJourney({
        scope: overallScope,
        version: fixture.profile.state.overall.version,
        stack: fixture.overallStack,
        work: fixture.overallWork,
        direction: 'first',
      }),
    );
    await measureJourney('overall-first-to-last-durable-ack', () =>
      stackJourney({
        scope: overallScope,
        version: fixture.profile.state.overall.version,
        stack: fixture.overallStack,
        work: fixture.overallWork,
        direction: 'last',
      }),
    );
    await measureJourney('project-last-to-first-durable-ack', () =>
      stackJourney({
        scope: projectScope,
        version: fixture.profile.state.project.version,
        stack: fixture.projectStack,
        work: fixture.projectWork,
        direction: 'first',
      }),
    );
    await measureJourney('project-first-to-last-durable-ack', () =>
      stackJourney({
        scope: projectScope,
        version: fixture.profile.state.project.version,
        stack: fixture.projectStack,
        work: fixture.projectWork,
        direction: 'last',
      }),
    );
    await measureJourney('10k-filtered-permutation', () => () => {
      const result = applyFilteredPermutation(fixture.overallStack, {
        kind: 'filtered_permutation',
        movedWork: extraLow.at(-1)!.reference,
        destinationIndex: 0,
        affectedWork: refs(extraLow),
      });
      expect(result[extraLow[0]!.overallPosition - 1]).toEqual(extraLow.at(-1)!.reference);
    });
    await measureJourney('100-row-stack-refresh', () => async () => {
      const page = await readFilteredStackPage({
        context: filteredContext({ urgencies: ['extra_low'] }),
        candidates: fixture.overallWork,
        limit: 100,
      });
      expect(page.items).toHaveLength(100);
    });
    await measureJourney('workload-and-completion-report-filter-change', () => () => {
      const workload = calculateWorkloadTree(fixture.projects, workloadWork, ['critical']);
      const completion = calculateCompletionReport(fixture.completionEvents, {
        userId: PERFORMANCE_OWNER_ID,
        timeZone: 'UTC',
        period: 'month',
        from: '2026-08-01',
        to: '2026-08-31',
        urgencies: ['critical'],
        asOf: '2026-08-31T23:59:59.999Z',
      });
      expect(
        [...workload.projects.values()].reduce(
          (sum, count) => sum + count.taskCount + count.listCount,
          0,
        ),
      ).toBe(10_000);
      expect(completion.total).toBe(8_000);
    });
  }, 180_000);

  it('keeps a 10k filtered operation and 50k snapshot within chunk and transaction limits', () => {
    const scope: PersonalStackScope = { userId: PERFORMANCE_OWNER_ID, scopeType: 'overall' };
    const affectedWork = refs(fixture.overallWork.filter(({ urgency }) => urgency === 'extra_low'));
    const prepared = prepareStackOperationRecords({
      scope,
      operation: {
        id: '01K00400000000000000000000',
        mutationId: '01K00400000000000000000001',
        version: 121,
        acceptedAt: URGENCY_STACK_RANKING_PROFILE.fixedNow,
        outcome: 'pending_compaction',
        kind: 'filtered_permutation',
        affectedCount: affectedWork.length,
      },
      affectedWork,
    });
    expect(prepared.manifest.affectedCount).toBe(10_000);
    expect(
      prepared.chunks.every(
        ({ payload }) => payload.byteLength <= MAX_COMPRESSED_STACK_CHUNK_BYTES,
      ),
    ).toBe(true);
    expect(decodeStackOperationChunks(prepared.manifest, prepared.chunks)).toEqual(affectedWork);
    const acceptance = buildStackAcceptanceTransaction({
      scope,
      expectedVersion: 120,
      prepared,
      expectedOwnerFeedSequence: 120,
    });
    const logicalAcceptanceBytes =
      Buffer.byteLength(JSON.stringify(prepared.manifest)) +
      prepared.chunks.reduce((total, chunk) => total + chunk.payload.byteLength, 0);
    expect(acceptance.TransactItems.length).toBeLessThanOrEqual(100);
    expect(logicalAcceptanceBytes).toBeLessThan(4 * 1024 * 1024);

    const snapshot = prepareStackSnapshot({
      scope,
      generation: 4,
      throughVersion: 120,
      workRefs: fixture.overallStack,
    });
    expect(
      snapshot.chunks.every(
        ({ payload }) => payload.byteLength <= MAX_COMPRESSED_STACK_CHUNK_BYTES,
      ),
    ).toBe(true);
    const compaction = buildStackCompactionTransaction({
      scope,
      expectedStackVersion: 120,
      expectedSnapshotGeneration: 3,
      snapshot,
    });
    const logicalSnapshotBytes = snapshot.chunks.reduce(
      (total, chunk) => total + chunk.payload.byteLength,
      0,
    );
    expect(compaction.TransactItems.length).toBeLessThanOrEqual(100);
    expect(logicalSnapshotBytes).toBeLessThan(4 * 1024 * 1024);
  });

  it('replays versions 101 through 120 and compacts the full 50k order deterministically', () => {
    const scope: PersonalStackScope = { userId: PERFORMANCE_OWNER_ID, scopeType: 'overall' };
    const base = prepareStackSnapshot({
      scope,
      generation: 3,
      throughVersion: 100,
      workRefs: fixture.overallStack,
    });
    let expected = [...fixture.overallStack];
    const operations: Array<Record<string, unknown>> = [];
    for (let version = 101; version <= 120; version += 1) {
      const movedWork = expected.at(-1)!;
      const afterWork = expected[0]!;
      const operation = { version, kind: 'simple_move', movedWork, afterWork };
      operations.push(operation);
      expected = applySimpleMove(expected, { kind: 'simple_move', movedWork, afterWork });
    }
    const compacted = compactStackSnapshot({
      scope,
      current: base,
      operations,
      implicitTail: [],
      generation: 4,
    });
    expect(compacted.throughVersion).toBe(120);
    expect(compacted.generation).toBe(4);
    expect(validateStackSnapshot(compacted)).toEqual(expected);
  });

  it('enforces the 500-to-4,000 candidate budget and four-source-page cap', async () => {
    const noMatches = fixture.overallWork.map((candidate) => ({ ...candidate, authorized: false }));
    const lowerBound = await readAuthorizedWorkViewPage({
      context: workViewContext(),
      candidates: withPerformanceSourcePageSize(noMatches, 125),
      limit: 1,
    });
    expect(lowerBound).toMatchObject({
      items: [],
      examinedCandidates: 500,
      sourcePagesRead: 4,
    });
    expect(lowerBound.nextCursor).not.toBeNull();

    const upperBound = await readAuthorizedWorkViewPage({
      context: workViewContext(),
      candidates: withPerformanceSourcePageSize(noMatches, 1_000),
      limit: 200,
    });
    expect(upperBound).toMatchObject({
      items: [],
      examinedCandidates: 4_000,
      sourcePagesRead: 4,
    });
    expect(upperBound.nextCursor).not.toBeNull();
  });

  it('returns sparse short and empty pages with resumable cursors at scale', async () => {
    const sparse = withPerformanceSourcePageSize(
      fixture.overallWork.map((candidate) => ({
        ...candidate,
        authorized: candidate.sparseSelector,
      })),
      125,
    );
    const shortPage = await readAuthorizedWorkViewPage({
      context: workViewContext(),
      candidates: sparse,
      limit: 200,
    });
    expect(shortPage.items).toHaveLength(5);
    expect(shortPage.examinedCandidates).toBe(500);
    expect(shortPage.sourcePagesRead).toBe(4);
    expect(shortPage.nextCursor).not.toBeNull();

    const delayed = withPerformanceSourcePageSize(
      fixture.overallWork.map((candidate) => ({
        ...candidate,
        authorized: candidate.canonicalPosition > 500,
      })),
      125,
    );
    const emptyPage = await readAuthorizedWorkViewPage({
      context: workViewContext(),
      candidates: delayed,
      limit: 200,
    });
    expect(emptyPage.items).toEqual([]);
    expect(emptyPage.nextCursor).not.toBeNull();
    const resumed = await readAuthorizedWorkViewPage({
      context: workViewContext(),
      candidates: delayed,
      cursor: emptyPage.nextCursor!,
      limit: 200,
    });
    expect(resumed.items).toHaveLength(200);
    expect(resumed.items[0]?.canonicalPosition).toBe(501);
  });

  it('merges overlapping owner, group, and public audience streams exactly once', async () => {
    const candidates: WorkViewCandidate[] = fixture.overallWork.slice(0, 100).flatMap((work) =>
      [`OWNER#${PERFORMANCE_OWNER_ID}`, `GROUP#${PERFORMANCE_GROUP_ID}`, 'PUBLIC'].map(
        (audience) => ({
          id: work.id,
          urgency: work.urgency,
          canonicalPosition: work.canonicalPosition,
          sourcePage: 0,
          audience,
          authorized: true,
          lifecycle: 'active' as const,
          projectId: work.projectId,
          categoryId: work.categoryId,
          assigneeId: work.assigneeId,
          dueDate: work.dueDate,
          contentType: work.contentType,
        }),
      ),
    );
    const page = await readAuthorizedWorkViewPage({
      context: workViewContext(),
      candidates,
      limit: 100,
    });
    expect(page.items).toHaveLength(100);
    expect(new Set(page.items.map(({ id }) => id))).toHaveLength(100);
    expect(page.nextCursor).toBeNull();
  });

  it('keeps cursor state inline, encrypted, context-bound, and valid for exactly the TTL window', () => {
    const context = workViewContext('drilldown', { urgencies: [...urgencyValues] });
    const payload = createPaginationCursorPayload(context, 4_000);
    const cursor = encodePaginationCursor(payload, 'performance-cursor-secret');
    expect(Buffer.byteLength(cursor)).toBeLessThanOrEqual(MAX_PAGINATION_CURSOR_BYTES);
    expect(cursor).not.toContain(PERFORMANCE_OWNER_ID);
    const decoded = decodePaginationCursor(cursor, 'performance-cursor-secret');
    expect(decoded.expiresAt - decoded.issuedAt).toBe(PAGINATION_CURSOR_TTL_MS);
    expect(() =>
      validatePaginationCursorContext(decoded, {
        ...context,
        now: decoded.expiresAt - 1,
      }),
    ).not.toThrow();
    expect(() =>
      validatePaginationCursorContext(decoded, { ...context, now: decoded.expiresAt }),
    ).toThrowError(
      expect.objectContaining<Partial<PaginationCursorError>>({
        status: 410,
        code: 'cursor_expired',
      }),
    );

    const oversizedPayload = createPaginationCursorPayload(
      {
        ...context,
        sourceEpochs: Object.fromEntries(
          Array.from({ length: 500 }, (_, index) => [
            `group:${String(index).padStart(4, '0')}`,
            index,
          ]),
        ),
      },
      4_000,
    );
    expect(() => encodePaginationCursor(oversizedPayload, 'performance-cursor-secret')).toThrow(
      'inline size limit',
    );
  });

  it('bounds personal-stack reads to 1,000 candidates and four source pages', async () => {
    const candidates = withPerformanceSourcePageSize(
      fixture.overallWork.map((candidate) => ({ ...candidate, authorized: false })),
      250,
    );
    const page = await readFilteredStackPage({
      context: filteredContext({ urgencies: ['critical'] }),
      candidates,
      limit: 200,
    });
    expect(page.examinedCandidates).toBe(MAX_FILTERED_STACK_CANDIDATES);
    expect(page.sourcePagesRead).toBe(MAX_FILTERED_STACK_SOURCE_PAGES);
    expect(page.nextCursor).not.toBeNull();
  });

  it('uses maintained Query projections rather than scans for archive and drilldown access', () => {
    const workViews = readFileSync(
      new URL('../../apps/api/src/reporting/work-view-repository.ts', import.meta.url),
      'utf8',
    );
    const archives = readFileSync(
      new URL('../../apps/api/src/lifecycle/archive-repository.ts', import.meta.url),
      'utf8',
    );
    const drilldowns = readFileSync(
      new URL('../../apps/api/src/reporting/organization-tree-service.ts', import.meta.url),
      'utf8',
    );
    expect(workViews).toContain('new QueryCommand');
    expect(workViews).not.toMatch(/\bScanCommand\b/);
    expect(archives).toContain('listProjectedWork');
    expect(drilldowns).toContain('listProjectedWork');
    expect(`${archives}\n${drilldowns}`).not.toMatch(/new\s+ScanCommand/);
  });
});
