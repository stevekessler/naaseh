import {
  journalSyncContractVersion,
  journalKeyEnvelopeSchema,
  type JournalKeyEnvelope,
  type JournalMutation,
} from '@naaseh/domain';
import { JournalService } from '../journal/journal-service.js';
import {
  serializeJournalSyncChange,
  type JournalRepository,
} from '../journal/journal-repository.js';
import type { Mutation, StableMutationResult } from '@naaseh/domain';
import {
  isFinanceSyncEntityType,
  isFinanceSyncEntityFamily,
  isLegacyFinanceSyncEntityType,
} from './types.js';
import {
  pullAudience,
  hasMoreAudienceChanges,
  type SyncFeedChange,
} from './change-feed-repository.js';
import { SafeApiError } from '../shared/http.js';
import type { SyncChange } from '@naaseh/domain';

/** Ordinary progress never acknowledges withheld Finance rows in its independent lane. */
export async function pullFinanceDeliveryLanes(input: {
  feeds: [string, string][];
  cursor: Record<string, number>;
  financeCursor?: Record<string, number>;
  contractVersion: number;
  deliverFinance?: boolean;
  requirePin: boolean;
  unlocked: boolean;
  read?: (audience: string, after: number, limit: number) => Promise<SyncFeedChange[]>;
}) {
  const read = input.read ?? pullAudience;
  const pulled = await Promise.all(
    input.feeds.map(async ([name, audience]) => ({
      name,
      audience,
      after: input.cursor[name] ?? 0,
      changes: await read(audience, input.cursor[name] ?? 0, 200),
    })),
  );
  const legacy = input.contractVersion < 8;
  const allowed =
    input.deliverFinance !== false && (!input.requirePin || (!legacy && input.unlocked));
  const financeState =
    legacy &&
    (input.requirePin ||
      pulled.some((page) =>
        page.changes.some(
          (change) =>
            isFinanceSyncEntityFamily(change.entityType ?? '') &&
            !isLegacyFinanceSyncEntityType(change.entityType ?? ''),
        ),
      ))
      ? ('upgrade-required' as const)
      : !allowed
        ? ('locked' as const)
        : ('ready' as const);
  const isFinance = (change: SyncFeedChange) => isFinanceSyncEntityFamily(change.entityType ?? '');
  const dedupe = (changes: SyncFeedChange[]) => {
    const rows = new Map<string, SyncFeedChange>();
    for (const change of changes) {
      const key = `${change.entityType ?? 'task'}:${change.entityId}`;
      const previous = rows.get(key);
      if (
        !previous ||
        (change.version ?? change.sequence) >= (previous.version ?? previous.sequence)
      )
        rows.set(key, change);
    }
    return [...rows.values()];
  };
  const changes = dedupe(
    pulled.flatMap((page) =>
      page.changes.filter(
        (change) =>
          !isFinance(change) ||
          (legacy && allowed && isLegacyFinanceSyncEntityType(change.entityType ?? '')),
      ),
    ),
  );
  const financeCursor = { ...input.financeCursor };
  const financeChanges: SyncFeedChange[] = [];
  let financeHasMore = false;
  if (!legacy && allowed) {
    for (const page of pulled) {
      const after = financeCursor[page.name] ?? 0;
      const rows = after === page.after ? page.changes : await read(page.audience, after, 200);
      financeHasMore ||= hasMoreAudienceChanges(rows);
      financeChanges.push(...rows.filter(isFinance));
      financeCursor[page.name] = rows.at(-1)?.sequence ?? after;
    }
  }
  return {
    changes,
    financeChanges: dedupe(financeChanges),
    financeCursor,
    financeHasMore,
    financeState,
    cursor: Object.fromEntries(
      pulled.map((page) => [page.name, page.changes.at(-1)?.sequence ?? page.after]),
    ),
  };
}

