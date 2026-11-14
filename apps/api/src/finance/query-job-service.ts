import { addMinorUnits, createUlid, ulidSchema } from '@naaseh/domain';
import {
  financeQueryFiltersSchema,
  financeQueryPageSchema,
  type FinanceQueryFilters,
} from '@naaseh/contracts';
import {
  FINANCE_QUERY_LIFETIME_MS,
  FINANCE_QUERY_ROW_ORDER_VERSION,
  compareFinanceRows,
  financeReadFingerprint,
  encodeFinanceCursor,
  decodeFinanceCursor,
  type FinanceReadResult,
  type FinanceReadContext,
  type FinanceRowBoundary,
} from './query-contract.js';
import type { FinanceReadRepository } from './read-repository.js';
import { FinanceUnitOfWork } from './unit-of-work.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { createHash } from 'node:crypto';
import { SafeApiError } from '../shared/http.js';

type CurrencyTotal = { currency: string; currencyExponent: number; amountMinor: number };
export interface FinanceQueryJob {
  id: string;
  rowOrderVersion: typeof FINANCE_QUERY_ROW_ORDER_VERSION;
  userId: string;
  securityRevision: number;
  sourceRevisions: Record<string, string>;
  filters: Partial<FinanceQueryFilters>;
  fingerprint: string;
  partitions: Array<{ accountId: string; cursor?: string; complete: boolean }>;
  firstIds: Array<{ id: string; accountId: string; effectiveAt: string }>;
  totals: CurrencyTotal[];
  count: number;
  examined: number;
  state: 'pending' | 'exact';
  createdAt: string;
  expiresAt: number;
  version: number;
  workerNonce?: string;
  before?: FinanceRowBoundary;
  parentQueryId?: string;
  expectedCount?: number;
  rowsReady?: boolean;
}
export interface FinanceQueryJobStore {
  get(userId: string, id: string): Promise<FinanceQueryJob | undefined>;
  save(job: FinanceQueryJob, expectedVersion: number): Promise<FinanceQueryJob>;
  create?(job: FinanceQueryJob, requestId: string): Promise<FinanceQueryJob>;
}
const jobKey = (userId: string, id: string) => ({
  PK: `USER#${userId}`,
  SK: `FINANCE_QUERY#${id}`,
});
type StoredQueryJob = Omit<FinanceQueryJob, 'firstIds'> & {
  referenceEncoding: 1;
  rowReferences: Array<[string, number, string]>;
};
function encodeJob(job: FinanceQueryJob): StoredQueryJob {
  const { firstIds, ...metadata } = job;
  const accounts = job.partitions.map((partition) => partition.accountId);
  const rowReferences = firstIds.map(({ id, accountId, effectiveAt }): [string, number, string] => {
    const account = accounts.indexOf(accountId);
    if (account < 0)
      throw new FinanceExperienceFailure('invariant', 'Finance reference scope invariant failed.');
    return [id, account, effectiveAt];
  });
  return { ...metadata, referenceEncoding: 1, rowReferences };
}
function decodeJob(data: unknown): FinanceQueryJob | undefined {
  if (data === undefined) return undefined;
  if (!data || typeof data !== 'object')
    throw new FinanceExperienceFailure('invariant', 'Finance stored query is invalid.');
  const stored = data as StoredQueryJob;
  if (stored.referenceEncoding === undefined) return data as FinanceQueryJob; // Existing temporary checkpoints.
  const { rowReferences, referenceEncoding, ...metadata } = stored;
  if (
    referenceEncoding !== 1 ||
    !Array.isArray(rowReferences) ||
    rowReferences.length > 200 ||
    !Array.isArray(stored.partitions)
  )
    throw new FinanceExperienceFailure('invariant', 'Finance stored reference format is invalid.');
  const firstIds = rowReferences.map((reference) => {
    if (
      !Array.isArray(reference) ||
      reference.length !== 3 ||
      typeof reference[0] !== 'string' ||
      !reference[0] ||
      !Number.isSafeInteger(reference[1]) ||
      reference[1] < 0 ||
      !stored.partitions[reference[1]] ||
      typeof reference[2] !== 'string' ||
      !Number.isFinite(Date.parse(reference[2]))
    )
      throw new FinanceExperienceFailure('invariant', 'Finance stored reference is invalid.');
    return {
      id: reference[0],
      accountId: stored.partitions[reference[1]]!.accountId,
      effectiveAt: reference[2],
    };
  });
  return { ...metadata, firstIds };
}

