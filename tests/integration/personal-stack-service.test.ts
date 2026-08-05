import { describe, expect, it } from 'vitest';
import * as ranking from '../../apps/api/src/ranking/index.js';

type Scope =
  | { userId: string; scopeType: 'overall' }
  | { userId: string; scopeType: 'project'; scopeId: string };
type WorkReference = { workType: 'task' | 'list'; workId: string; membershipEpoch: string };
type EligibleWork = WorkReference & {
  urgency: 'extra_low' | 'low' | 'medium' | 'high' | 'critical';
  projectId?: string;
};
type Move =
  | {
      kind: 'simple_move';
      movedWork: WorkReference;
      beforeWork?: WorkReference;
      afterWork?: WorkReference;
    }
  | {
      kind: 'filtered_permutation';
      movedWork: WorkReference;
      destinationIndex: number;
      affectedWork: WorkReference[];
      filterBasis: { urgencies?: EligibleWork['urgency'][] };
    };
type StoredScope = { version: number; order: WorkReference[] };

interface CommitInput {
  scope: Scope;
  expectedVersion: number;
  next: StoredScope;
  mutationId: string;
  result: ReorderResult;
}

interface StackRepository {
  loadScope(scope: Scope): Promise<StoredScope | undefined>;
  findMutation(userId: string, mutationId: string): Promise<ReorderResult | undefined>;
  commit(input: CommitInput): Promise<boolean>;
}

interface ReorderResult {
  status: 'applied' | 'pending_compaction' | 'conflict' | 'rejected';
  stackVersion: number;
  reason?:
    | 'version_mismatch'
    | 'anchor_removed'
    | 'authorization_changed'
    | 'lifecycle_changed'
    | 'project_changed'
    | 'filter_basis_changed'
    | 'hard_deleted';
}

interface PersonalStackService {
  read(input: { actorId: string; scope: Scope }): Promise<{
    version: number;
    items: EligibleWork[];
  }>;
  reorder(input: {
    actorId: string;
    scope: Scope;
    mutationId: string;
    sourceClientId: string;
    baseVersion: number;
    move: Move;
  }): Promise<ReorderResult>;
}

type CreatePersonalStackService = (dependencies: {
  repository: StackRepository;
  listEligibleWork(scope: Scope): Promise<EligibleWork[]>;
}) => PersonalStackService;

const projectId = '01K00000000000000000000010';
const ids = {
  a: '01K00000000000000000000100',
  b: '01K00000000000000000000101',
  c: '01K00000000000000000000102',
  d: '01K00000000000000000000103',
} as const;
const work = (
  workId: string,
  membershipEpoch: string,
  urgency: EligibleWork['urgency'],
  project = projectId,
  workType: WorkReference['workType'] = 'task',
): EligibleWork => ({ workType, workId, membershipEpoch, urgency, projectId: project });
const a = work(ids.a, '0001', 'critical');
const b = work(ids.b, '0002', 'medium', projectId, 'list');
const c = work(ids.c, '0003', 'extra_low');
const d = work(ids.d, '0004', 'high');
const ref = ({ workType, workId, membershipEpoch }: EligibleWork): WorkReference => ({
  workType,
  workId,
  membershipEpoch,
});
const identity = (value: WorkReference) =>
  `${value.workType}:${value.workId}:${value.membershipEpoch}`;
const scopeKey = (scope: Scope) =>
  scope.scopeType === 'overall'
    ? `${scope.userId}:overall`
    : `${scope.userId}:project:${scope.scopeId}`;

class MemoryStackRepository implements StackRepository {
  readonly scopes = new Map<string, StoredScope>();
  readonly receipts = new Map<string, ReorderResult>();
  activeCommits = 0;
  maxConcurrentCommits = 0;

  async loadScope(scope: Scope) {
    const stored = this.scopes.get(scopeKey(scope));
    return stored ? { version: stored.version, order: [...stored.order] } : undefined;
  }

  async findMutation(userId: string, mutationId: string) {
    return this.receipts.get(`${userId}:${mutationId}`);
  }

  async commit(input: CommitInput) {
    this.activeCommits += 1;
    this.maxConcurrentCommits = Math.max(this.maxConcurrentCommits, this.activeCommits);
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    try {
      const current = this.scopes.get(scopeKey(input.scope)) ?? { version: 0, order: [] };
      if (current.version !== input.expectedVersion) return false;
      this.scopes.set(scopeKey(input.scope), {
        version: input.next.version,
        order: [...input.next.order],
      });
      this.receipts.set(`${input.scope.userId}:${input.mutationId}`, input.result);
      return true;
    } finally {
      this.activeCommits -= 1;
    }
  }
}

