import { describe, expect, it } from 'vitest';

type Urgency = 'extra_low' | 'low' | 'medium' | 'high' | 'critical';
type Candidate = {
  id: string;
  urgency: Urgency;
  canonicalPosition: number;
  sourcePage: number;
  audience?: string;
  authorized?: boolean;
  lifecycle?: 'active' | 'archived';
  projectId?: string;
  categoryId?: string;
  assigneeId?: string;
  dueDate?: string;
  contentType?: 'todos' | 'lists';
};
type ReadContext = {
  actorId: string;
  accessEpoch: number;
  endpoint: 'overall_stack' | 'project_stack' | 'archive' | 'workload' | 'drilldown';
  scope: string;
  orderBy: 'overallRank' | 'projectRank' | 'source';
  filters: {
    urgencies?: Urgency[];
    from?: string;
    to?: string;
    assigneeId?: string;
    categoryId?: string;
    projectId?: string;
    lifecycle?: 'active' | 'archived';
    contentType?: 'all' | 'todos' | 'lists';
  };
  sourceEpochs: Record<string, number>;
  stackVersion?: number;
  snapshotGeneration?: number;
  tailWatermark?: string;
  now: number;
};
type Page = {
  items: Candidate[];
  nextCursor: string | null;
  examinedCandidates: number;
  sourcePagesRead: number;
};
type Reader = (input: {
  context: ReadContext;
  candidates: Candidate[];
  cursor?: string;
  limit: number;
}) => Promise<Page>;

async function filteredStackReader(): Promise<Reader> {
  const module = (await import('../../apps/api/src/ranking/filtered-stack-reader.js')) as Record<
    string,
    unknown
  >;
  expect(
    module.readFilteredStackPage,
    'filtered-stack-reader.ts must export readFilteredStackPage',
  ).toBeTypeOf('function');
  return module.readFilteredStackPage as Reader;
}

async function workViewReader(): Promise<Reader> {
  const module = (await import('../../apps/api/src/reporting/work-view-repository.js')) as Record<
    string,
    unknown
  >;
  expect(
    module.readAuthorizedWorkViewPage,
    'work-view-repository.ts must export readAuthorizedWorkViewPage',
  ).toBeTypeOf('function');
  return module.readAuthorizedWorkViewPage as Reader;
}

const baseContext = (overrides: Partial<ReadContext> = {}): ReadContext => ({
  actorId: 'user-a',
  accessEpoch: 7,
  endpoint: 'overall_stack',
  scope: 'overall',
  orderBy: 'overallRank',
  filters: { urgencies: ['extra_low', 'critical'], lifecycle: 'active', contentType: 'all' },
  sourceEpochs: { owner: 3 },
  stackVersion: 11,
  snapshotGeneration: 2,
  tailWatermark: 'tail-8',
  now: Date.parse('2026-08-05T12:00:00.000Z'),
  ...overrides,
});

const candidate = (index: number, overrides: Partial<Candidate> = {}): Candidate => ({
  id: `work-${String(index).padStart(5, '0')}`,
  urgency: index % 2 ? 'critical' : 'extra_low',
  canonicalPosition: index,
  sourcePage: Math.floor(index / 125),
  audience: 'OWNER#user-a',
  authorized: true,
  lifecycle: 'active',
  projectId: 'project-a',
  categoryId: 'category-a',
  assigneeId: 'user-a',
  dueDate: '2026-08-15',
  contentType: index % 3 ? 'todos' : 'lists',
  ...overrides,
});

async function traverse(
  read: Reader,
  context: ReadContext,
  candidates: Candidate[],
  limit: number,
) {
  const items: Candidate[] = [];
  const pageSizes: number[] = [];
  let cursor: string | undefined;
  do {
    const page = await read({ context, candidates, limit, ...(cursor ? { cursor } : {}) });
    items.push(...page.items);
    pageSizes.push(page.items.length);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { items, pageSizes };
}

async function expectCursorError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ status, code });
}