export class DynamoFinanceQueryJobStore implements FinanceQueryJobStore {
  constructor(private readonly work = () => new FinanceUnitOfWork()) {}
  async get(userId: string, id: string) {
    const work = this.work();
    return decodeJob((await work.get(jobKey(userId, id)))?.data);
  }
  private requestConflict(): never {
    throw new SafeApiError(
      409,
      'finance_query_request_conflict',
      'Use a new query request after changing filters or scope.',
      'conflict',
    );
  }
  private async requestedJob(userId: string, id: unknown, fingerprint: string) {
    const job = typeof id === 'string' ? await this.get(userId, id) : undefined;
    if (!job || job.userId !== userId || job.id !== id)
      throw new FinanceExperienceFailure('validation', 'Finance query missing or expired.', 'user');
    if (job.fingerprint !== fingerprint) return this.requestConflict();
    return job;
  }
  async create(job: FinanceQueryJob, requestId: string): Promise<FinanceQueryJob> {
    if (!requestId.trim() || requestId.length > 200)
      throw new SafeApiError(
        400,
        'invalid_request',
        'The query request identity is invalid.',
        'validation',
      );
    const work = this.work();
    const key = {
      PK: `USER#${job.userId}`,
      SK: `FINANCE_QUERY_REQUEST#${createHash('sha256').update(requestId).digest('hex')}`,
    };
    const existing = await work.get(key);
    if (existing) {
      if (existing.fingerprint !== job.fingerprint) return this.requestConflict();
      return this.requestedJob(
        job.userId,
        (existing.result as { queryId?: unknown } | undefined)?.queryId,
        job.fingerprint,
      );
    }
    const primary = jobKey(job.userId, job.id);
    if (await work.get(primary)) throw new Error('Finance query identity conflict.');
    await work.put({
      ...primary,
      data: encodeJob(job),
      version: job.version,
      expiresAt: Math.floor(job.expiresAt / 1000),
    });
    let result: { queryId: string };
    try {
      // The owner-only request receipt and first checkpoint commit together. A lost
      // response or concurrent retry recovers the same ID, without another job.
      result = await work.commit({
        key,
        fingerprint: job.fingerprint,
        result: { queryId: job.id },
        expiresAt: Math.floor(job.expiresAt / 1000),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Finance mutation identity conflict.')
        return this.requestConflict();
      // A different request can win after our negative receipt read. Its conditional
      // failure is still a semantic identity conflict, not a retryable storage outage.
      const winner = await this.work().get(key);
      if (winner && winner.fingerprint !== job.fingerprint) return this.requestConflict();
      throw error;
    }
    return result.queryId === job.id
      ? job
      : this.requestedJob(job.userId, result.queryId, job.fingerprint);
  }
  async save(job: FinanceQueryJob, expectedVersion: number) {
    const work = this.work();
    const key = jobKey(job.userId, job.id);
    const row = await work.get(key);
    const current = decodeJob(row?.data);
    if ((current?.version ?? 0) !== expectedVersion) {
      if (current) return current; // Another bounded worker already advanced this checkpoint.
      throw new Error('Finance query checkpoint conflict.');
    }
    await work.put({
      ...key,
      data: encodeJob(job),
      version: job.version,
      expiresAt: Math.floor(job.expiresAt / 1000),
    });
    await work.commit({
      key: { PK: key.PK, SK: `${key.SK}#STEP#${expectedVersion}` },
      fingerprint: `${job.fingerprint}:${expectedVersion}`,
      result: { queryId: job.id },
      expiresAt: Math.floor(job.expiresAt / 1000),
    });
    // A receipt identifies the committed job rather than retaining a second
    // growing checkpoint per step. Recover current state even after a lost
    // response or a competing retry; never redispatch an obsolete checkpoint.
    return this.requestedJob(job.userId, job.id, job.fingerprint);
  }
}

function mergeTotals(previous: CurrencyTotal[], incoming: CurrencyTotal[]): CurrencyTotal[] {
  const totals = new Map(previous.map((t) => [t.currency, { ...t }]));
  for (const value of incoming) {
    const current = totals.get(value.currency);
    if (current && current.currencyExponent !== value.currencyExponent)
      throw new FinanceExperienceFailure('invariant', 'Finance currency invariant failed.');
    totals.set(value.currency, {
      ...value,
      amountMinor: addMinorUnits([current?.amountMinor ?? 0, value.amountMinor]),
    });
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Trusted workers compute only; status/page separately recheck current delivery authority. */
export class FinanceQueryJobService {
  constructor(
    private readonly options: {
      repository: FinanceReadRepository;
      store: FinanceQueryJobStore;
      validate: (job: FinanceQueryJob) => Promise<boolean>;
      dispatch: (job: { userId: string; queryId: string }) => Promise<void>;
      hydrate: (job: FinanceQueryJob) => Promise<FinanceReadResult['items']>;
      authorizeDelivery: (job: FinanceQueryJob) => Promise<boolean>;
      authorizeFacts: (job: FinanceQueryJob, facts: FinanceReadResult['items']) => Promise<boolean>;
      now?: () => number;
      cursorSecret?: string;
      preview?: (job: FinanceQueryJob) => Promise<
        | {
            firstIds: FinanceQueryJob['firstIds'];
            examined?: number;
            exact?: { count: number; totals: CurrencyTotal[] };
          }
        | undefined
      >;
    },
  ) {}
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private requireLive(job: FinanceQueryJob) {
    if (!Number.isSafeInteger(job.expiresAt) || job.expiresAt <= this.now())
      throw new FinanceExperienceFailure('validation', 'Finance query missing or expired.', 'user');
    if (job.rowOrderVersion !== FINANCE_QUERY_ROW_ORDER_VERSION)
      throw new FinanceExperienceFailure(
        'authorization',
        'Finance query format changed; restart required.',
        'user',
      );
    if (
      job.parentQueryId &&
      (!job.before ||
        !Number.isSafeInteger(job.expectedCount) ||
        job.expectedCount! < 0 ||
        (job.state === 'exact' && job.count !== job.expectedCount))
    )
      throw new FinanceExperienceFailure('invariant', 'Finance page count invariant failed.');
  }
  private async checked(userId: string, id: string) {
    const job = await this.options.store.get(userId, id);
    if (!job || job.id !== id || job.userId !== userId)
      throw new FinanceExperienceFailure('validation', 'Finance query missing or expired.', 'user');
    this.requireLive(job);
    if (!(await this.options.validate(job)))
      throw new FinanceExperienceFailure(
        'authorization',
        'Finance query source or authorization changed; restart required.',
        'user',
      );
    this.requireLive(job);
    return job;
  }
  async create(input: {
    userId: string;
    accountIds: string[];
    sourceRevisions: Record<string, string>;
    securityRevision: number;
    filters: Partial<FinanceQueryFilters>;
    requestId?: string;
    before?: FinanceRowBoundary;
    parentQueryId?: string;
    expectedCount?: number;
    expiresAt?: number;
  }) {
    const accounts = [...new Set(input.accountIds)].sort();
    const filters = financeQueryFiltersSchema.parse(input.filters);
    const nameFilteredEmpty =
      Boolean(filters.accountName && filters.accountIds?.length) &&
      filters.accountIds!.every((id) => Boolean(input.sourceRevisions[id]));
    if (
      (!accounts.length && !nameFilteredEmpty) ||
      accounts.length > 50 ||
      accounts.some((id) => !input.sourceRevisions[id])
    )
      throw new Error('Invalid Finance query scope.');
    const id = createUlid();
    const now = this.now();
    const fingerprint = financeReadFingerprint({
      userId: input.userId,
      accountId: accounts.join(','),
      sourceRevision: JSON.stringify({
        revisions: input.sourceRevisions,
        rowOrderVersion: FINANCE_QUERY_ROW_ORDER_VERSION,
        ...(input.parentQueryId
          ? { parentQueryId: input.parentQueryId, expectedCount: input.expectedCount }
          : {}),
      }),
      securityRevision: input.securityRevision,
      filters,
      ...(input.before ? { before: input.before } : {}),
    });
    const job: FinanceQueryJob = {
      id,
      rowOrderVersion: FINANCE_QUERY_ROW_ORDER_VERSION,
      userId: input.userId,
      securityRevision: input.securityRevision,
      sourceRevisions: { ...input.sourceRevisions },
      filters,
      fingerprint,
      partitions: accounts.map((accountId) => ({ accountId, complete: false })),
      firstIds: [],
      totals: [],
      count: 0,
      examined: 0,
      state: accounts.length ? 'pending' : 'exact',
      createdAt: new Date(now).toISOString(),
      expiresAt: Math.min(
        now + FINANCE_QUERY_LIFETIME_MS,
        input.expiresAt ?? Number.POSITIVE_INFINITY,
      ),
      version: 1,
      ...(input.before ? { before: input.before } : {}),
      ...(input.parentQueryId ? { parentQueryId: input.parentQueryId } : {}),
      ...(input.expectedCount === undefined ? {} : { expectedCount: input.expectedCount }),
    };
    if (!(await this.options.validate(job)))
      throw new FinanceExperienceFailure('authorization', 'Finance query access denied.', 'user');
    if (!(await this.options.authorizeDelivery(job)))
      throw new FinanceExperienceFailure('authorization', 'Finance query unlock required.', 'user');
    this.requireLive(job);
    if (input.requestId !== undefined && !this.options.store.create)
      throw new FinanceExperienceFailure('storage', 'Finance query creation is unavailable.');
    let saved =
      input.requestId === undefined
        ? await this.options.store.save(job, 0)
        : await this.options.store.create!(job, input.requestId);
    this.requireLive(saved);
    // A request retry may recover an advanced checkpoint. Check its current
    // authority before rescheduling computation or returning its identifier.
    if (
      saved.id !== job.id &&
      (!(await this.options.validate(saved)) || !(await this.options.authorizeDelivery(saved)))
    )
      throw new FinanceExperienceFailure(
        'authorization',
        'Finance query access changed; restart required.',
        'user',
      );
    if (saved.state === 'pending' && saved.version === 1 && this.options.preview && !saved.before) {
      const preview = await this.options.preview(saved);
      if (preview) {
        if (
          (preview.exact &&
            (!Number.isSafeInteger(preview.exact.count) || preview.exact.count < 0)) ||
          preview.firstIds.length !== (preview.exact ? Math.min(200, preview.exact.count) : 200) ||
          new Set(preview.firstIds.map((row) => row.id)).size !== preview.firstIds.length ||
          preview.firstIds.some(
            (row) => !saved.partitions.some((partition) => partition.accountId === row.accountId),
          )
        )
          throw new FinanceExperienceFailure(
            'invariant',
            'Finance preview reference invariant failed.',
          );
        if (
          preview.examined !== undefined &&
          (!Number.isSafeInteger(preview.examined) ||
            preview.examined < 0 ||
            preview.examined > 50_000)
        )
          throw new FinanceExperienceFailure(
            'invariant',
            'Finance preview examined budget is invalid.',
          );
        const next = {
          ...saved,
          examined: preview.examined ?? 0,
          firstIds: structuredClone(preview.firstIds).sort(compareFinanceRows),
          rowsReady: true,
          version: saved.version + 1,
        };
        if (preview.exact) {
          next.state = 'exact';
          next.count = preview.exact.count;
          next.totals = mergeTotals([], preview.exact.totals);
          next.partitions = next.partitions.map((partition) => ({
            accountId: partition.accountId,
            complete: true,
          }));
        }
        if (!(await this.options.validate(next)) || !(await this.options.authorizeDelivery(next)))
          throw new FinanceExperienceFailure(
            'authorization',
            'Finance preview source access or unlock changed.',
            'user',
          );
        this.requireLive(next);
        saved = await this.options.store.save(next, saved.version);
        this.requireLive(saved);
      }
    }
    if (saved.state === 'pending')
      await this.options.dispatch({ userId: saved.userId, queryId: saved.id });
    return saved.id;
  }
  async step(userId: string, id: string): Promise<void> {
    const job = await this.checked(userId, id);
    if (job.state === 'exact') return;
    const partitions = job.partitions.filter((p) => !p.complete).slice(0, 5);
    const results = await Promise.all(
      partitions.map(async (partition) => ({
        partition,
        result: await this.options.repository.scanForJob({
          userId,
          accountId: partition.accountId,
          sourceRevision: job.sourceRevisions[partition.accountId]!,
          securityRevision: job.securityRevision,
          filters: job.filters,
          ...(job.before ? { before: job.before } : {}),
          limit: 200,
          ...(partition.cursor ? { cursor: partition.cursor } : {}),
        }),
      })),
    );
    const next = structuredClone(job);
    next.workerNonce = createUlid();
    for (const { partition, result } of results) {
      const target = next.partitions.find((p) => p.accountId === partition.accountId)!;
      target.complete = !result.nextCursor;
      if (result.nextCursor) target.cursor = result.nextCursor;
      else delete target.cursor;
      next.count = addMinorUnits([next.count, result.matchedCount]);
      next.examined = addMinorUnits([next.examined, result.examined]);
      next.totals = mergeTotals(next.totals, result.totalsByCurrency);
      next.firstIds = [
        ...new Map(
          [
            ...next.firstIds,
            ...result.topRows.map((fact) => ({
              id: fact.id,
              accountId: fact.accountId,
              effectiveAt: fact.effectiveAt,
            })),
          ].map((row) => [row.id, row]),
        ).values(),
      ]
        .sort(compareFinanceRows)
        .slice(0, 200);
    }
    next.state = next.partitions.every((p) => p.complete) ? 'exact' : 'pending';
    next.version++;
    if (next.examined > 1_000_000 || next.version > 2_000)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance query bounded-work budget exceeded.',
        'user',
      );
    if (!(await this.options.validate(next)))
      throw new FinanceExperienceFailure(
        'authorization',
        'Finance query revision changed before publication.',
        'user',
      );
    this.requireLive(next);
    const saved = await this.options.store.save(next, job.version);
    if (saved.state !== 'exact' && saved.workerNonce === next.workerNonce)
      await this.options.dispatch({ userId, queryId: id });
  }
  private async checkPageDelivery(
    root: FinanceQueryJob,
    window: FinanceQueryJob,
    items?: FinanceReadResult['items'],
  ) {
    if (
      (items && !(await this.options.authorizeFacts(window, items))) ||
      !(await this.options.validate(window)) ||
      (window.id !== root.id && !(await this.options.validate(root))) ||
      !(await this.options.authorizeDelivery(root))
    )
      throw new FinanceExperienceFailure(
        'authorization',
        'Finance page source access or authorization changed.',
        'user',
      );
    this.requireLive(root);
    this.requireLive(window);
  }

  async page(userId: string, id: string, request: unknown = {}): Promise<FinanceReadResult> {
    const { limit, cursor } = financeQueryPageSchema.parse(request);
    const root = await this.checked(userId, id);
    if (root.parentQueryId)
      throw new FinanceExperienceFailure('validation', 'Finance query missing or expired.', 'user');
    if (!(await this.options.authorizeDelivery(root)))
      throw new FinanceExperienceFailure('authorization', 'Finance query unlock required.', 'user');
    const secret = this.options.cursorSecret ?? '';
    if (secret.length < 32)
      throw new FinanceExperienceFailure(
        'storage',
        'Finance page cursor configuration is unavailable.',
      );
    const context: FinanceReadContext = {
      userId,
      accountId: `query:${root.id}`,
      sourceRevision: root.fingerprint,
      securityRevision: root.securityRevision,
      filters: root.filters,
    };
    let windowId = root.id;
    let offset = 0;
    const invalidCursor = (): never => {
      throw new SafeApiError(
        400,
        'finance_query_cursor_invalid',
        'The query page cursor is invalid. Restart the query.',
        'validation',
      );
    };
    if (cursor) {
      try {
        const key = decodeFinanceCursor(cursor, context, secret, this.now());
        const match = /^WINDOW#(.+)$/.exec(key.PK);
        const position = /^OFFSET#(\d{1,3})$/.exec(key.SK);
        if (
          !match ||
          !position ||
          key.beforeOrdinal !== undefined ||
          !ulidSchema.safeParse(match[1]).success ||
          Number(position[1]) > 200
        )
          return invalidCursor();
        windowId = match[1]!;
        offset = Number(position[1]);
      } catch {
        return invalidCursor();
      }
    }
    let window = windowId === root.id ? root : await this.checked(userId, windowId);
    if (window.id !== root.id && window.parentQueryId !== root.id) return invalidCursor();
    const pending = async () => {
      await this.checkPageDelivery(root, window);
      return {
        items: [],
        asOf: root.createdAt,
        projectionRevision: root.fingerprint,
        complete: false,
        queryId: root.id,
        rowsState: 'searching' as const,
        aggregateState: 'pending' as const,
        coverage: { examined: window.examined, scopeComplete: false },
      };
    };
    if (
      (root.state !== 'exact' && !root.rowsReady) ||
      (window.state !== 'exact' && !window.rowsReady)
    )
      return pending();
    if (offset > window.firstIds.length) return invalidCursor();
    if (offset === window.firstIds.length && window.state !== 'exact') return pending();
    if (offset === window.firstIds.length && window.count > window.firstIds.length) {
      const last = window.firstIds.at(-1);
      if (!last)
        throw new FinanceExperienceFailure('invariant', 'Finance page window is incomplete.');
      const before = { id: last.id, effectiveAt: last.effectiveAt };
      const next = await this.create({
        userId,
        accountIds: root.partitions.map((partition) => partition.accountId),
        sourceRevisions: root.sourceRevisions,
        securityRevision: root.securityRevision,
        filters: root.filters,
        parentQueryId: root.id,
        expectedCount: window.count - window.firstIds.length,
        before,
        expiresAt: root.expiresAt,
        requestId: `page:${createHash('sha256')
          .update(JSON.stringify([root.id, before]))
          .digest('hex')}`,
      });
      window = await this.checked(userId, next);
      offset = 0;
      if (window.state !== 'exact') return pending();
    }
    if (window.firstIds.length !== (window.state === 'exact' ? Math.min(200, window.count) : 200))
      throw new FinanceExperienceFailure('invariant', 'Finance page window is incomplete.');
    const selected = window.firstIds.slice(offset, offset + limit);
    const items = await this.options.hydrate({ ...window, firstIds: selected });
    if (items.length !== selected.length)
      throw new FinanceExperienceFailure('invariant', 'Finance page hydration is incomplete.');
    const end = offset + items.length;
    const more =
      end < window.firstIds.length ||
      window.state !== 'exact' ||
      window.count > window.firstIds.length;
    const nextCursor = more
      ? encodeFinanceCursor(
          { PK: `WINDOW#${window.id}`, SK: `OFFSET#${end}` },
          context,
          secret,
          this.now(),
        )
      : undefined;
    await this.checkPageDelivery(root, window, items);
    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
      asOf: root.createdAt,
      projectionRevision: root.fingerprint,
      complete: root.state === 'exact',
      queryId: root.id,
      rowsState: items.length || root.count ? 'ready' : 'confirmed-empty',
      aggregateState: root.state,
      coverage: { examined: root.examined, scopeComplete: root.state === 'exact' },
      ...(root.state === 'exact' ? { totalCount: root.count, totalsByCurrency: root.totals } : {}),
    };
  }

  async status(userId: string, id: string): Promise<FinanceReadResult> {
    const job = await this.checked(userId, id);
    if (!(await this.options.authorizeDelivery(job)))
      throw new FinanceExperienceFailure('authorization', 'Finance query unlock required.', 'user');
    const items = job.state === 'exact' || job.rowsReady ? await this.options.hydrate(job) : [];
    // Fact dependencies can require asynchronous reads. Refresh the canonical snapshot
    // and visit grant after those reads, immediately before delivering the payload.
    if (
      !(await this.options.authorizeFacts(job, items)) ||
      !(await this.options.validate(job)) ||
      !(await this.options.authorizeDelivery(job))
    )
      throw new FinanceExperienceFailure(
        'authorization',
        'Finance query source access or authorization changed during delivery.',
        'user',
      );
    // Hydration and current-access checks may cross the expiry boundary. TTL cleanup
    // is asynchronous; expiry must still be enforced immediately before delivery.
    this.requireLive(job);
    const complete = job.state === 'exact';
    return {
      items,
      asOf: job.createdAt,
      projectionRevision: job.fingerprint,
      complete,
      queryId: id,
      rowsState: items.length ? 'ready' : complete ? 'confirmed-empty' : 'searching',
      aggregateState: job.state,
      coverage: { examined: job.examined, scopeComplete: complete },
      ...(complete ? { totalCount: job.count, totalsByCurrency: job.totals } : {}),
    };
  }
}
