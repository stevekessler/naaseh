import { createUlid } from '@naaseh/domain';
import { createHash } from 'node:crypto';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { DynamoFinanceRepository } from './dynamo-repository.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import { FinanceRefundIndexVerifier } from './refund-index-coverage-service.js';
import { FinanceAccountCoverageVerifier } from './account-coverage-service.js';
import { loadCanonicalFinanceFact } from './canonical-spend-source.js';
import { SpendProjectionService } from './spend-projection-service.js';
import type { FinanceFact } from './query-contract.js';
import { FinanceExperienceFailure } from './telemetry.js';

type Phase = 'locators' | 'refund-index' | 'publish' | 'coverage' | 'complete';
type State = {
  operation: string;
  phase: Phase;
  scopePK: string;
  scopeRevision: number;
  calendarBasis: string;
  locatorCursor?: FinanceRecordKey;
  publishCursor?: FinanceRecordKey;
  coverageStarted?: boolean;
};
type SourceRow = FinanceRecordKey & {
  collection: string;
  entryKey: string;
  data: { id: string; accountId: string; version: number };
};
const stale = (): never => {
  throw new FinanceExperienceFailure(
    'capacity',
    'Finance migration source revision changed; restart required.',
    'user',
  );
};

/** Explicit trusted migration only. Never invoke this full reconciliation as a user's read fallback. */
export class FinanceBackfillDriver {
  private readonly work: () => FinanceUnitOfWork;
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      locators?: (
        scope: string,
        cursor?: FinanceRecordKey,
      ) => Promise<{ nextCursor: FinanceRecordKey | null; examined: number }>;
      refundIndex?: (
        scope: string,
        options: { restart?: boolean },
      ) => Promise<{ complete: boolean }>;
      readSources?: (
        scope: string,
        cursor?: FinanceRecordKey,
      ) => Promise<{ rows: SourceRow[]; nextKey?: FinanceRecordKey }>;
      canonical?: (
        id: string,
      ) => Promise<{ fact: FinanceFact; dependencies: Record<string, number> }>;
      publish?: (fact: FinanceFact, calendar: string) => Promise<void>;
      coverage?: (
        id: string,
        options: { restart: boolean },
      ) => Promise<{ complete: boolean; verified: number }>;
    } = {},
  ) {
    this.work = options.work ?? (() => new FinanceUnitOfWork());
  }
  private async account(id: string) {
    const account = await loadTargetedFinanceEntity<{ id: string }>(this.work(), 'accounts', id);
    if (!account || account.value.id !== id || !account.storageKey.PK.startsWith('FINANCE#SCOPE#'))
      throw new FinanceExperienceFailure(
        'invariant',
        'Finance migration account source is unavailable.',
      );
    return account;
  }
  async step(accountId: string, options: { restart?: boolean; calendarBasis?: string } = {}) {
    const calendarBasis = options.calendarBasis ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: calendarBasis }).format(0);
    } catch {
      throw new Error('Finance calendar context is invalid.');
    }
    const account = await this.account(accountId);
    const key = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'BACKFILL_DRIVER' };
    const stateWork = this.work();
    const stored = (await stateWork.get(key))?.data as State | undefined;
    if (
      stored &&
      !options.restart &&
      (stored.scopePK !== account.storageKey.PK ||
        stored.scopeRevision !== account.scopeRevision ||
        stored.calendarBasis !== calendarBasis)
    )
      return stale();
    const state: State =
      stored && !options.restart
        ? structuredClone(stored)
        : {
            operation: createUlid(),
            phase: 'locators',
            scopePK: account.storageKey.PK,
            scopeRevision: account.scopeRevision,
            calendarBasis,
          };
    state.operation ??= createUlid();
    if (!['locators', 'refund-index', 'publish', 'coverage', 'complete'].includes(state.phase))
      throw new FinanceExperienceFailure('invariant', 'Finance migration checkpoint is invalid.');
    let examined = 0;
    if (state.phase === 'locators') {
      const meta = await this.work().get(account.scopeKey);
      if (meta?.revision !== state.scopeRevision) return stale();
      if (meta.locatorIndexVersion === 1) state.phase = 'refund-index';
      else {
        const result = await (this.options.locators ?? DynamoFinanceRepository.backfillLocatorPage)(
          state.scopePK,
          state.locatorCursor,
        );
        examined = result.examined;
        if (result.nextCursor) state.locatorCursor = result.nextCursor;
        else {
          delete state.locatorCursor;
          state.phase = 'refund-index';
        }
      }
    } else if (state.phase === 'refund-index') {
      const result = await (
        this.options.refundIndex ??
        ((scope, opts) => new FinanceRefundIndexVerifier({ work: this.work }).step(scope, opts))
      )(state.scopePK, { restart: options.restart === true });
      if (result.complete) {
        const fresh = await this.account(accountId);
        if (fresh.storageKey.PK !== state.scopePK) return stale();
        state.scopeRevision = fresh.scopeRevision;
        state.phase = 'publish';
      }
    } else if (state.phase === 'publish') {
      if (!this.options.publish) {
        const marker = await this.work().get({
          PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`,
          SK: 'CURRENT',
        });
        if (marker?.state === 'rebuilding') {
          if (typeof marker.transactionId !== 'string')
            throw new FinanceExperienceFailure(
              'capacity',
              'Legacy Finance publication identity requires explicit recovery.',
              'user',
            );
          await new SpendProjectionService(this.work).resumePending(marker.transactionId);
        }
      }
      const page = await (this.options.readSources ?? this.readSources.bind(this))(
        state.scopePK,
        state.publishCursor,
      );
      if (
        page.rows.length > 5 ||
        (page.nextKey &&
          (page.nextKey.PK !== state.scopePK ||
            !page.nextKey.SK.startsWith('ROW#transactions#') ||
            (state.publishCursor && page.nextKey.SK <= state.publishCursor.SK)))
      )
        throw new FinanceExperienceFailure(
          'invariant',
          'Finance migration source page bound failed.',
        );
      for (const row of page.rows) {
        if (
          row.PK !== state.scopePK ||
          row.collection !== 'transactions' ||
          !row.SK.startsWith('ROW#transactions#') ||
          row.entryKey !== row.data.id ||
          typeof row.data.accountId !== 'string'
        )
          throw new FinanceExperienceFailure(
            'invariant',
            'Finance migration source identity failed.',
          );
        if (row.data.accountId !== accountId) continue;
        const source = await (
          this.options.canonical ?? ((id) => loadCanonicalFinanceFact(id, this.work))
        )(row.entryKey);
        if (
          source.fact.id !== row.entryKey ||
          source.fact.accountId !== accountId ||
          source.fact.sourceVersion !== row.data.version
        )
          return stale();
        await (
          this.options.publish ??
          (async (fact, basis) => {
            const service = new SpendProjectionService(this.work);
            await service.resumePending(fact.id);
            await service.publish(fact, basis);
          })
        )(source.fact, calendarBasis);
      }
      examined = page.rows.length;
      const fresh = await this.account(accountId);
      if (fresh.scopeRevision !== state.scopeRevision || fresh.storageKey.PK !== state.scopePK)
        return stale();
      if (page.nextKey) state.publishCursor = page.nextKey;
      else {
        delete state.publishCursor;
        state.phase = 'coverage';
        state.coverageStarted = false;
      }
    } else {
      const result = await (
        this.options.coverage ??
        ((id, opts) => new FinanceAccountCoverageVerifier({ work: this.work }).step(id, opts))
      )(accountId, { restart: state.phase !== 'complete' && !state.coverageStarted });
      state.coverageStarted = true;
      if (result.complete) state.phase = 'complete';
    }
    await stateWork.put({ ...key, data: state });
    const fingerprint = createHash('sha256').update(JSON.stringify(state)).digest('hex');
    return stateWork.commit({
      key: { ...key, SK: `BACKFILL_DRIVER_RECEIPT#${fingerprint}` },
      fingerprint,
      result: { phase: state.phase, complete: state.phase === 'complete', examined },
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
  private async readSources(PK: string, cursor?: FinanceRecordKey) {
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        ConsistentRead: true,
        Limit: 5,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#transactions#' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    return {
      rows: (page.Items ?? []) as SourceRow[],
      ...(page.LastEvaluatedKey ? { nextKey: page.LastEvaluatedKey as FinanceRecordKey } : {}),
    };
  }
}