describe('bounded server-side urgency filtering', () => {
  it('applies single/multi urgency with existing filters in overall and Project canonical order', async () => {
    const read = await filteredStackReader();
    const candidates = [
      candidate(1, { urgency: 'critical' }),
      candidate(2, { urgency: 'low' }),
      candidate(3, { urgency: 'extra_low', assigneeId: 'other' }),
      candidate(4, { urgency: 'extra_low' }),
    ];
    const filters = {
      urgencies: ['extra_low', 'critical'] as Urgency[],
      from: '2026-08-01',
      to: '2026-08-31',
      assigneeId: 'user-a',
      categoryId: 'category-a',
      projectId: 'project-a',
      lifecycle: 'active' as const,
      contentType: 'all' as const,
    };
    for (const [endpoint, scope, orderBy] of [
      ['overall_stack', 'overall', 'overallRank'],
      ['project_stack', 'project:project-a', 'projectRank'],
    ] as const) {
      const page = await read({
        context: baseContext({ endpoint, scope, orderBy, filters }),
        candidates,
        limit: 2,
      });
      expect(page.items.map((item) => item.id)).toEqual(['work-00001', 'work-00004']);
    }
  });

  it('counts returned authorized matches, not examined candidates, and traverses exactly once', async () => {
    const read = await filteredStackReader();
    const candidates = Array.from({ length: 1_125 }, (_, index) =>
      candidate(index, {
        urgency: index >= 500 && index % 113 === 0 ? 'critical' : 'low',
        authorized: index % 97 !== 0,
      }),
    );
    const traversal = await traverse(
      read,
      baseContext({ filters: { urgencies: ['critical'], lifecycle: 'active' } }),
      candidates,
      25,
    );
    const expected = candidates.filter(
      (item) => item.urgency === 'critical' && item.authorized !== false,
    );
    expect(traversal.items.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    expect(new Set(traversal.items.map((item) => item.id)).size).toBe(traversal.items.length);
    expect(traversal.pageSizes.some((size) => size === 0)).toBe(true);
  });

  it('returns a non-null cursor after sparse empty/short pages and stops at four 1 MB pages', async () => {
    const read = await filteredStackReader();
    const candidates = Array.from({ length: 900 }, (_, index) =>
      candidate(index, { urgency: index > 700 ? 'critical' : 'low' }),
    );
    const first = await read({
      context: baseContext({ filters: { urgencies: ['critical'] } }),
      candidates,
      limit: 50,
    });
    expect(first.items.length).toBeLessThan(50);
    expect(first.nextCursor).not.toBeNull();
    expect(first.examinedCandidates).toBeLessThanOrEqual(1_000);
    expect(first.sourcePagesRead).toBeLessThanOrEqual(4);
  });

  it('merges owner/public/group work views, deduplicates, reauthorizes, and preserves stable order', async () => {
    const read = await workViewReader();
    const candidates = [
      candidate(1, { audience: 'PUBLIC', lifecycle: 'archived', urgency: 'critical' }),
      candidate(1, { audience: 'GROUP#one', lifecycle: 'archived', urgency: 'critical' }),
      candidate(2, { audience: 'OWNER#user-a', lifecycle: 'archived', urgency: 'extra_low' }),
      candidate(3, { audience: 'GROUP#one', lifecycle: 'archived', authorized: false }),
      candidate(4, { audience: 'GROUP#revoked', lifecycle: 'archived' }),
    ];
    for (const endpoint of ['archive', 'workload', 'drilldown'] as const) {
      const traversal = await traverse(
        read,
        baseContext({
          endpoint,
          scope: endpoint === 'archive' ? 'archive' : 'project:project-a',
          orderBy: 'source',
          filters: { urgencies: ['extra_low', 'critical'], lifecycle: 'archived' },
          sourceEpochs: { owner: 3, public: 8, 'group:one': 5 },
          stackVersion: undefined,
          snapshotGeneration: undefined,
          tailWatermark: undefined,
        }),
        candidates,
        2,
      );
      expect(traversal.items.map((item) => item.id)).toEqual(['work-00001', 'work-00002']);
    }
  });

  it('returns 400 for tampering and actor/route/scope/filter/order cursor reuse', async () => {
    const read = await filteredStackReader();
    const candidates = Array.from({ length: 600 }, (_, index) => candidate(index));
    const context = baseContext();
    const first = await read({ context, candidates, limit: 5 });
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor!;
    const invalidContexts = [
      baseContext({ actorId: 'user-b' }),
      baseContext({ endpoint: 'archive' }),
      baseContext({ scope: 'project:other' }),
      baseContext({ filters: { urgencies: ['high'] } }),
      baseContext({ orderBy: 'projectRank' }),
    ];
    await expectCursorError(
      read({ context, candidates, limit: 5, cursor: `${cursor.slice(0, -1)}x` }),
      400,
      'invalid_cursor',
    );
    for (const changed of invalidContexts)
      await expectCursorError(
        read({ context: changed, candidates, limit: 5, cursor }),
        400,
        'invalid_cursor',
      );
  });

  it('returns 410 after expiry and 409 when access, stack, or source context changes', async () => {
    const read = await filteredStackReader();
    const candidates = Array.from({ length: 600 }, (_, index) => candidate(index));
    const context = baseContext();
    const first = await read({ context, candidates, limit: 5 });
    const cursor = first.nextCursor!;
    await expectCursorError(
      read({
        context: { ...context, now: context.now + 15 * 60 * 1_000 + 1 },
        candidates,
        limit: 5,
        cursor,
      }),
      410,
      'cursor_expired',
    );
    for (const changed of [
      baseContext({ accessEpoch: 8 }),
      baseContext({ stackVersion: 12 }),
      baseContext({ sourceEpochs: { owner: 4 } }),
    ])
      await expectCursorError(
        read({ context: changed, candidates, limit: 5, cursor }),
        409,
        'pagination_context_changed',
      );
  });
});
