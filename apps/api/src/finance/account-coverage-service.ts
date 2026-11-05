import { loadCanonicalFinanceFact } from './canonical-spend-source.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import type { FinanceFact } from './query-contract.js';
import { FinanceExperienceFailure } from './telemetry.js';

type CanonicalRow = FinanceRecordKey & {
  collection: string;
  entryKey: string;
  data: { id: string; accountId: string; version: number };
};
type Checkpoint = {
  scopeRevision: number;
  markerRevision: number;
  cursor?: FinanceRecordKey;
  verified: number;
  examined: number;
  digest: string;
  dependencies: Record<string, number>;
  complete: boolean;
};
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};
const restart = (): never => {
  throw new FinanceExperienceFailure(
    'capacity',
    'Finance coverage revision changed; restart required.',
    'user',
  );
};
const normalizeFact = (fact: FinanceFact) => {
  const value = { ...fact };
  delete value.textMonth;
  delete value.textOrdinal;
  return JSON.parse(JSON.stringify(value)) as unknown;
};

/** Trusted migration computation, never an interactive query or a caller-supplied coverage flag.
 * The canonical resolver must rebuild the fact using shared spend/refund rules and report every
 * canonical scope/catalog META revision it read. Production resolver/publication wiring is separate.
 */
export class FinanceAccountCoverageVerifier {
  private readonly work: () => FinanceUnitOfWork;
  private readonly pageSize: number;
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      pageSize?: number;
      readPage?: (
        partition: string,
        cursor: FinanceRecordKey | undefined,
        limit: number,
      ) => Promise<{ rows: CanonicalRow[]; nextKey?: FinanceRecordKey }>;
      expectedFact?: (row: CanonicalRow) => Promise<{
        fact: FinanceFact;
        dependencies: Record<string, number>;
        sourceKey?: FinanceRecordKey;
      }>;
    } = {},
  ) {
    this.work = options.work ?? (() => new FinanceUnitOfWork());
    this.pageSize = options.pageSize ?? 5;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 5)
      throw new Error('Coverage page must contain 1–5 sources.');
  }
  async step(accountId: string, options: { restart?: boolean } = {}) {
    const work = this.work();
    const account = await loadTargetedFinanceEntity<{ id: string }>(work, 'accounts', accountId);
    if (!account || account.value.id !== accountId)
      return fail('Finance canonical account coverage is unavailable.');
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    const checkpointKey = { ...markerKey, SK: 'COVERAGE_CHECKPOINT' };
    const marker = await work.get(markerKey);
    let revision = Number(marker?.revision ?? 0);
    if (!Number.isSafeInteger(revision) || revision < 0 || marker?.state === 'rebuilding')
      return restart();
    const stored = (await work.get(checkpointKey))?.data as Checkpoint | undefined;
    const saved = options.restart ? undefined : stored;
    if (options.restart && marker) {
      revision++;
      await work.put({ ...marker, state: 'awaiting-coverage', coverageVerified: false, revision });
    }
    if (
      saved &&
      (!Number.isSafeInteger(saved.verified) ||
        saved.verified < 0 ||
        !Number.isSafeInteger(saved.examined) ||
        saved.examined < saved.verified ||
        typeof saved.complete !== 'boolean' ||
        typeof saved.digest !== 'string' ||
        !saved.dependencies ||
        typeof saved.dependencies !== 'object' ||
        Array.isArray(saved.dependencies))
    )
      return fail('Finance coverage checkpoint invariant failed.');
    if (
      saved &&
      (saved.scopeRevision !== account.scopeRevision ||
        revision !== saved.markerRevision + (saved.complete ? 1 : 0))
    )
      return restart();
    const checkpoint: Checkpoint = saved
      ? structuredClone(saved)
      : {
          scopeRevision: account.scopeRevision,
          markerRevision: revision,
          verified: 0,
          examined: 0,
          digest: '',
          dependencies: { [account.scopeKey.PK]: account.scopeRevision },
          complete: false,
        };
    const validateDependencies = async () => {
      const entries = Object.entries(checkpoint.dependencies);
      if (entries.length > 80)
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance coverage dependency budget exceeded.',
          'user',
        );
      for (const [PK, expected] of entries) {
        if (
          (!PK.startsWith('FINANCE#SCOPE#') && PK !== 'FINANCE#CATALOG') ||
          !Number.isSafeInteger(expected) ||
          expected < 0
        )
          return fail('Finance coverage source invariant failed.');
        const row = await work.get({ PK, SK: 'META' });
        if (row?.revision !== expected) return restart();
      }
    };
    await validateDependencies();
    if (checkpoint.complete) {
      if (marker?.state !== 'ready' || marker.coverageVerified !== true) return restart();
      return { complete: true, verified: checkpoint.verified, examined: checkpoint.examined };
    }
    const page = this.options.readPage
      ? await this.options.readPage(account.storageKey.PK, checkpoint.cursor, this.pageSize)
      : await this.readPage(account.storageKey.PK, checkpoint.cursor);
    if (page.rows.length > this.pageSize) return fail('Finance coverage page bound failed.');
    if (
      page.nextKey &&
      (page.nextKey.PK !== account.storageKey.PK ||
        !page.nextKey.SK.startsWith('ROW#transactions#') ||
        (checkpoint.cursor && page.nextKey.SK <= checkpoint.cursor.SK))
    )
      return fail('Finance coverage cursor invariant failed.');
    for (const row of page.rows) {
      if (
        row.PK !== account.storageKey.PK ||
        row.collection !== 'transactions' ||
        !row.SK.startsWith('ROW#transactions#') ||
        row.entryKey !== row.data.id
      )
        return fail('Finance canonical source identity invariant failed.');
      if (row.data.accountId !== accountId) continue;
      const expected = this.options.expectedFact
        ? await this.options.expectedFact(row)
        : await loadCanonicalFinanceFact(row.entryKey, this.work);
      if (
        (expected.sourceKey &&
          (expected.sourceKey.PK !== row.PK || expected.sourceKey.SK !== row.SK)) ||
        expected.fact.id !== row.entryKey ||
        expected.fact.accountId !== accountId ||
        expected.fact.sourceVersion !== row.data.version
      )
        return fail('Finance canonical projection source invariant failed.');
      for (const [PK, sourceRevision] of Object.entries(expected.dependencies)) {
        if (
          checkpoint.dependencies[PK] !== undefined &&
          checkpoint.dependencies[PK] !== sourceRevision
        )
          return restart();
        checkpoint.dependencies[PK] = sourceRevision;
      }
      const projected = (await work.get({ PK: `FINANCE#FACT#${row.entryKey}`, SK: 'CURRENT' }))
        ?.fact as FinanceFact | undefined;
      if (!projected || !isDeepStrictEqual(normalizeFact(projected), normalizeFact(expected.fact)))
        return fail('Finance projection does not match its canonical source.');
      checkpoint.verified++;
      checkpoint.digest = createHash('sha256')
        .update(JSON.stringify([checkpoint.digest, normalizeFact(expected.fact)]))
        .digest('hex');
    }
    checkpoint.examined += page.rows.length;
    if (checkpoint.examined > 1_000_000)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance canonical coverage enumeration budget exceeded.',
        'user',
      );
    await validateDependencies();
    if (page.nextKey) checkpoint.cursor = page.nextKey;
    else {
      delete checkpoint.cursor;
      const cardinality = await work.get({
        PK: `FINANCE#FACT_ACCOUNT#${accountId}`,
        SK: 'CARDINALITY',
      });
      if (
        (cardinality &&
          (!Number.isSafeInteger(cardinality.facts) || Number(cardinality.facts) < 0)) ||
        (cardinality?.facts ?? 0) !== checkpoint.verified
      )
        return fail('Finance projection cardinality does not match canonical coverage.');
      checkpoint.complete = true;
      await work.put({
        ...markerKey,
        state: 'ready',
        coverageVerified: true,
        sourceScopeRevision: account.scopeRevision,
        revision: revision + 1,
        coverageDependencies: checkpoint.dependencies,
        coverageDigest: checkpoint.digest,
      });
    }
    await work.put({ ...checkpointKey, data: checkpoint });
    const result = {
      complete: checkpoint.complete,
      verified: checkpoint.verified,
      examined: checkpoint.examined,
    };
    const fingerprint = createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex');
    return work.commit({
      key: { ...markerKey, SK: `COVERAGE_RECEIPT#${fingerprint}` },
      fingerprint,
      result,
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
  private async readPage(PK: string, cursor?: FinanceRecordKey) {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        ConsistentRead: true,
        Limit: this.pageSize,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#transactions#' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    return {
      rows: (result.Items ?? []) as CanonicalRow[],
      ...(result.LastEvaluatedKey ? { nextKey: result.LastEvaluatedKey as FinanceRecordKey } : {}),
    };
  }
}
