import { getMembership } from '../groups/group-repository.js';
import { SafeApiError } from '../shared/http.js';
import {
  matchesFinanceFact,
  normalizeFinanceText,
  isFinanceFactBefore,
  compareFinanceRows,
  type FinanceFact,
  type FinanceReadContext,
} from './query-contract.js';
import {
  financeQueryFiltersSchema,
  financeQueryStartSchema,
  type csvDuplicateCheckSchema,
} from '@naaseh/contracts';
import {
  emitFinanceExperienceEvent,
  financeExperienceFailureDetails,
  financeExperienceFailureOutcome,
  FinanceExperienceFailure,
} from './telemetry.js';
import { createHash } from 'node:crypto';
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  createUlid,
  membershipSchema,
  financeScopeSchema,
  financeAudience,
  ulidSchema,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { financeLocatorKey } from './unit-of-work.js';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceReadRepository } from './read-repository.js';
import {
  DynamoFinanceQueryJobStore,
  FinanceQueryJobService,
  type FinanceQueryJob,
  type FinanceQueryJobStore,
} from './query-job-service.js';
import { dispatchFinanceQueryWorker } from './query-worker.js';
import { supportsFinanceAccountSummary } from './account-read-summary.js';
import { sumSpendByCurrency, addMinorUnits } from '@naaseh/domain';

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
  if (!user || user.id !== userId || user.active !== true || !['user', 'admin'].includes(user.role))
    return undefined;
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
    role: user.role,
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

