import {
  eligiblePersonalStackOrder,
  orderImplicitTail,
  workReferenceIdentity,
  type WorkReference,
} from '@naaseh/domain';
import { readLocalStack, type LocalStackScope } from '../../db/personal-stack-repository.js';

export interface EligibleStackWork {
  reference: WorkReference;
  projectId?: string;
}

export interface StackRankOverlay {
  overallPosition: number;
  projectPosition?: number;
}

export interface RankedStackWork<T extends EligibleStackWork> {
  work: T;
  rank: StackRankOverlay;
}

export interface StackOrders {
  overall: readonly WorkReference[];
  projects?: ReadonlyMap<string, readonly WorkReference[]>;
}

function uniqueEligibleWork<T extends EligibleStackWork>(work: readonly T[]): T[] {
  const seen = new Set<string>();
  return work.map((item) => {
    const identity = workReferenceIdentity(item.reference);
    if (seen.has(identity)) {
      throw new Error(`Eligible work contains duplicate reference ${identity}.`);
    }
    seen.add(identity);
    return item;
  });
}

function completeEligibleOrder(
  storedOrder: readonly WorkReference[],
  eligibleReferences: readonly WorkReference[],
): WorkReference[] {
  const eligibleIdentities = new Set(eligibleReferences.map(workReferenceIdentity));
  const ordered = eligiblePersonalStackOrder(storedOrder, eligibleIdentities);
  const present = new Set(ordered.map(workReferenceIdentity));
  const implicitTail = orderImplicitTail(
    eligibleReferences.filter((reference) => !present.has(workReferenceIdentity(reference))),
  );
  return [...ordered, ...implicitTail];
}

function rankIndex(order: readonly WorkReference[]): Map<string, number> {
  return new Map(order.map((reference, index) => [workReferenceIdentity(reference), index + 1]));
}

/**
 * Overlay ranks onto the complete authorized, active viewer set. Callers must not
 * pass only the filtered rows: filtering occurs after these full-stack ordinals
 * are calculated so a displayed rank never leaks or renumbers hidden slots.
 */
export function selectRankOverlays<T extends EligibleStackWork>(
  eligibleWork: readonly T[],
  orders: StackOrders,
): RankedStackWork<T>[] {
  const uniqueWork = uniqueEligibleWork(eligibleWork);
  const overallOrder = completeEligibleOrder(
    orders.overall,
    uniqueWork.map((item) => item.reference),
  );
  const overallRanks = rankIndex(overallOrder);
  const projectRanks = new Map<string, Map<string, number>>();

  for (const item of uniqueWork) {
    if (!item.projectId || projectRanks.has(item.projectId)) continue;
    const projectReferences = uniqueWork
      .filter((candidate) => candidate.projectId === item.projectId)
      .map((candidate) => candidate.reference);
    const projectOrder = completeEligibleOrder(
      orders.projects?.get(item.projectId) ?? [],
      projectReferences,
    );
    projectRanks.set(item.projectId, rankIndex(projectOrder));
  }

  return uniqueWork.map((work) => {
    const identity = workReferenceIdentity(work.reference);
    const overallPosition = overallRanks.get(identity);
    if (overallPosition === undefined) {
      throw new Error('Eligible work is missing from the completed overall stack.');
    }
    const projectPosition = work.projectId
      ? projectRanks.get(work.projectId)?.get(identity)
      : undefined;
    return {
      work,
      rank: {
        overallPosition,
        ...(projectPosition === undefined ? {} : { projectPosition }),
      },
    };
  });
}

export function selectStackItems<T extends EligibleStackWork>(input: {
  eligibleWork: readonly T[];
  orders: StackOrders;
  scope: LocalStackScope;
  matches?: (work: T) => boolean;
}): RankedStackWork<T>[] {
  const ranked = selectRankOverlays(input.eligibleWork, input.orders);
  const matches = input.matches ?? (() => true);
  return ranked
    .filter(({ work, rank }) => {
      if (!matches(work)) return false;
      return input.scope.scopeType === 'overall'
        ? true
        : work.projectId === input.scope.scopeId && rank.projectPosition !== undefined;
    })
    .sort((left, right) =>
      input.scope.scopeType === 'overall'
        ? left.rank.overallPosition - right.rank.overallPosition
        : left.rank.projectPosition! - right.rank.projectPosition!,
    );
}

/** Read encrypted local stack state and produce the same viewer overlay while offline. */
export async function selectLocalStackItems<T extends EligibleStackWork>(input: {
  ownerId: string;
  eligibleWork: readonly T[];
  scope: LocalStackScope;
  matches?: (work: T) => boolean;
}): Promise<RankedStackWork<T>[]> {
  const projectIds = [
    ...new Set(
      input.eligibleWork
        .map((work) => work.projectId)
        .filter((projectId): projectId is string => projectId !== undefined),
    ),
  ];
  const [overall, ...projectStates] = await Promise.all([
    readLocalStack(input.ownerId, { scopeType: 'overall' }),
    ...projectIds.map((scopeId) =>
      readLocalStack(input.ownerId, { scopeType: 'project', scopeId }),
    ),
  ]);
  const projects = new Map<string, readonly WorkReference[]>();
  projectIds.forEach((projectId, index) => {
    projects.set(projectId, projectStates[index]?.work ?? []);
  });
  return selectStackItems({
    eligibleWork: input.eligibleWork,
    orders: { overall: overall?.work ?? [], projects },
    scope: input.scope,
    ...(input.matches ? { matches: input.matches } : {}),
  });
}
