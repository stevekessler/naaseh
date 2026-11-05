import { matchesFinanceFact, type FinanceFact, type FinanceReadContext } from './query-contract.js';
import { financeQueryFiltersSchema } from '@naaseh/contracts';
import {
  emitFinanceExperienceEvent,
  financeExperienceFailureDetails,
  financeExperienceFailureOutcome,
  FinanceExperienceFailure,
} from './telemetry.js';
import { createHash } from 'node:crypto';
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createUlid, membershipSchema, financeScopeSchema, financeAudience } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { FinanceUnitOfWork, financeLocatorKey } from './unit-of-work.js';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceReadRepository } from './read-repository.js';
import {
  DynamoFinanceQueryJobStore,
  FinanceQueryJobService,
  type FinanceQueryJob,
} from './query-job-service.js';
import { dispatchFinanceQueryWorker } from './query-worker.js';

/** Strong reads of the canonical profile/membership copies; never load password hashes. */
async function currentActor(userId: string) {
  const profile = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      ConsistentRead: true,
      ProjectionExpression: '#d.id, #d.#r, #d.active, #d.sessionEpoch, #d.credentialVersion, #d.#v',
      ExpressionAttributeNames: { '#d': 'data', '#r': 'role', '#v': 'version' },
    }),
  );
  const user = profile.Item?.data;
  if (!user || user.id !== userId || user.active !== true || user.role !== 'user') return undefined;
  const memberships = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'GROUP#' },
        ConsistentRead: true,
        Limit: 100,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const row of page.Items ?? []) memberships.push(membershipSchema.parse(row.data));
    if (memberships.length > 1_000)
      throw new Error('Finance membership read exceeds safety bound.');
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  const active = memberships.filter((m) => m.status === 'active' && m.userId === userId);
  const actor: FinanceActor = {
    id: userId,
    role: 'user',
    active: true,
    groupMemberships: active.map(({ groupId, role }) => ({ groupId, role })),
  };
  const profileRevision = {
    id: user.id,
    role: user.role,
    active: user.active,
    version: user.version ?? 1,
    sessionEpoch: user.sessionEpoch ?? 0,
    credentialVersion: user.credentialVersion ?? 0,
  };
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        user: profileRevision,
        memberships: active.map((m) => [m.groupId, m.role, m.version]).sort(),
      }),
    )
    .digest('hex');
  return { actor, fingerprint };
}