export async function listFinanceBrowseKeys(
  userId: string,
  collection: 'accounts' | 'categories' | 'merchants' | 'reviewIssues',
) {
  const current = await currentActor(userId);
  if (!current)
    throw new FinanceExperienceFailure('authorization', 'Finance query access denied.', 'user');
  const partitions =
    collection === 'categories' || collection === 'merchants'
      ? ['FINANCE#CATALOG']
      : [
          `FINANCE#SCOPE#OWNER#${userId}`,
          ...current.actor.groupMemberships.map(({ groupId }) => `FINANCE#SCOPE#GROUP#${groupId}`),
        ];
  if (partitions.length > 50)
    throw new FinanceExperienceFailure('capacity', 'Finance metadata scope is too large.', 'user');
  const keys: string[] = [];
  const maximum = collection === 'accounts' ? 50 : 1000;
  for (let offset = 0; offset < partitions.length; offset += 5) {
    const pages = await Promise.all(
      partitions.slice(offset, offset + 5).map((PK) =>
        dynamodb.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#' + collection + '#' },
            ProjectionExpression: 'entryKey',
            ConsistentRead: true,
            Limit: maximum + 1,
          }),
        ),
      ),
    );
    for (const page of pages) {
      if (page.LastEvaluatedKey || keys.length + (page.Items?.length ?? 0) > maximum)
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance metadata selection is too large.',
          'user',
        );
      for (const item of page.Items ?? []) {
        if (typeof item.entryKey !== 'string') throw new Error('Finance metadata key is invalid.');
        keys.push(item.entryKey);
      }
    }
  }
  return keys;
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
async function sourceSnapshot(
  actor: FinanceActor,
  ids: string[],
  resolvedAccounts?: Awaited<ReturnType<typeof scopedRows>>,
  originalAccounts?: Set<string>,
  orderedAccounts?: Set<string>,
) {
  const accounts = resolvedAccounts ?? (await scopedRows('accounts', ids));
  const records = await batchRows([
    ...[...accounts.values()].map((account) => ({ PK: account.partition, SK: 'META' })),
    ...ids.map((id) => ({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' })),
  ]);
  const coverageDependencies = new Map<string, Record<string, number>>();
  const dependencyKeys = new Map<string, RecordKey>();
  for (const id of ids) {
    const marker = records.get(recordId({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' }));
    const proofVersion = marker?.sourceAccountProofVersion;
    const originalIds = marker?.originalSourceAccountIds;
    if (
      (proofVersion === undefined && originalIds !== undefined) ||
      (proofVersion !== undefined &&
        (proofVersion !== 1 ||
          !Array.isArray(originalIds) ||
          originalIds.length > 100 ||
          originalIds.some((id) => !ulidSchema.safeParse(id).success)))
    )
      continue;
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
      Number(marker.coverageDeferredSourceCount ?? 0) !== 0 ||
      coverageDependencies.get(id)?.[account.partition] !== meta.revision ||
      Object.entries(coverageDependencies.get(id) ?? {}).some(
        ([PK, revision]) => dependencyRows.get(recordId({ PK, SK: 'META' }))?.revision !== revision,
      ) ||
      marker.sourceScopeRevision !== meta.revision ||
      !Number.isSafeInteger(marker.revision)
    )
      continue;
    revisions.set(id, JSON.stringify([meta.revision, marker.revision]));
    if (marker.sourceAccountProofVersion === 1 && marker.accountIndexOrderVersion === 1)
      orderedAccounts?.add(id);
    if (originalAccounts && marker.sourceAccountProofVersion === 1)
      for (const original of marker.originalSourceAccountIds as string[])
        originalAccounts.add(original);
  }
  return revisions;
}

/** No delivery credential is present in a background invocation; status/create fail closed there. */
export async function checkIndexedCsvDuplicates(
  userId: string,
  accountId: string,
  input: ReturnType<typeof csvDuplicateCheckSchema.parse>,
) {
  const verify = async () => {
    const current = await currentActor(userId);
    const accounts = await scopedRows('accounts', [accountId]);
    const record = accounts.get(accountId);
    const scope = financeScopeSchema.safeParse(record?.data.scope);
    if (
      !current ||
      !record ||
      !scope.success ||
      record.partition !== `FINANCE#SCOPE#${financeAudience(scope.data)}` ||
      !authorizeFinanceScope(current.actor, scope.data, 'edit').allowed
    )
      throw new Error('Finance record not found.');
    if (scope.data.type === 'group') {
      const member = await getMembership(scope.data.groupId, userId);
      if (
        member?.status !== 'active' ||
        member.userId !== userId ||
        member.groupId !== scope.data.groupId ||
        !current.actor.groupMemberships.some(
          (entry) => entry.groupId === member.groupId && entry.role === member.role,
        )
      )
        throw new Error('Finance record not found.');
    }
    const ordered = new Set<string>();
    const revisions = await sourceSnapshot(
      current.actor,
      [accountId],
      accounts,
      undefined,
      ordered,
    );
    const revision = revisions.get(accountId);
    if (!revision || !ordered.has(accountId))
      throw new SafeApiError(
        409,
        'finance_csv_coverage_unavailable',
        'Current account coverage is unavailable. Refresh Finance and try again.',
        'conflict',
      );
    return JSON.stringify([current.fingerprint, revision]);
  };
  const before = await verify();
  const reader = new FinanceReadRepository({
    tableName,
    cursorSecret: process.env.CURSOR_SIGNING_SECRET ?? '',
    client: {
      send: async (command) =>
        command instanceof QueryCommand ? dynamodb.send(command) : dynamodb.send(command),
    },
    authorize: async () => false,
  });
  const ordinals = await reader
    .csvDuplicateOrdinals(accountId, input.rows)
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === 'CSV duplicate check needs a narrower date range.'
      )
        throw new SafeApiError(
          409,
          'finance_csv_narrower_range_required',
          error.message,
          'conflict',
        );
      throw error;
    });
  if ((await verify()) !== before)
    throw new SafeApiError(
      409,
      'finance_csv_source_changed',
      'Account transactions changed. Check for duplicates again.',
      'conflict',
    );
  return { ordinals };
}

export function createFinanceQueryRuntime(
  options: {
    authorizeDelivery?: (job: FinanceQueryJob) => Promise<boolean>;
    store?: FinanceQueryJobStore;
    dispatch?: (job: { userId: string; queryId: string }) => Promise<void>;
  } = {},
) {
  let currentJob: FinanceQueryJob | undefined;
  let currentPolicy: Awaited<ReturnType<typeof currentActor>>;
  let currentSources = new Map<string, string>();
  let currentOrderedSources = new Set<string>();
  const validate = async (job: FinanceQueryJob) => {
    const current = await currentActor(job.userId);
    if (!current || job.sourceRevisions.$authorization !== current.fingerprint) return false;
    // Query computation needs the revision only, never the PIN verifier or salt.
    // Keep PK so an existing malformed preference cannot look like an absent one.
    const preference = (
      await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `USER#${job.userId}`, SK: 'FINANCE_SECURITY' },
          ConsistentRead: true,
          ProjectionExpression: 'PK, #revision',
          ExpressionAttributeNames: { '#revision': 'revision' },
        }),
      )
    ).Item;
    const revision = preference ? Number(preference.revision) : 0;
    if (!Number.isSafeInteger(revision) || revision !== job.securityRevision) return false;
    const ids = Object.keys(job.sourceRevisions).filter((id) => id !== '$authorization');
    if (!ids.length || ids.length > 100) return false;
    const ordered = new Set<string>();
    const revisions = await sourceSnapshot(current.actor, ids, undefined, undefined, ordered);
    for (const id of ids) if (revisions.get(id) !== job.sourceRevisions[id]) return false;
    currentPolicy = current;
    currentSources = revisions;
    currentOrderedSources = ordered;
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
    // Browsing counts only the authorized transaction and its signed principal.
    // Private spend, refund and budget associations are never part of its response.
    if (context.filters.transactionBrowse) return true;
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
      const estimates = new Map<string, number>();
      for (const PK of partitions) {
        const row = counts.get(recordId({ PK, SK: 'CARDINALITY' }));
        const value = PK.includes('#text#')
          ? row?.estimateKind === 'posting-chunks-v1'
            ? Number(row.chunks) * 500
            : undefined
          : row?.facts;
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
          estimates.set(PK, value);
      }
      return estimates;
    },
    authorize: authorizeSources,
  });
  const service = new FinanceQueryJobService({
    repository,
    cursorSecret: process.env.CURSOR_SIGNING_SECRET ?? '',
    store: options.store ?? new DynamoFinanceQueryJobStore(),
    validate,
    authorizeDelivery: options.authorizeDelivery ?? (async () => false),
    preview: async (job) => {
      const filters = financeQueryFiltersSchema.parse(job.filters);
      const { transactionBrowse, ...summaryFilters } = filters;
      if (
        !supportsFinanceAccountSummary(summaryFilters) ||
        !job.partitions.every((partition) => currentOrderedSources.has(partition.accountId))
      )
        return undefined;
      const results: Array<Awaited<ReturnType<FinanceReadRepository['preview']>>> = [];
      for (let offset = 0; offset < job.partitions.length; offset += 5) {
        results.push(
          ...(await Promise.all(
            job.partitions.slice(offset, offset + 5).map((partition) =>
              repository.preview({
                userId: job.userId,
                accountId: partition.accountId,
                sourceRevision: job.sourceRevisions[partition.accountId]!,
                securityRevision: job.securityRevision,
                filters,
                limit: 200,
              }),
            ),
          )),
        );
      }
      if (results.some((result) => result.nextCursor && result.topRows.length < 200))
        return undefined;
      const firstIds = results
        .flatMap((result) => result.topRows)
        .sort(compareFinanceRows)
        .slice(0, 200)
        .map(({ id, accountId, effectiveAt }) => ({ id, accountId, effectiveAt }));
      const complete = results.every((result) => !result.nextCursor);
      if (transactionBrowse && firstIds.length !== 200) return undefined;
      return {
        firstIds,
        examined: addMinorUnits(results.map((result) => result.examined)),
        ...(complete && !transactionBrowse
          ? {
              exact: {
                count: addMinorUnits(results.map((result) => result.matchedCount)),
                totals: sumSpendByCurrency(
                  results.flatMap((result) =>
                    result.totalsByCurrency.map((total) => ({
                      ...total,
                      transactionId: job.id,
                      accountId: '',
                      effectiveAt: job.createdAt,
                    })),
                  ),
                ),
              },
            }
          : {}),
      };
    },
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
    dispatch: options.dispatch ?? dispatchFinanceQueryWorker,
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
            !matchesFinanceFact(fact, filters) ||
            !isFinanceFactBefore(fact, job.before)
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
      if (filters.transactionBrowse && facts.length) {
        const transactions = await scopedRows(
          'transactions',
          facts.map(({ id }) => id),
        );
        for (const fact of facts) {
          const record = transactions.get(fact.id)?.data;
          if (
            !record ||
            record.accountId !== fact.accountId ||
            record.version !== fact.sourceVersion ||
            record.status !== 'active'
          )
            throw new Error('Finance query source changed; restart required.');
          delete fact.originalSourceAccountIds;
          fact.slices = [];
          if (typeof record.paymentType === 'string') fact.paymentType = record.paymentType;
          if (typeof record.reviewState === 'string') fact.reviewState = record.reviewState;
          if (Array.isArray(record.allocations)) {
            fact.classificationNames = [
              ...new Set(
                record.allocations.flatMap((allocation) => {
                  const names = [
                    allocation?.classification?.categoryLabel,
                    allocation?.classification?.subcategoryLabel,
                  ].filter((name): name is string => typeof name === 'string');
                  return names.length ? [names.join(' / ')] : [];
                }),
              ),
            ];
          }
        }
      }
      return facts.sort(compareFinanceRows);
    },
  });
  return Object.assign(service, {
    /** Server caller supplies authenticated identity/revision; request bodies cannot supply authority. */
    async start(userId: string, securityRevision: number, request: unknown, requestId?: string) {
      const { accountIds, filters } = financeQueryStartSchema.parse(request);
      if (!userId || !Number.isSafeInteger(securityRevision) || securityRevision < 0)
        throw new FinanceExperienceFailure('validation', 'Invalid Finance query context.', 'user');
      const current = await currentActor(userId);
      if (!current)
        throw new FinanceExperienceFailure('authorization', 'Finance query access denied.', 'user');
      const accounts = await scopedRows('accounts', accountIds);
      const originalAccounts = new Set<string>();
      const revisions = await sourceSnapshot(
        current.actor,
        accountIds,
        accounts,
        filters.transactionBrowse ? undefined : originalAccounts,
      );
      if (revisions.size !== accountIds.length)
        throw new FinanceExperienceFailure(
          'authorization',
          'Finance query source access or coverage is unavailable.',
          'user',
        );
      if (
        filters.transactionBrowse &&
        !filters.currency &&
        (filters.amount !== undefined ||
          filters.amountMin !== undefined ||
          filters.amountMax !== undefined) &&
        new Set([...accounts.values()].map(({ data }) => data.currency)).size > 1
      )
        throw new SafeApiError(
          400,
          'finance_currency_required',
          'Choose a currency for the amount filter.',
          'validation',
        );
      // Verified account coverage supplies these IDs; never accept a client source
      // vector. Dependencies authorize computation but do not expand selected rows.
      const additional = [...originalAccounts].filter((id) => !revisions.has(id));
      if (revisions.size + additional.length > 100)
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance source account bound exceeded.',
          'user',
        );
      const dependencies = await sourceSnapshot(current.actor, additional);
      if (dependencies.size !== additional.length)
        throw new FinanceExperienceFailure(
          'authorization',
          'Finance original source access or coverage is unavailable.',
          'user',
        );
      for (const [id, revision] of dependencies) revisions.set(id, revision);
      const name = normalizeFinanceText(filters.accountName ?? '');
      const selected = accountIds.filter((id) => {
        if (!name) return true;
        const { friendlyName, sourceName, organizationName } = accounts.get(id)!.data;
        return [friendlyName, sourceName, organizationName].some(
          (value) => typeof value === 'string' && normalizeFinanceText(value).includes(name),
        );
      });
      // Keep the whole requested vector: a name-filtered empty result still depends
      // on those canonical account names, current access and verified coverage.
      return service.create({
        userId,
        securityRevision,
        accountIds: selected,
        sourceRevisions: {
          $authorization: current.fingerprint,
          ...Object.fromEntries(revisions),
        },
        filters,
        ...(requestId === undefined ? {} : { requestId }),
      });
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