function createHarness(initial: Record<string, EligibleWork[]>) {
  const create = (ranking as Record<string, unknown>).createPersonalStackService as
    | CreatePersonalStackService
    | undefined;
  expect(
    create,
    'ranking/index.ts must export createPersonalStackService with repository injection',
  ).toBeTypeOf('function');
  if (!create) return undefined;
  const repository = new MemoryStackRepository();
  const eligible = new Map(Object.entries(initial));
  const service = create({
    repository,
    listEligibleWork: async (scope) => eligible.get(scopeKey(scope)) ?? [],
  });
  return { service, repository, eligible };
}

const idsOf = (items: EligibleWork[]) => items.map((item) => item.workId);

describe('personal stack service', () => {
  it('keeps users and overall/Project scopes independent while ignoring urgency order', async () => {
    const userAOverall: Scope = { userId: 'user-a', scopeType: 'overall' };
    const userAProject: Scope = { userId: 'user-a', scopeType: 'project', scopeId: projectId };
    const userBOverall: Scope = { userId: 'user-b', scopeType: 'overall' };
    const harness = createHarness({
      [scopeKey(userAOverall)]: [a, b, c],
      [scopeKey(userAProject)]: [a, b, c],
      [scopeKey(userBOverall)]: [a, b, c],
    });
    if (!harness) return;

    await harness.service.reorder({
      actorId: 'user-a',
      scope: userAOverall,
      mutationId: 'move-a-overall',
      sourceClientId: 'client-a',
      baseVersion: 0,
      move: { kind: 'simple_move', movedWork: ref(c), afterWork: ref(a) },
    });
    await harness.service.reorder({
      actorId: 'user-a',
      scope: userAProject,
      mutationId: 'move-a-project',
      sourceClientId: 'client-a',
      baseVersion: 0,
      move: { kind: 'simple_move', movedWork: ref(b), afterWork: ref(a) },
    });

    expect(
      idsOf((await harness.service.read({ actorId: 'user-a', scope: userAOverall })).items),
    ).toEqual([ids.c, ids.a, ids.b]);
    expect(
      idsOf((await harness.service.read({ actorId: 'user-a', scope: userAProject })).items),
    ).toEqual([ids.b, ids.a, ids.c]);
    expect(
      idsOf((await harness.service.read({ actorId: 'user-b', scope: userBOverall })).items),
    ).toEqual([ids.a, ids.b, ids.c]);
  });

  it('admits new membership at the tail and treats re-entry as a new epoch', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b] });
    if (!harness) return;

    expect(idsOf((await harness.service.read({ actorId: 'owner', scope })).items)).toEqual([
      ids.a,
      ids.b,
    ]);
    harness.eligible.set(scopeKey(scope), [a, b, c]);
    expect(idsOf((await harness.service.read({ actorId: 'owner', scope })).items)).toEqual([
      ids.a,
      ids.b,
      ids.c,
    ]);
    harness.eligible.set(scopeKey(scope), [a, c]);
    expect(idsOf((await harness.service.read({ actorId: 'owner', scope })).items)).toEqual([
      ids.a,
      ids.c,
    ]);
    const readmittedB = { ...b, membershipEpoch: '0010' };
    harness.eligible.set(scopeKey(scope), [a, c, readmittedB]);
    const reentered = await harness.service.read({ actorId: 'owner', scope });
    expect(idsOf(reentered.items)).toEqual([ids.a, ids.c, ids.b]);
    expect(identity(reentered.items[2]!)).toBe(identity(readmittedB));
  });

  it('safely rebases a stale simple move when its item and anchors remain coherent', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b, c, d] });
    if (!harness) return;

    expect(
      await harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId: 'first',
        sourceClientId: 'client-a',
        baseVersion: 0,
        move: { kind: 'simple_move', movedWork: ref(d), afterWork: ref(a) },
      }),
    ).toMatchObject({ status: 'applied', stackVersion: 1 });
    expect(
      await harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId: 'stale-safe',
        sourceClientId: 'client-b',
        baseVersion: 0,
        move: { kind: 'simple_move', movedWork: ref(c), beforeWork: ref(b) },
      }),
    ).toMatchObject({ status: 'applied', stackVersion: 2 });
  });

  it('conflicts stale filtered permutations instead of silently rebasing', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b, c, d] });
    if (!harness) return;
    const filtered = (movedWork: EligibleWork, destinationIndex: number): Move => ({
      kind: 'filtered_permutation',
      movedWork: ref(movedWork),
      destinationIndex,
      affectedWork: [a, b, c, d].map(ref),
      filterBasis: { urgencies: ['critical', 'medium', 'extra_low', 'high'] },
    });

    expect(
      await harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId: 'filtered-first',
        sourceClientId: 'client-a',
        baseVersion: 0,
        move: filtered(d, 0),
      }),
    ).toMatchObject({ status: 'applied', stackVersion: 1 });
    expect(
      await harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId: 'filtered-stale',
        sourceClientId: 'client-b',
        baseVersion: 0,
        move: filtered(c, 1),
      }),
    ).toMatchObject({ status: 'conflict', reason: 'version_mismatch', stackVersion: 1 });
  });

  it('detects overlapping filtered writes based on the same stack version', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b, c, d] });
    if (!harness) return;
    const request = (mutationId: string, movedWork: EligibleWork, destinationIndex: number) =>
      harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId,
        sourceClientId: mutationId,
        baseVersion: 0,
        move: {
          kind: 'filtered_permutation' as const,
          movedWork: ref(movedWork),
          destinationIndex,
          affectedWork: [a, b, c, d].map(ref),
          filterBasis: {},
        },
      });

    const results = await Promise.all([request('overlap-a', d, 0), request('overlap-b', c, 1)]);
    expect(results.filter((result) => result.status === 'applied')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(1);
  });

  it('serializes concurrent writes for the same user and scope', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b, c] });
    if (!harness) return;

    const results = await Promise.all([
      harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId: 'serial-a',
        sourceClientId: 'client-a',
        baseVersion: 0,
        move: { kind: 'simple_move', movedWork: ref(c), afterWork: ref(a) },
      }),
      harness.service.reorder({
        actorId: 'owner',
        scope,
        mutationId: 'serial-b',
        sourceClientId: 'client-b',
        baseVersion: 0,
        move: { kind: 'simple_move', movedWork: ref(b), beforeWork: ref(c) },
      }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['applied', 'applied']);
    expect(results.map((result) => result.stackVersion).sort()).toEqual([1, 2]);
    expect(harness.repository.maxConcurrentCommits).toBe(1);
  });

  it('converges same-user device writes and replays an offline mutation idempotently', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b, c] });
    if (!harness) return;

    const deviceA = await harness.service.reorder({
      actorId: 'owner',
      scope,
      mutationId: 'device-a-offline',
      sourceClientId: 'device-a',
      baseVersion: 0,
      move: { kind: 'simple_move', movedWork: ref(c), afterWork: ref(a) },
    });
    const deviceB = await harness.service.reorder({
      actorId: 'owner',
      scope,
      mutationId: 'device-b-online',
      sourceClientId: 'device-b',
      baseVersion: 0,
      move: { kind: 'simple_move', movedWork: ref(b), beforeWork: ref(a) },
    });
    const replay = await harness.service.reorder({
      actorId: 'owner',
      scope,
      mutationId: 'device-a-offline',
      sourceClientId: 'device-a',
      baseVersion: 0,
      move: { kind: 'simple_move', movedWork: ref(c), afterWork: ref(a) },
    });

    expect(deviceA).toMatchObject({ status: 'applied', stackVersion: 1 });
    expect(deviceB).toMatchObject({ status: 'applied', stackVersion: 2 });
    expect(replay).toEqual(deviceA);
    expect(idsOf((await harness.service.read({ actorId: 'owner', scope })).items)).toEqual([
      ids.c,
      ids.a,
      ids.b,
    ]);
  });

  it('removes unauthorized, archived, and hard-deleted work and restores only a new epoch', async () => {
    const scope: Scope = { userId: 'owner', scopeType: 'overall' };
    const harness = createHarness({ [scopeKey(scope)]: [a, b, c, d] });
    if (!harness) return;

    await harness.service.reorder({
      actorId: 'owner',
      scope,
      mutationId: 'establish-order',
      sourceClientId: 'device-a',
      baseVersion: 0,
      move: { kind: 'simple_move', movedWork: ref(d), afterWork: ref(a) },
    });
    harness.eligible.set(scopeKey(scope), [
      { ...a, authorized: false },
      { ...b, lifecycle: 'archived' },
      d,
    ]);
    expect(idsOf((await harness.service.read({ actorId: 'owner', scope })).items)).toEqual([ids.d]);

    const authorizationConflict = await harness.service.reorder({
      actorId: 'owner',
      scope,
      mutationId: 'offline-after-access-change',
      sourceClientId: 'device-b-offline',
      baseVersion: 1,
      move: { kind: 'simple_move', movedWork: ref(a), afterWork: ref(d) },
    });
    expect(authorizationConflict).toMatchObject({
      status: 'conflict',
      reason: 'authorization_changed',
    });

    const restoredB = { ...b, lifecycle: 'active', membershipEpoch: '0020' };
    harness.eligible.set(scopeKey(scope), [d, restoredB]);
    const restored = await harness.service.read({ actorId: 'owner', scope });
    expect(idsOf(restored.items)).toEqual([ids.d, ids.b]);
    expect(identity(restored.items[1]!)).toBe(identity(restoredB));
  });
});
