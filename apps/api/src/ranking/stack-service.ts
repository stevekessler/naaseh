import {
  applyFilteredPermutation,
  applySimpleMove,
  assertPersonalStackOwner,
  orderImplicitTail,
  personalStackScopeSchema,
  stackScopeIdentity,
  workReferenceIdentity,
  type PersonalStackFilterBasis,
  type PersonalStackMove,
  type PersonalStackScope,
  type ContentActor,
  type Urgency,
  type WorkReference,
} from '@naaseh/domain';

export interface EligibleStackWork extends WorkReference {
  urgency: Urgency;
  projectId?: string | undefined;
  categoryId?: string | undefined;
  assigneeId?: string | undefined;
  dueDate?: string | undefined;
  lifecycle?: string | undefined;
  active?: boolean | undefined;
  authorized?: boolean | undefined;
}

export interface StoredPersonalStackScope {
  version: number;
  order: WorkReference[];
}

export type PersonalStackConflictReason =
  | 'version_mismatch'
  | 'anchor_removed'
  | 'authorization_changed'
  | 'lifecycle_changed'
  | 'project_changed'
  | 'filter_basis_changed'
  | 'hard_deleted';

export interface PersonalStackReorderResult {
  status: 'applied' | 'pending_compaction' | 'conflict' | 'rejected';
  stackVersion: number;
  reason?: PersonalStackConflictReason | undefined;
}

export interface PersonalStackCommitInput {
  scope: PersonalStackScope;
  expectedVersion: number;
  next: StoredPersonalStackScope;
  mutationId: string;
  result: PersonalStackReorderResult;
  move?: PersonalStackMove | undefined;
  sourceClientId?: string | undefined;
  acceptedAt?: string | undefined;
}

export interface PersonalStackServiceRepository {
  loadScope(
    scope: PersonalStackScope,
    eligible?: readonly WorkReference[],
  ): Promise<StoredPersonalStackScope | undefined>;
  findMutation(userId: string, mutationId: string): Promise<PersonalStackReorderResult | undefined>;
  commit(input: PersonalStackCommitInput): Promise<boolean>;
}

export interface PersonalStackService {
  read(input: { actorId: string; actor?: ContentActor; scope: PersonalStackScope }): Promise<{
    version: number;
    items: EligibleStackWork[];
  }>;
  reorder(input: {
    actorId: string;
    actor?: ContentActor;
    scope: PersonalStackScope;
    mutationId: string;
    sourceClientId: string;
    baseVersion: number;
    move: PersonalStackMove;
  }): Promise<PersonalStackReorderResult>;
  operationStatus?(
    actorId: string,
    mutationId: string,
  ): Promise<PersonalStackReorderResult | undefined>;
}

export interface PersonalStackServiceDependencies {
  repository: PersonalStackServiceRepository;
  listEligibleWork(scope: PersonalStackScope, actor?: ContentActor): Promise<EligibleStackWork[]>;
  shouldMarkPendingCompaction?(input: {
    scope: PersonalStackScope;
    nextVersion: number;
    orderLength: number;
    move: PersonalStackMove;
  }): boolean;
}

function baseWorkIdentity(work: WorkReference): string {
  return `${work.workType}:${work.workId}`;
}

/**
 * Resolve the one current membership epoch for each active, authorized work item in a scope.
 * A later epoch wins if an eligibility projection momentarily contains both old and new entries.
 */
export function deriveEligibleStackMembership(
  scope: PersonalStackScope,
  candidates: readonly EligibleStackWork[],
): EligibleStackWork[] {
  const currentByWork = new Map<string, EligibleStackWork>();
  for (const candidate of candidates) {
    if (
      candidate.authorized === false ||
      candidate.active === false ||
      (candidate.lifecycle !== undefined && candidate.lifecycle !== 'active')
    )
      continue;
    if (scope.scopeType === 'project' && candidate.projectId !== scope.scopeId) continue;

    const key = baseWorkIdentity(candidate);
    const existing = currentByWork.get(key);
    if (
      existing === undefined ||
      candidate.membershipEpoch.localeCompare(existing.membershipEpoch) > 0
    ) {
      currentByWork.set(key, candidate);
    }
  }
  return [...currentByWork.values()];
}