type RecordKey = { PK: string; SK: string };
const recordId = (key: RecordKey) => JSON.stringify([key.PK, key.SK]);
async function batchRows(keys: RecordKey[]) {
  const unique = [...new Map(keys.map((key) => [recordId(key), key])).values()];
  const rows = new Map<string, Record<string, unknown>>();
  for (let group = 0; group < unique.length; group += 500) {
    const chunks = [];
    for (let offset = group; offset < Math.min(group + 500, unique.length); offset += 100)
      chunks.push(unique.slice(offset, Math.min(offset + 100, group + 500)));
    const results = await Promise.all(
      chunks.map((Keys) =>
        dynamodb.send(
          new BatchGetCommand({
            RequestItems: {
              [tableName]: { Keys, ConsistentRead: true },
            },
          }),
        ),
      ),
    );
    for (const result of results) {
      if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length)
        throw new Error('Finance authority snapshot requires retry.');
      for (const row of result.Responses?.[tableName] ?? [])
        rows.set(recordId(row as RecordKey), row);
    }
  }
  return rows;
}
async function scopedRows(collection: string, ids: string[]) {
  const locators = await batchRows(ids.map((id) => financeLocatorKey(collection, id)));
  const pointers = new Map<string, RecordKey>();
  for (const id of ids) {
    const pointer = locators.get(recordId(financeLocatorKey(collection, id)))?.storageKey as
      | RecordKey
      | undefined;
    if (pointer?.PK.startsWith('FINANCE#SCOPE#') && pointer.SK.startsWith(`ROW#${collection}#`))
      pointers.set(id, pointer);
  }
  const rows = await batchRows([...pointers.values()]);
  const resolved = new Map<string, { data: Record<string, unknown>; partition: string }>();
  for (const [id, pointer] of pointers) {
    const row = rows.get(recordId(pointer));
    if (
      row?.entryKey === id &&
      row.collection === collection &&
      row.data &&
      typeof row.data === 'object'
    )
      resolved.set(id, { data: row.data as Record<string, unknown>, partition: pointer.PK });
  }
  return resolved;
}
async function sourceSnapshot(actor: FinanceActor, ids: string[]) {
  const accounts = await scopedRows('accounts', ids);
  const records = await batchRows([
    ...[...accounts.values()].map((account) => ({ PK: account.partition, SK: 'META' })),
    ...ids.map((id) => ({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' })),
  ]);
  const coverageDependencies = new Map<string, Record<string, number>>();
  const dependencyKeys = new Map<string, RecordKey>();
  for (const id of ids) {
    const marker = records.get(recordId({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' }));
    const raw = marker?.coverageDependencies;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entries = Object.entries(raw);
    if (
      entries.length > 80 ||
      entries.some(
        ([PK, revision]) =>
          (!PK.startsWith('FINANCE#SCOPE#') && PK !== 'FINANCE#CATALOG') ||
          !Number.isSafeInteger(revision) ||
          (revision as number) < 0,
      )
    )
      continue;
    const dependencies = Object.fromEntries(entries) as Record<string, number>;
    coverageDependencies.set(id, dependencies);
    for (const PK of Object.keys(dependencies)) dependencyKeys.set(PK, { PK, SK: 'META' });
  }
  const dependencyRows = new Map(records);
  const additional = await batchRows(
    [...dependencyKeys.values()].filter((key) => !dependencyRows.has(recordId(key))),
  );
  for (const [key, value] of additional) dependencyRows.set(key, value);
  const revisions = new Map<string, string>();
  for (const id of ids) {
    const account = accounts.get(id);
    if (!account || account.data.id !== id || account.data.status === 'deleting') continue;
    const scope = financeScopeSchema.safeParse(account.data.scope);
    if (
      !scope.success ||
      account.partition !== `FINANCE#SCOPE#${financeAudience(scope.data)}` ||
      !authorizeFinanceScope(actor, scope.data, 'read').allowed
    )
      continue;
    const meta = records.get(recordId({ PK: account.partition, SK: 'META' }));
    const marker = records.get(recordId({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' }));
    if (
      !meta ||
      !Number.isSafeInteger(meta.revision) ||
      !marker ||
      marker.state !== 'ready' ||
      marker.coverageVerified !== true ||
      coverageDependencies.get(id)?.[account.partition] !== meta.revision ||
      Object.entries(coverageDependencies.get(id) ?? {}).some(
        ([PK, revision]) => dependencyRows.get(recordId({ PK, SK: 'META' }))?.revision !== revision,
      ) ||
      marker.sourceScopeRevision !== meta.revision ||
      !Number.isSafeInteger(marker.revision)
    )
      continue;
    revisions.set(id, JSON.stringify([meta.revision, marker.revision]));
  }
  return revisions;
}

/** No delivery credential is present in a background invocation; status/create fail closed there. */
export function createFinanceQueryRuntime(
  options: {
    authorizeDelivery?: (job: FinanceQueryJob) => Promise<boolean>;
  } = {},
) {
  let currentJob: FinanceQueryJob | undefined;
  let currentPolicy: Awaited<ReturnType<typeof currentActor>>;
  let currentSources = new Map<string, string>();
  const validate = async (job: FinanceQueryJob) => {
    const current = await currentActor(job.userId);
    if (!current || job.sourceRevisions.$authorization !== current.fingerprint) return false;
    const work = new FinanceUnitOfWork();
    const preference = await work.get({ PK: `USER#${job.userId}`, SK: 'FINANCE_SECURITY' });
    const revision = preference ? Number(preference.revision) : 0;
    if (!Number.isSafeInteger(revision) || revision !== job.securityRevision) return false;
    const ids = Object.keys(job.sourceRevisions).filter((id) => id !== '$authorization');
    if (!ids.length || ids.length > 100) return false;
    const revisions = await sourceSnapshot(current.actor, ids);
    for (const id of ids) if (revisions.get(id) !== job.sourceRevisions[id]) return false;
    currentPolicy = current;
    currentSources = revisions;
    currentJob = job;
    return true;
  };
  const authorizeSources = async (
    context: FinanceReadContext,
    originals?: readonly string[],
    budgetIds?: readonly string[],
  ) => {
    const job = currentJob;
    if (
      !job ||
      job.userId !== context.userId ||
      job.sourceRevisions[context.accountId] !== context.sourceRevision ||
      job.securityRevision !== context.securityRevision ||
      !currentPolicy ||
      currentSources.get(context.accountId) !== context.sourceRevision
    )
      return false;
    // These reads compute privately. step()/status() refresh the full canonical snapshot
    // before publication/delivery, so we can reuse it across the five bounded source scans.
    const current = currentPolicy;
    if (!current) return false;
    for (const id of originals ?? [])
      if (currentSources.get(id) !== job.sourceRevisions[id] || !currentSources.has(id))
        return false;
    const budgets = await scopedRows('budgets', [...new Set(budgetIds ?? [])]);
    for (const id of budgetIds ?? []) {
      const budget = budgets.get(id);
      if (
        !budget ||
        typeof budget.data.groupId !== 'string' ||
        budget.partition !== `FINANCE#SCOPE#GROUP#${budget.data.groupId}` ||
        !authorizeFinanceScope(
          current.actor,
          { type: 'group', groupId: budget.data.groupId },
          'read',
        ).allowed
      )
        return false;
    }
    return true;
  };
  const repository = new FinanceReadRepository({
    tableName,
    cursorSecret: process.env.CURSOR_SIGNING_SECRET ?? '',
    client: {
      send: async (command) =>
        command instanceof QueryCommand ? dynamodb.send(command) : dynamodb.send(command),
    },
    estimate: async (partitions) => {
      const counts = await batchRows(partitions.map((PK) => ({ PK, SK: 'CARDINALITY' })));
      return new Map(
        partitions.map((PK) => [
          PK,
          Number(counts.get(recordId({ PK, SK: 'CARDINALITY' }))?.facts ?? 0),
        ]),
      );
    },
    authorize: authorizeSources,
  });
  return new FinanceQueryJobService({
    repository,
    store: new DynamoFinanceQueryJobStore(),
    validate,
    authorizeDelivery: options.authorizeDelivery ?? (async () => false),
    authorizeFacts: async (job, facts) => {
      const byAccount = new Map<string, FinanceFact[]>();
      for (const fact of facts)
        byAccount.set(fact.accountId, [...(byAccount.get(fact.accountId) ?? []), fact]);
      for (const [accountId, rows] of byAccount) {
        if (
          !(await authorizeSources(
            {
              userId: job.userId,
              accountId,
              sourceRevision: job.sourceRevisions[accountId] ?? '',
              securityRevision: job.securityRevision,
              filters: job.filters,
            },
            [...new Set(rows.flatMap((fact) => fact.originalSourceAccountIds ?? []))],
            [
              ...new Set(
                rows.flatMap((fact) =>
                  fact.slices.flatMap((slice) => (slice.budgetId ? [slice.budgetId] : [])),
                ),
              ),
            ],
          ))
        )
          return false;
      }
      return true;
    },
    dispatch: dispatchFinanceQueryWorker,
    hydrate: async (job) => {
      const facts: FinanceFact[] = [];
      const expected = new Map(job.firstIds.map((ref) => [ref.id, ref]));
      const seen = new Set<string>();
      const filters = financeQueryFiltersSchema.parse(job.filters);
      for (let offset = 0; offset < job.firstIds.length; offset += 100) {
        const result = await dynamodb.send(
          new BatchGetCommand({
            RequestItems: {
              [tableName]: {
                Keys: job.firstIds
                  .slice(offset, offset + 100)
                  .map((ref) => ({ PK: `FINANCE#FACT#${ref.id}`, SK: 'CURRENT' })),
                ConsistentRead: true,
              },
            },
          }),
        );
        if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length)
          throw new Error('Finance query hydration requires retry.');
        for (const row of result.Responses?.[tableName] ?? []) {
          const fact = row.fact as FinanceFact | undefined;
          const ref = fact && expected.get(fact.id);
          if (
            !fact ||
            !ref ||
            seen.has(fact.id) ||
            row.PK !== `FINANCE#FACT#${ref.id}` ||
            row.SK !== 'CURRENT' ||
            fact.accountId !== ref.accountId ||
            fact.effectiveAt !== ref.effectiveAt ||
            !Array.isArray(fact.slices) ||
            !matchesFinanceFact(fact, filters)
          )
            throw new FinanceExperienceFailure(
              'invariant',
              'Finance query source identity invariant failed.',
            );
          seen.add(fact.id);
          facts.push(fact);
        }
      }
      if (facts.length !== job.firstIds.length)
        throw new Error('Finance query source changed; restart required.');
      return facts.sort(
        (a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.id.localeCompare(a.id),
      );
    },
  });
}

export async function executeFinanceQueryWorker(input: { userId: string; queryId: string }) {
  const started = performance.now();
  const correlationId = createUlid();
  try {
    await createFinanceQueryRuntime().step(input.userId, input.queryId);
    emitFinanceExperienceEvent({
      operation: 'query',
      outcome: 'success',
      correlationId,
      durationMs: performance.now() - started,
    });
  } catch (error) {
    emitFinanceExperienceEvent({
      operation: 'query',
      outcome: financeExperienceFailureOutcome(error),
      correlationId,
      durationMs: performance.now() - started,
      ...financeExperienceFailureDetails(error),
    });
    throw error;
  }
}
