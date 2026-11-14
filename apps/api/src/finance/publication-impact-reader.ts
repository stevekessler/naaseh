import { GetCommand, QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import type { FinanceRecordKey } from './unit-of-work.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  projectionDependencyPartition,
  projectionDependencyFormat,
} from './projection-dependency-directory.js';
import {
  financeSourceDependencyPartition,
  type FinanceSourceDependencyKind,
} from './source-dependency-index.js';
import { isFinanceScopePartition } from './publication-change-journal.js';
import { ulidSchema } from '@naaseh/domain';
import { FinanceExperienceFailure } from './telemetry.js';
import { isFinanceAccountRetired } from './account-retirement-marker.js';
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** Private bounded candidates only. Consumers must condition current proofs before applying work. */
export class FinancePublicationImpactReader {
  constructor(
    private readonly options: {
      query?: (input: QueryCommandInput) => Promise<{
        Items?: Record<string, unknown>[];
        LastEvaluatedKey?: Record<string, unknown>;
      }>;
      marker?: (id: string) => Promise<Record<string, unknown> | undefined>;
    } = {},
  ) {}
  private async page(PK: string, cursor?: FinanceRecordKey, prefix = 'ACCOUNT#') {
    const validSortKey = (value: unknown) => {
      if (typeof value !== 'string') return false;
      const parts = value.split('#');
      return (
        parts[0] === 'ACCOUNT' &&
        ulidSchema.safeParse(parts[1]).success &&
        (PK.startsWith('FINANCE#FACT_DEPENDENCY#')
          ? parts.length === 4 &&
            parts[2] === 'TRANSACTION' &&
            ulidSchema.safeParse(parts[3]).success
          : parts.length === 2)
      );
    };
    const validKey = (value: unknown): value is FinanceRecordKey => {
      if (!value || typeof value !== 'object') return false;
      const key = value as FinanceRecordKey;
      return (
        Object.keys(key).sort().join(',') === 'PK,SK' &&
        key.PK === PK &&
        typeof key.SK === 'string' &&
        validSortKey(key.SK) &&
        key.SK.startsWith(prefix) &&
        key.SK.length <= 200
      );
    };
    if (cursor && !validKey(cursor)) return fail('Finance impact cursor is invalid.');
    const input: QueryCommandInput = {
      TableName: tableName,
      ConsistentRead: true,
      Limit: 5,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
      ...(cursor ? { ExclusiveStartKey: cursor } : {}),
    };
    const result = this.options.query
      ? await this.options.query(input)
      : await dynamodb.send(new QueryCommand(input));
    const rows = result.Items ?? [];
    if (rows.length > 5) return fail('Finance impact page bound exceeded.');
    let previous = cursor?.SK;
    for (const row of rows) {
      if (
        row.PK !== PK ||
        typeof row.SK !== 'string' ||
        !validSortKey(row.SK) ||
        !row.SK.startsWith(prefix) ||
        (previous !== undefined && row.SK <= previous)
      )
        return fail('Finance impact page identity or order is invalid.');
      previous = row.SK;
    }
    const nextKey = result.LastEvaluatedKey;
    if (nextKey && (!validKey(nextKey) || !rows.length || nextKey.SK !== previous))
      return fail('Finance impact page made invalid progress.');
    return { rows, ...(nextKey ? { nextKey: nextKey as FinanceRecordKey } : {}) };
  }
  async accounts(scope: string, cursor?: FinanceRecordKey) {
    const page = await this.page(projectionDependencyPartition(scope), cursor);
    const accountIds: string[] = [];
    for (const row of page.rows) {
      if (
        row.format !== projectionDependencyFormat ||
        row.dependencyScope !== scope ||
        !ulidSchema.safeParse(row.accountId).success ||
        row.SK !== `ACCOUNT#${row.accountId}`
      )
        return fail('Finance dependency directory identity or format is invalid.');
      const accountId = row.accountId as string;
      const key = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
      const marker = this.options.marker
        ? await this.options.marker(accountId)
        : (
            await dynamodb.send(
              new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
            )
          ).Item;
      if (isFinanceAccountRetired(marker, accountId)) continue;
      const dependencies = marker?.coverageDependencies;
      if (
        !marker ||
        marker.PK !== key.PK ||
        marker.SK !== key.SK ||
        !dependencies ||
        typeof dependencies !== 'object' ||
        Array.isArray(dependencies) ||
        Object.keys(dependencies).length === 0 ||
        Object.keys(dependencies).length > 80 ||
        Object.entries(dependencies).some(
          ([PK, revision]) =>
            !isFinanceScopePartition(PK) ||
            typeof revision !== 'number' ||
            !Number.isSafeInteger(revision) ||
            revision < 0,
        )
      )
        return fail('Finance impact account coverage proof is unavailable.');
      // A stale enrolled entry is not authority. Empty/missing proofs do not prove absence.
      if (Object.hasOwn(dependencies, scope)) accountIds.push(accountId);
    }
    return { accountIds, ...(page.nextKey ? { nextKey: page.nextKey } : {}) };
  }
  async sources(
    kind: FinanceSourceDependencyKind,
    sourceId: string,
    cursor?: FinanceRecordKey,
    accountId?: string,
  ) {
    if (
      !['merchant', 'budgetItem', 'originalExpense', 'originalAccount'].includes(kind) ||
      !ulidSchema.safeParse(sourceId).success ||
      (accountId !== undefined && !ulidSchema.safeParse(accountId).success)
    )
      return fail('Finance source reference identity is invalid.');
    const page = await this.page(
      financeSourceDependencyPartition(kind, sourceId),
      cursor,
      accountId ? `ACCOUNT#${accountId}#TRANSACTION#` : 'ACCOUNT#',
    );
    const sources: Array<{ accountId: string; transactionId: string }> = [];
    for (const row of page.rows) {
      if (
        !ulidSchema.safeParse(row.accountId).success ||
        !ulidSchema.safeParse(row.transactionId).success ||
        row.SK !== `ACCOUNT#${row.accountId}#TRANSACTION#${row.transactionId}`
      )
        return fail('Finance source reference identity is invalid.');
      sources.push({
        accountId: row.accountId as string,
        transactionId: row.transactionId as string,
      });
    }
    return { sources, ...(page.nextKey ? { nextKey: page.nextKey } : {}) };
  }
}