function deriveCurrentOrder(
  stored: StoredPersonalStackScope,
  eligible: readonly EligibleStackWork[],
): WorkReference[] {
  const eligibleByIdentity = new Map(
    eligible.map((work) => [workReferenceIdentity(work), work] as const),
  );
  const emitted = new Set<string>();
  const current: WorkReference[] = [];

  for (const reference of stored.order) {
    const identity = workReferenceIdentity(reference);
    const eligibleWork = eligibleByIdentity.get(identity);
    if (eligibleWork !== undefined && !emitted.has(identity)) {
      current.push(reference);
      emitted.add(identity);
    }
  }

  const tail = eligible.filter((work) => !emitted.has(workReferenceIdentity(work)));
  current.push(...orderImplicitTail(tail));
  return current;
}

function hydrateOrder(
  order: readonly WorkReference[],
  eligible: readonly EligibleStackWork[],
): EligibleStackWork[] {
  const eligibleByIdentity = new Map(
    eligible.map((work) => [workReferenceIdentity(work), work] as const),
  );
  return order.flatMap((reference) => {
    const work = eligibleByIdentity.get(workReferenceIdentity(reference));
    return work === undefined ? [] : [work];
  });
}

function matchesFilter(work: EligibleStackWork, basis: PersonalStackFilterBasis): boolean {
  if (basis.urgencies !== undefined && !basis.urgencies.includes(work.urgency)) return false;
  if (
    basis.projectId !== undefined &&
    (basis.projectId === 'unassigned'
      ? work.projectId !== undefined
      : work.projectId !== basis.projectId)
  )
    return false;
  if (basis.categoryId !== undefined && work.categoryId !== basis.categoryId) return false;
  if (basis.assigneeId !== undefined && work.assigneeId !== basis.assigneeId) return false;
  if (basis.contentType === 'todos' && work.workType !== 'task') return false;
  if (basis.contentType === 'lists' && work.workType !== 'list') return false;
  if (basis.from !== undefined && (work.dueDate === undefined || work.dueDate < basis.from))
    return false;
  if (basis.to !== undefined && (work.dueDate === undefined || work.dueDate > basis.to))
    return false;
  return true;
}

function validateMoveEligibility(
  scope: PersonalStackScope,
  move: PersonalStackMove,
  eligible: readonly EligibleStackWork[],
): PersonalStackConflictReason | undefined {
  const eligibleByIdentity = new Map(
    eligible.map((work) => [workReferenceIdentity(work), work] as const),
  );
  if (!eligibleByIdentity.has(workReferenceIdentity(move.movedWork))) {
    return 'authorization_changed';
  }

  if (move.kind === 'simple_move') {
    if (
      (move.beforeWork !== undefined &&
        !eligibleByIdentity.has(workReferenceIdentity(move.beforeWork))) ||
      (move.afterWork !== undefined &&
        !eligibleByIdentity.has(workReferenceIdentity(move.afterWork)))
    ) {
      return 'anchor_removed';
    }
    return undefined;
  }

  if (
    scope.scopeType === 'project' &&
    move.filterBasis?.projectId !== undefined &&
    move.filterBasis.projectId !== scope.scopeId
  ) {
    return 'project_changed';
  }

  if (
    move.affectedWork.some((reference) => {
      const work = eligibleByIdentity.get(workReferenceIdentity(reference));
      return (
        work === undefined ||
        !matchesFilter(work, move.filterBasis ?? { lifecycle: 'active', contentType: 'all' })
      );
    })
  ) {
    return 'filter_basis_changed';
  }
  return undefined;
}

function createScopeSerializer() {
  const queues = new Map<string, Promise<void>>();
  return async <T>(scope: PersonalStackScope, action: () => Promise<T>): Promise<T> => {
    const key = stackScopeIdentity(scope);
    const previous = queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    queues.set(key, tail);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (queues.get(key) === tail) queues.delete(key);
    }
  };
}

