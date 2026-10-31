import { addMinorUnits, createUlid } from '@naaseh/domain';
import { financeQueryFiltersSchema, type FinanceQueryFilters } from '@naaseh/contracts';
import {
  FINANCE_QUERY_LIFETIME_MS,
  financeReadFingerprint,
  type FinanceReadResult,
} from './query-contract.js';
import type { FinanceReadRepository } from './read-repository.js';
import { FinanceUnitOfWork } from './unit-of-work.js';

type CurrencyTotal = { currency: string; currencyExponent: number; amountMinor: number };
export interface FinanceQueryJob {
  id: string;
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
}
export interface FinanceQueryJobStore {
  get(userId: string, id: string): Promise<FinanceQueryJob | undefined>;
  save(job: FinanceQueryJob, expectedVersion: number): Promise<FinanceQueryJob>;
}
const jobKey = (userId: string, id: string) => ({
  PK: `USER#${userId}`,
  SK: `FINANCE_QUERY#${id}`,
});

export class DynamoFinanceQueryJobStore implements FinanceQueryJobStore {
  async get(userId: string, id: string) {
    const work = new FinanceUnitOfWork();
    return (await work.get(jobKey(userId, id)))?.data as FinanceQueryJob | undefined;
  }
  async save(job: FinanceQueryJob, expectedVersion: number) {
    const work = new FinanceUnitOfWork();
    const key = jobKey(job.userId, job.id);
    const row = await work.get(key);
    const current = row?.data as FinanceQueryJob | undefined;
    if ((current?.version ?? 0) !== expectedVersion) {
      if (current) return current; // Another bounded worker already advanced this checkpoint.
      throw new Error('Finance query checkpoint conflict.');
    }
    await work.put({
      ...key,
      data: job,
      version: job.version,
      expiresAt: Math.floor(job.expiresAt / 1000),
    });
    return work.commit({
      key: { PK: key.PK, SK: `${key.SK}#STEP#${expectedVersion}` },
      fingerprint: `${job.fingerprint}:${expectedVersion}`,
      result: job,
      expiresAt: Math.floor(job.expiresAt / 1000),
    });
  }
}

function mergeTotals(previous: CurrencyTotal[], incoming: CurrencyTotal[]): CurrencyTotal[] {
  const totals = new Map(previous.map((t) => [t.currency, { ...t }]));
  for (const value of incoming) {
    const current = totals.get(value.currency);
    if (current && current.currencyExponent !== value.currencyExponent)
      throw new Error('Finance currency invariant failed.');
    totals.set(value.currency, {
      ...value,
      amountMinor: addMinorUnits([current?.amountMinor ?? 0, value.amountMinor]),
    });
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Trusted worker computation cannot deliver data: only status() may return currently authorized results. */
export class FinanceQueryJobService {
  constructor(
    private readonly options: {
      repository: FinanceReadRepository;
      store: FinanceQueryJobStore;
      validate: (job: FinanceQueryJob) => Promise<boolean>;
      dispatch: (job: { userId: string; queryId: string }) => Promise<void>;
      hydrate: (job: FinanceQueryJob) => Promise<FinanceReadResult['items']>;
      authorizeDelivery: (job: FinanceQueryJob) => Promise<boolean>;
      now?: () => number;
    },
  ) {}
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private async checked(userId: string, id: string) {
    const job = await this.options.store.get(userId, id);
    if (!job || job.userId !== userId || job.expiresAt <= this.now())
      throw new Error('Finance query missing or expired.');
    if (!(await this.options.validate(job)))
      throw new Error('Finance query source or authorization changed; restart required.');
    return job;
  }
  async create(input: {
    userId: string;
    accountIds: string[];
    sourceRevisions: Record<string, string>;
    securityRevision: number;
    filters: Partial<FinanceQueryFilters>;
  }) {
    const accounts = [...new Set(input.accountIds)].sort();
    if (
      !accounts.length ||
      accounts.length > 50 ||
      accounts.some((id) => !input.sourceRevisions[id])
    )
      throw new Error('Invalid Finance query scope.');
    const id = createUlid();
    const now = this.now();
    const filters = financeQueryFiltersSchema.parse(input.filters);
    const fingerprint = financeReadFingerprint({
      userId: input.userId,
      accountId: accounts.join(','),
      sourceRevision: JSON.stringify(input.sourceRevisions),
      securityRevision: input.securityRevision,
      filters,
    });
    const job: FinanceQueryJob = {
      id,
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
      state: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt: now + FINANCE_QUERY_LIFETIME_MS,
      version: 1,
    };
    if (!(await this.options.validate(job))) throw new Error('Finance query access denied.');
    if (!(await this.options.authorizeDelivery(job)))
      throw new Error('Finance query unlock required.');
    await this.options.store.save(job, 0);
    await this.options.dispatch({ userId: job.userId, queryId: job.id });
    return id;
  }
  async step(userId: string, id: string): Promise<void> {
    const job = await this.checked(userId, id);
    if (job.state === 'exact') return;
    const partitions = job.partitions.filter((p) => !p.complete).slice(0, 5);
    const results = await Promise.all(
      partitions.map(async (partition) => ({
        partition,
        result: await this.options.repository.scan({
          userId,
          accountId: partition.accountId,
          sourceRevision: job.sourceRevisions[partition.accountId]!,
          securityRevision: job.securityRevision,
          filters: job.filters,
          limit: 200,
          ...(partition.cursor ? { cursor: partition.cursor } : {}),
        }),
      })),
    );
    const next = structuredClone(job);
    next.workerNonce = createUlid();
    for (const { partition, result } of results) {
      const target = next.partitions.find((p) => p.accountId === partition.accountId)!;
      target.complete = !result.step.nextCursor;
      if (result.step.nextCursor) target.cursor = result.step.nextCursor;
      else delete target.cursor;
      next.count = addMinorUnits([next.count, result.step.matchedCount]);
      next.examined = addMinorUnits([next.examined, result.step.examined]);
      next.totals = mergeTotals(next.totals, result.step.totalsByCurrency);
      next.firstIds = [
        ...next.firstIds,
        ...result.step.topRows.map((fact) => ({
          id: fact.id,
          accountId: fact.accountId,
          effectiveAt: fact.effectiveAt,
        })),
      ]
        .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.id.localeCompare(a.id))
        .slice(0, 200);
    }
    next.state = next.partitions.every((p) => p.complete) ? 'exact' : 'pending';
    next.version++;
    if (next.examined > 1_000_000 || next.version > 2_000)
      throw new Error('Finance query bounded-work budget exceeded.');
    if (!(await this.options.validate(next)))
      throw new Error('Finance query revision changed before publication.');
    const saved = await this.options.store.save(next, job.version);
    if (saved.state !== 'exact' && saved.workerNonce === next.workerNonce)
      await this.options.dispatch({ userId, queryId: id });
  }
  async status(userId: string, id: string): Promise<FinanceReadResult> {
    const job = await this.checked(userId, id);
    if (!(await this.options.authorizeDelivery(job)))
      throw new Error('Finance query unlock required.');
    const items = await this.options.hydrate(job);
    if (!(await this.options.validate(job)) || !(await this.options.authorizeDelivery(job)))
      throw new Error('Finance query authorization changed during delivery.');
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
