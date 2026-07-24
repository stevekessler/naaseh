import type {
  EntityType,
  Mutation,
  StableMutationResult,
  Task,
  VectorCursor,
} from '@naaseh/domain';

export type MutationDispatcher = (mutation: Mutation) => Promise<StableMutationResult>;
export type MutationDispatchers = Partial<Record<EntityType, MutationDispatcher>>;

export async function dispatchMutations(
  mutations: readonly Mutation[],
  dispatchers: MutationDispatchers,
): Promise<StableMutationResult[]> {
  const results: StableMutationResult[] = [];
  for (const mutation of mutations) {
    const dispatcher = dispatchers[mutation.entityType];
    results.push(
      dispatcher ? await dispatcher(mutation) : { mutationId: mutation.id, status: 'rejected' },
    );
  }
  return results;
}
export function applyTaskMutation(
  current: Task | undefined,
  mutation: Mutation,
): StableMutationResult {
  if (current && mutation.baseVersion !== current.version)
    return { mutationId: mutation.id, status: 'conflict', version: current.version };
  if (mutation.operation === 'delete')
    return { mutationId: mutation.id, status: 'applied', version: (current?.version ?? 0) + 1 };
  const payload = mutation.payload as Partial<Task>;
  return {
    mutationId: mutation.id,
    status: 'applied',
    version: (current?.version ?? 0) + 1,
    ...(payload ? {} : {}),
  };
}
export function mergeNonOverlapping(
  base: Task,
  local: Partial<Task>,
  remote: Task,
): Task | undefined {
  const conflict = Object.keys(local).some(
    (key) => base[key as keyof Task] !== remote[key as keyof Task],
  );
  return conflict
    ? undefined
    : { ...remote, ...local, version: remote.version + 1, updatedAt: new Date().toISOString() };
}
export const nextFeedSequence = (current: number) => {
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('Invalid feed sequence.');
  return current + 1;
};
export function advanceVectorCursor(
  current: VectorCursor,
  feed: string,
  sequence: number,
): VectorCursor {
  return { ...current, [feed]: Math.max(current[feed] ?? 0, sequence) };
}
export function stableReplayResult(
  prior: StableMutationResult | undefined,
  mutation: Mutation,
): StableMutationResult | undefined {
  return prior ? { ...prior, mutationId: mutation.id, status: 'duplicate' } : undefined;
}

export function uniqueAudiences(audiences: readonly string[]): string[] {
  return [...new Set(audiences.filter(Boolean))].sort();
}