/** Source revocation withholds only Finance and leaves its last acknowledged cursor intact. */
export async function applyFinanceSourceChecks(
  lanes: Awaited<ReturnType<typeof pullFinanceDeliveryLanes>>,
  guard: {
    canDeliver: (change: SyncChange) => Promise<boolean>;
    supports?: (entityType: string) => boolean;
    assertCurrent: () => Promise<void>;
  },
  previousCursor: Record<string, number> = {},
) {
  const ordinary = (change: SyncFeedChange) => !isFinanceSyncEntityFamily(change.entityType ?? '');
  if (
    [...lanes.changes, ...lanes.financeChanges].some(
      (change) =>
        !ordinary(change) &&
        (!isFinanceSyncEntityType(change.entityType ?? '') ||
          guard.supports?.(change.entityType ?? '') === false),
    )
  )
    return {
      ...lanes,
      changes: lanes.changes.filter(ordinary),
      financeChanges: [],
      financeHasMore: false,
      financeCursor: { ...previousCursor },
      financeState: 'upgrade-required' as const,
    };
  const filter = async (changes: SyncFeedChange[]) => {
    const result: SyncFeedChange[] = [];
    for (const change of changes)
      if (ordinary(change) || (await guard.canDeliver(change as SyncChange))) result.push(change);
    return result;
  };
  try {
    const changes = await filter(lanes.changes);
    const financeChanges = await filter(lanes.financeChanges);
    if (financeChanges.length || changes.some((change) => !ordinary(change)))
      await guard.assertCurrent();
    return { ...lanes, changes, financeChanges };
  } catch (error) {
    if (!(error instanceof SafeApiError) || error.code !== 'finance_sync_sources_changed')
      throw error;
    return {
      ...lanes,
      changes: lanes.changes.filter(ordinary),
      financeChanges: [],
      financeHasMore: false,
      financeCursor: { ...previousCursor },
      financeState: 'locked' as const,
    };
  }
}

export function createJournalSyncHandlers(repository: JournalRepository) {
  const service = new JournalService(repository);
  return {
    async push(ownerId: string, mutations: JournalMutation[]) {
      return {
        version: journalSyncContractVersion,
        results: await Promise.all(mutations.map((mutation) => service.apply(ownerId, mutation))),
      };
    },
    async pull(ownerId: string, cursor: number, limit = 100) {
      const feed = await repository.changes(ownerId, cursor, limit);
      return {
        version: journalSyncContractVersion,
        changes: feed.rows.map(serializeJournalSyncChange),
        journalCursor: feed.cursor,
        hasMore: feed.hasMore,
      };
    },
    async bootstrap(ownerId: string) {
      const [records, changes] = await Promise.all([
        repository.bootstrap(ownerId),
        repository.changes(ownerId, 0),
      ]);
      return {
        version: journalSyncContractVersion,
        records,
        journalCursor: changes.cursor,
      };
    },
    async readKeyEnvelope(ownerId: string) {
      const envelope = await repository.keyEnvelope(ownerId);
      if (!envelope) throw new Error('The journal resource is unavailable.');
      return envelope;
    },
    async writeKeyEnvelope(ownerId: string, input: JournalKeyEnvelope, baseVersion: number) {
      const envelope = journalKeyEnvelopeSchema.parse(input);
      if (envelope.ownerId !== ownerId) throw new Error('The journal resource is unavailable.');
      const saved = await repository.saveKeyEnvelope(ownerId, envelope, baseVersion);
      if (!saved) throw new Error('The journal key envelope changed.');
      return saved;
    },
  };
}

export function createFinanceSyncHandler(
  dispatch: (actorId: string, mutation: Mutation) => Promise<StableMutationResult>,
  authorize: () => Promise<void>,
) {
  return async (actorId: string, mutation: Mutation) => {
    if (!isFinanceSyncEntityType(mutation.entityType)) {
      throw new Error('Unsupported Finance synchronization entity.');
    }
    await authorize();
    const result = await dispatch(actorId, mutation);
    await authorize();
    return result;
  };
}