export function createPersonalStackService(
  dependencies: PersonalStackServiceDependencies,
): PersonalStackService {
  const serialize = createScopeSerializer();

  async function loadCurrent(scope: PersonalStackScope, actor?: ContentActor) {
    const eligible = deriveEligibleStackMembership(
      scope,
      await dependencies.listEligibleWork(scope, actor),
    );
    const stored = (await dependencies.repository.loadScope(scope, eligible)) ?? {
      version: 0,
      order: [],
    };
    return { stored, eligible, order: deriveCurrentOrder(stored, eligible) };
  }

  async function commitResult(input: {
    scope: PersonalStackScope;
    current: StoredPersonalStackScope;
    mutationId: string;
    result: PersonalStackReorderResult;
    nextOrder?: WorkReference[];
    move?: PersonalStackMove;
    sourceClientId?: string;
  }): Promise<boolean> {
    return dependencies.repository.commit({
      scope: input.scope,
      expectedVersion: input.current.version,
      next: {
        version: input.result.stackVersion,
        order: input.nextOrder ?? input.current.order,
      },
      mutationId: input.mutationId,
      result: input.result,
      ...(input.move ? { move: input.move } : {}),
      ...(input.sourceClientId ? { sourceClientId: input.sourceClientId } : {}),
      acceptedAt: new Date().toISOString(),
    });
  }

  return {
    async read(input) {
      const scope = personalStackScopeSchema.parse(input.scope);
      assertPersonalStackOwner(scope, input.actorId);
      const { stored, eligible, order } = await loadCurrent(scope, input.actor);
      return { version: stored.version, items: hydrateOrder(order, eligible) };
    },

    async reorder(input) {
      const scope = personalStackScopeSchema.parse(input.scope);
      assertPersonalStackOwner(scope, input.actorId);
      return serialize(scope, async () => {
        const receipt = await dependencies.repository.findMutation(scope.userId, input.mutationId);
        if (receipt !== undefined) return receipt;

        for (;;) {
          const { stored, eligible, order } = await loadCurrent(scope, input.actor);
          const concurrentReceipt = await dependencies.repository.findMutation(
            scope.userId,
            input.mutationId,
          );
          if (concurrentReceipt !== undefined) return concurrentReceipt;

          let reason = validateMoveEligibility(scope, input.move, eligible);
          if (reason === undefined && input.baseVersion > stored.version) {
            reason = 'version_mismatch';
          }
          if (
            reason === undefined &&
            input.baseVersion < stored.version &&
            input.move.kind === 'filtered_permutation'
          ) {
            reason = 'version_mismatch';
          }

          if (reason !== undefined) {
            const result: PersonalStackReorderResult = {
              status: 'conflict',
              stackVersion: stored.version,
              reason,
            };
            if (
              await commitResult({
                scope,
                current: stored,
                mutationId: input.mutationId,
                result,
              })
            ) {
              return result;
            }
            continue;
          }

          let nextOrder: WorkReference[];
          try {
            nextOrder =
              input.move.kind === 'simple_move'
                ? applySimpleMove(order, input.move)
                : applyFilteredPermutation(order, input.move);
          } catch {
            const result: PersonalStackReorderResult = {
              status: 'conflict',
              stackVersion: stored.version,
              reason: input.move.kind === 'simple_move' ? 'anchor_removed' : 'filter_basis_changed',
            };
            if (
              await commitResult({
                scope,
                current: stored,
                mutationId: input.mutationId,
                result,
              })
            ) {
              return result;
            }
            continue;
          }

          const nextVersion = stored.version + 1;
          const pending =
            dependencies.shouldMarkPendingCompaction?.({
              scope,
              nextVersion,
              orderLength: nextOrder.length,
              move: input.move,
            }) ?? false;
          const result: PersonalStackReorderResult = {
            status: pending ? 'pending_compaction' : 'applied',
            stackVersion: nextVersion,
          };
          if (
            await commitResult({
              scope,
              current: stored,
              mutationId: input.mutationId,
              result,
              nextOrder,
              move: input.move,
              sourceClientId: input.sourceClientId,
            })
          ) {
            return result;
          }
        }
      });
    },
    async operationStatus(actorId, mutationId) {
      return dependencies.repository.findMutation(actorId, mutationId);
    },
  };
}
