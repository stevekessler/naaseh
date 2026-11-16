import {
  assertFinanceTaskResultAccess,
  financeSyncSourceCollections,
} from './sync-source-guard.js';
import {
  financeAuthorizationPartitions,
  nextFinanceAuthorizationRevision,
} from './authorization-revision.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  createUlid,
  adaptLegacyFinancialTaskLink,
  financeAudience,
  ulidSchema,
  type FinanceScope,
  type SyncChange,
  type Task,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository, financeKeys } from './repository.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { buildTaskTransaction, feedTransactionItems } from '../shared/store.js';
import { prepareAudienceChanges } from '../sync/change-feed-repository.js';
import { FinanceUnitOfWork, financeLocatorKey, type FinanceRecordKey } from './unit-of-work.js';
import { requestFinancePublication } from './publication-dispatch.js';
import { SafeApiError } from '../shared/http.js';
import {
  describeFinanceCanonicalChange,
  financePublicationJournalRecords,
} from './publication-change-journal.js';
import {
  FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION,
  financeBudgetAccountPairKey,
  type FinanceBudgetAccountPairLocator,
} from './budget-account-link-index.js';

const catalog = 'FINANCE#CATALOG';
const partitionFor = (scope: FinanceScope) => `FINANCE#SCOPE#${financeAudience(scope)}`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const collections = [
  'accounts',
  'balanceSnapshots',
  'transactions',
  'transfers',
  'categories',
  'merchants',
  'budgets',
  'budgetAccountLinks',
  'budgetItems',
  'budgetReconciliations',
  'financialTaskLinks',
  'reusableItems',
  'reusableOccurrenceLocks',
  'transactionMatches',
  'reviewIssues',
  'transactionAliases',
  'keptSeparatePairs',
  'categoryNameLocks',
  'merchantKeyLocks',
  'catalogReferenceCounts',
  'csvBatches',
  'csvFileReceipts',
  'csvRowReceipts',
  'sourceIdentities',
  'connections',
  'importJobs',
  'pendingSimplefinAccounts',
  'deletionPreviews',
  'upcomingExpenses',
  'expenseFulfillments',
  'fulfillmentClaimVersions',
  'upcomingPlannedSourceLocks',
] as const;
type Collection = (typeof collections)[number];
type StateRow = {
  PK: string;
  SK: string;
  collection: Collection;
  entryKey: string;
  data: unknown;
  financeSourceAccountIds?: string[];
};
interface ReusableCreateSources {
  id: string;
  groupId: string;
  financeCategoryId: string;
  merchantId?: string | undefined;
  relatedAccountIds: string[];
}
interface BudgetCreateSources {
  id: string;
  groupId: string;
}
interface ManualTransactionCreateSources {
  id: string;
  accountId: string;
  merchantId?: string | undefined;
  financeCategoryIds: string[];
}
interface BudgetAccountLinkCreateSources {
  id: string;
  budgetId: string;
  accountId: string;
}
interface BudgetItemCreateSources {
  id: string;
  budgetId: string;
  expectedBudgetVersion: number;
  financeCategoryId: string;
  merchantId?: string | undefined;
  sourceReusableItemId?: string | undefined;
  currency: string;
  relatedAccountIds: string[];
}
type Writes = NonNullable<TransactWriteCommandInput['TransactItems']>;
const rowId = (row: { PK: string; SK: string }) => `${row.PK}/${row.SK}`;
// CSV batches contain Sets, including the empty Set that DynamoDB cannot marshal natively.
const encode = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      entry instanceof Set ? { financeSet: [...entry] } : entry,
    ),
  );
const decode = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (_key, entry) =>
    entry &&
    typeof entry === 'object' &&
    Object.keys(entry).length === 1 &&
    Array.isArray(entry.financeSet)
      ? new Set(entry.financeSet)
      : entry,
  );

/**
 * Request-local domain state backed by strongly consistent, scope-keyed DynamoDB rows.
 * Scope revisions protect the whole read set, including negative reads and identity locks.
 * No warm Lambda state is authoritative; every successful response follows an atomic commit.
 */
export class DynamoFinanceRepository extends FinanceMemoryRepository {
  /** New experience services load only their touched graph; never invoke forActor for these paths. */
  static targetedUnitOfWork() {
    return new FinanceUnitOfWork();
  }

  /** Trusted restartable migration page; never called as a fallback from a user's read. */
  static async backfillLocatorPage(partition: string, cursor?: { PK: string; SK: string }) {
    if (!/^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(partition) && partition !== catalog)
      throw new Error('Invalid Finance backfill scope.');
    if (cursor && cursor.PK !== partition) throw new Error('Invalid Finance backfill cursor.');
    const work = new FinanceUnitOfWork();
    const scope = await work.get({ PK: partition, SK: 'META' });
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': partition, ':prefix': 'ROW#' },
        ConsistentRead: true,
        Limit: 40,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    const collections = new Set([
      ...Object.values(financeSyncSourceCollections),
      'refundRelationships',
    ]);
    for (const candidate of page.Items ?? []) {
      if (!collections.has(candidate.collection as string)) continue;
      const row = await work.get({ PK: partition, SK: String(candidate.SK) });
      if (row) {
        const key = financeLocatorKey(String(row.collection), String(row.entryKey));
        const storageKey = { PK: partition, SK: String(row.SK) };
        const previous = await work.get(key);
        if (previous && !isDeepStrictEqual(previous.storageKey, storageKey))
          throw new Error(
            'Finance locator conflict. Review duplicate source identifiers before backfill.',
          );
        await work.put({ ...key, storageKey });
      }
    }
    const nextCursor = page.LastEvaluatedKey as { PK: string; SK: string } | undefined;
    return work.commit({
      key: {
        PK: partition,
        SK: `LOCATOR_BACKFILL#${digest(JSON.stringify([cursor, scope?.revision ?? 0]))}`,
      },
      fingerprint: 'finance-locator-v1',
      result: {
        nextCursor: nextCursor ?? null,
        examined: page.ScannedCount ?? page.Items?.length ?? 0,
      },
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
  private readonly versions = new Map<string, number>();
  private readonly scopeMetadata = new Map<string, Record<string, unknown>>();
  private readonly scopesWithRows = new Set<string>();
  private creationIdentity?: { id: string; collection: Collection };
  private baseline = new Map<string, StateRow>();
  private readonly loadedTaskIds = new Set<string>();
  private readonly loadedReceipts = new Set<string>();
  private readonly effects: Array<() => Promise<void>> = [];

  private requestFingerprint: string | undefined;

  static async forActor(
    actor: FinanceActor,
    mutationId?: string,
    requestFingerprint?: string,
    budgetEditId?: string,
    reusableCreate?: ReusableCreateSources,
    budgetCreate?: BudgetCreateSources,
    budgetAccountLinkCreate?: BudgetAccountLinkCreateSources,
    budgetItemCreate?: BudgetItemCreateSources,
    manualTransactionCreate?: ManualTransactionCreateSources,
  ) {
    const repository = new DynamoFinanceRepository();
    if (
      requestFingerprint !== undefined &&
      (!mutationId || !/^[a-f0-9]{64}$/u.test(requestFingerprint))
    )
      throw new Error('Invalid Finance request fingerprint.');
    repository.requestFingerprint = requestFingerprint;
    const partitions = [catalog];
    if (actor.active) {
      partitions.push(partitionFor({ type: 'owner', ownerId: actor.id }));
      for (const { groupId } of actor.groupMemberships)
        partitions.push(partitionFor({ type: 'group', groupId }));
    }
    if (
      [
        budgetEditId,
        reusableCreate,
        budgetCreate,
        budgetAccountLinkCreate,
        budgetItemCreate,
        manualTransactionCreate,
      ].filter((value) => value !== undefined).length > 1
    )
      throw new Error('A Finance replay must select one source loader.');
    if (manualTransactionCreate !== undefined) {
      if (!requestFingerprint)
        throw new Error('Targeted manual transactions require intent evidence.');
      await repository.loadManualTransactionCreate(actor, manualTransactionCreate);
      repository.creationIdentity = { id: manualTransactionCreate.id, collection: 'transactions' };
    } else if (budgetItemCreate !== undefined) {
      if (!requestFingerprint) throw new Error('Targeted budget items require intent evidence.');
      await repository.loadBudgetItemCreate(actor, budgetItemCreate);
      repository.creationIdentity = { id: budgetItemCreate.id, collection: 'budgetItems' };
    } else if (budgetAccountLinkCreate !== undefined) {
      if (!requestFingerprint)
        throw new Error('Targeted budget account linking requires intent evidence.');
      await repository.loadBudgetAccountLinkCreate(actor, budgetAccountLinkCreate);
      repository.creationIdentity = {
        id: budgetAccountLinkCreate.id,
        collection: 'budgetAccountLinks',
      };
    } else if (budgetCreate !== undefined) {
      if (!requestFingerprint)
        throw new Error('Targeted budget creation requires intent evidence.');
      await repository.loadBudgetCreate(actor, budgetCreate);
      repository.creationIdentity = { id: budgetCreate.id, collection: 'budgets' };
    } else if (reusableCreate !== undefined) {
      if (!requestFingerprint)
        throw new Error('Targeted reusable creation requires intent evidence.');
      await repository.loadReusableCreate(actor, reusableCreate);
      repository.creationIdentity = { id: reusableCreate.id, collection: 'reusableItems' };
    } else if (budgetEditId !== undefined) {
      if (!requestFingerprint) throw new Error('Targeted budget edits require intent evidence.');
      await repository.loadBudgetEdit(actor, budgetEditId);
    } else await repository.load([...new Set(partitions)]);
    if (mutationId) {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: financeKeys.mutationReceipt(actor.id, mutationId),
          ConsistentRead: true,
        }),
      );
      const required = result.Item?.requiredPartitions as string[] | undefined;
      const authorization = result.Item?.requiredAuthorizationRevisions as
        | Record<string, unknown>
        | undefined;
      // An earlier receipt may name additional scopes. Verify only their current metadata;
      // never hydrate unrelated history merely to acknowledge a proven saved result.
      if (
        (budgetEditId !== undefined ||
          reusableCreate !== undefined ||
          budgetCreate !== undefined ||
          budgetAccountLinkCreate !== undefined ||
          budgetItemCreate !== undefined ||
          manualTransactionCreate !== undefined) &&
        Array.isArray(required) &&
        required.length <= 256
      ) {
        for (const PK of required) {
          if (partitions.includes(PK) && !repository.versions.has(PK))
            repository.versions.set(PK, await repository.revision(PK));
        }
      }
      // A receipt can contain protected results. Revoked scopes must not survive via replay.
      if (result.Item) {
        if (
          !Array.isArray(required) ||
          !authorization ||
          typeof authorization !== 'object' ||
          Array.isArray(authorization) ||
          new Set(required).size !== required.length ||
          Object.keys(authorization).length !== required.length ||
          required.some(
            (pk) =>
              typeof pk !== 'string' ||
              !repository.versions.has(pk) ||
              !Number.isSafeInteger(authorization[pk]) ||
              Number(authorization[pk]) < 0 ||
              authorization[pk] !==
                (nextFinanceAuthorizationRevision(
                  repository.scopeMetadata.get(pk)?.financeAuthorizationRevision,
                  false,
                ) ?? 0),
          )
        )
          throw new SafeApiError(
            409,
            'finance_mutation_sources_changed',
            'Finance access or records changed. Refresh before reviewing this saved operation.',
            'authorization',
          );
        if (
          requestFingerprint !== undefined &&
          result.Item.requestFingerprint !== requestFingerprint
        )
          throw new SafeApiError(
            409,
            'finance_mutation_intent_changed',
            'This saved Finance operation has different intent. Refresh before reviewing it.',
            'conflict',
          );
        const key = `${actor.id}:${mutationId}`;
        const data = decode(result.Item.data);
        await assertFinanceTaskResultAccess(data, {
          ...actor,
          groupIds: actor.groupMemberships.map(({ groupId }) => groupId),
        });
        repository.mutationReceipts.set(key, data);
        repository.loadedReceipts.add(key);
      }
    }
    return repository;
  }

  /** Manual creation point-loads only its account, exact retry row and authorization revisions. */
  private async loadManualTransactionCreate(
    actor: FinanceActor,
    input: ManualTransactionCreateSources,
  ) {
    const unavailable = () =>
      new SafeApiError(
        503,
        'finance_replay_refresh_required',
        'Finance synchronization needs refreshed source evidence.',
        'dependency_failure',
      );
    const notFound = () =>
      new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
    if (
      !actor.active ||
      ![
        input.id,
        input.accountId,
        ...(input.merchantId ? [input.merchantId] : []),
        ...input.financeCategoryIds,
      ].every((id) => ulidSchema.safeParse(id).success) ||
      input.financeCategoryIds.length > 200 ||
      new Set(input.financeCategoryIds).size !== input.financeCategoryIds.length
    )
      throw unavailable();
    const locator = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeLocatorKey('accounts', input.accountId),
        ConsistentRead: true,
      }),
    );
    const accountLocation = locator.Item?.storageKey as { PK?: unknown; SK?: unknown } | undefined;
    if (
      !accountLocation ||
      typeof accountLocation.PK !== 'string' ||
      accountLocation.SK !== `ROW#accounts#${digest(input.accountId)}`
    )
      throw notFound();
    const PK = accountLocation.PK;
    const locatedScope: FinanceScope | undefined = PK.startsWith('FINANCE#SCOPE#OWNER#')
      ? { type: 'owner', ownerId: PK.slice('FINANCE#SCOPE#OWNER#'.length) }
      : PK.startsWith('FINANCE#SCOPE#GROUP#')
        ? { type: 'group', groupId: PK.slice('FINANCE#SCOPE#GROUP#'.length) }
        : undefined;
    if (!locatedScope || !authorizeFinanceScope(actor, locatedScope, 'edit').allowed)
      throw notFound();
    const revision = await this.revision(PK);
    const accountRow = await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: accountLocation, ConsistentRead: true }),
    );
    if (!accountRow.Item) throw notFound();
    const row = accountRow.Item as StateRow;
    const account = decode(row.data) as import('@naaseh/domain').FinancialAccount;
    if (
      row.collection !== 'accounts' ||
      row.entryKey !== input.accountId ||
      account.id !== input.accountId ||
      partitionFor(account.scope) !== PK ||
      !authorizeFinanceScope(actor, account.scope, 'edit').allowed ||
      !['active', 'attention'].includes(account.status)
    )
      throw notFound();
    this.accounts.set(account.id, account);
    this.baseline.set(rowId(row), row);
    this.scopesWithRows.add(PK);

    const catalogReferences: Array<['categories' | 'merchants', string, string]> = [
      ...input.financeCategoryIds.map(
        (id) => ['categories', id, `category:${id}`] as ['categories', string, string],
      ),
      ...(input.merchantId
        ? [
            ['merchants', input.merchantId, `merchant:${input.merchantId}`] as [
              'merchants',
              string,
              string,
            ],
          ]
        : []),
    ];
    const catalogRevision = catalogReferences.length ? await this.revision(catalog) : undefined;
    for (const [collection, id, counterId] of catalogReferences) {
      const sourceResult = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: catalog, SK: `ROW#${collection}#${digest(id)}` },
          ConsistentRead: true,
        }),
      );
      if (!sourceResult.Item) throw notFound();
      const source = sourceResult.Item as StateRow;
      const data = decode(source.data) as Record<string, unknown>;
      if (
        source.collection !== collection ||
        source.entryKey !== id ||
        !data ||
        data.id !== id ||
        data.status !== 'active'
      )
        throw unavailable();
      this.baseline.set(rowId(source), source);
      this.scopesWithRows.add(catalog);
      if (collection === 'categories')
        this.categories.set(id, data as unknown as import('@naaseh/domain').FinanceCategory);
      else this.merchants.set(id, data as unknown as import('@naaseh/domain').FinanceMerchant);
      const counterResult = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: catalog, SK: `ROW#catalogReferenceCounts#${digest(counterId)}` },
          ConsistentRead: true,
        }),
      );
      if (counterResult.Item) {
        const counter = counterResult.Item as StateRow;
        if (
          counter.collection !== 'catalogReferenceCounts' ||
          counter.entryKey !== counterId ||
          !Number.isSafeInteger(counter.data) ||
          Number(counter.data) < 0
        )
          throw unavailable();
        this.baseline.set(rowId(counter), counter);
        this.catalogReferenceCounts.set(counterId, Number(counter.data));
      }
    }

    const transactionLocator = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeLocatorKey('transactions', input.id),
        ConsistentRead: true,
      }),
    );
    const expected = { PK, SK: `ROW#transactions#${digest(input.id)}` };
    const location = transactionLocator.Item?.storageKey as
      | { PK?: unknown; SK?: unknown }
      | undefined;
    if (location && (location.PK !== expected.PK || location.SK !== expected.SK)) throw notFound();
    const existing = await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: expected, ConsistentRead: true }),
    );
    if (location && !existing.Item) throw notFound();
    if (existing.Item) {
      if (!location) throw unavailable();
      const transactionRow = existing.Item as StateRow;
      const transaction = decode(
        transactionRow.data,
      ) as import('@naaseh/domain').FinancialTransaction;
      if (
        transactionRow.collection !== 'transactions' ||
        transactionRow.entryKey !== input.id ||
        transaction.id !== input.id ||
        transaction.accountId !== input.accountId
      )
        throw unavailable();
      this.transactions.push(transaction);
      this.baseline.set(rowId(transactionRow), transactionRow);
    }
    if (
      (await this.revision(PK)) !== revision ||
      (catalogRevision !== undefined && (await this.revision(catalog)) !== catalogRevision)
    )
      throw unavailable();
    this.versions.set(PK, revision);
    if (catalogRevision !== undefined) this.versions.set(catalog, catalogRevision);
  }

  /** Budget header edits need no catalog, account graph or transaction history. */
  private async loadBudgetEdit(actor: FinanceActor, budgetId: string) {
    const unavailable = () =>
      new SafeApiError(
        503,
        'finance_replay_refresh_required',
        'Finance synchronization needs refreshed source evidence.',
        'dependency_failure',
      );
    const notFound = () =>
      new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
    if (!actor.active) throw notFound();
    const locator = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeLocatorKey('budgets', budgetId),
        ConsistentRead: true,
      }),
    );
    const key = locator.Item?.storageKey as { PK?: unknown; SK?: unknown } | undefined;
    if (!key) throw unavailable(); // Missing migration evidence must not trigger a scope scan.
    if (typeof key.PK !== 'string' || key.SK !== `ROW#budgets#${digest(budgetId)}`)
      throw unavailable();
    const groupId = /^FINANCE#SCOPE#GROUP#([^#]+)$/u.exec(key.PK)?.[1];
    if (!groupId || !actor.groupMemberships.some((membership) => membership.groupId === groupId))
      throw notFound(); // Authorize the locator's scope before reading its metadata or body.
    const PK = key.PK;
    const revision = await this.revision(PK);
    const result = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK, SK: String(key.SK) },
        ConsistentRead: true,
      }),
    );
    if (!result.Item) throw notFound();
    const row = result.Item as StateRow;
    const value = decode(row.data) as Record<string, unknown>;
    if (
      row.PK !== PK ||
      row.SK !== key.SK ||
      row.collection !== 'budgets' ||
      row.entryKey !== budgetId ||
      !value ||
      value.id !== budgetId ||
      value.groupId !== groupId ||
      !Number.isSafeInteger(value.version) ||
      Number(value.version) < 1
    )
      throw unavailable();
    if ((await this.revision(PK)) !== revision) throw unavailable();
    this.versions.set(PK, revision);
    this.scopesWithRows.add(PK);
    this.baseline.set(rowId(row), row);
    this.budgets.set(budgetId, value as unknown as import('@naaseh/domain').Budget);
  }

  /** Account linking reads two named parents, one pair singleton and an optional exact retry row. */
  private async loadBudgetAccountLinkCreate(
    actor: FinanceActor,
    input: BudgetAccountLinkCreateSources,
  ) {
    const unavailable = () =>
      new SafeApiError(
        503,
        'finance_replay_refresh_required',
        'Finance synchronization needs refreshed source evidence.',
        'dependency_failure',
      );
    const notFound = () =>
      new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
    if (
      !actor.active ||
      ![input.id, input.budgetId, input.accountId].every((id) => ulidSchema.safeParse(id).success)
    )
      throw notFound();
    const locate = async (collection: Collection, id: string) => {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: financeLocatorKey(collection, id),
          ConsistentRead: true,
        }),
      );
      const storageKey = result.Item?.storageKey as { PK?: unknown; SK?: unknown } | undefined;
      if (
        !storageKey ||
        typeof storageKey.PK !== 'string' ||
        storageKey.SK !== `ROW#${collection}#${digest(id)}`
      )
        throw unavailable();
      return { PK: storageKey.PK, SK: String(storageKey.SK) };
    };
    const budgetKey = await locate('budgets', input.budgetId);
    const groupId = /^FINANCE#SCOPE#GROUP#([^#]+)$/u.exec(budgetKey.PK)?.[1];
    if (!groupId || !authorizeFinanceScope(actor, { type: 'group', groupId }, 'edit').allowed)
      throw notFound();
    const accountKey = await locate('accounts', input.accountId);
    const accountScope: FinanceScope | undefined = accountKey.PK.startsWith('FINANCE#SCOPE#OWNER#')
      ? {
          type: 'owner',
          ownerId: accountKey.PK.slice('FINANCE#SCOPE#OWNER#'.length),
        }
      : accountKey.PK.startsWith('FINANCE#SCOPE#GROUP#')
        ? {
            type: 'group',
            groupId: accountKey.PK.slice('FINANCE#SCOPE#GROUP#'.length),
          }
        : undefined;
    if (
      !accountScope ||
      !authorizeFinanceScope(actor, accountScope, 'read').allowed ||
      (accountScope.type === 'group' && accountScope.groupId !== groupId)
    )
      throw notFound(); // Authorize both locator scopes before reading either protected body.
    const partitions = [...new Set([budgetKey.PK, accountKey.PK])];
    for (const PK of partitions) {
      const revision = await this.revision(PK);
      if (!Number.isSafeInteger(revision) || revision < 1) throw unavailable();
      this.versions.set(PK, revision);
    }
    if (
      this.scopeMetadata.get(budgetKey.PK)?.budgetAccountLinkIndexVersion !==
      FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION
    )
      throw unavailable();
    const read = async (key: { PK: string; SK: string }) => {
      const result = await dynamodb.send(
        new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
      );
      return result.Item as StateRow | undefined;
    };
    const retain = <T>(
      row: StateRow,
      collection: Collection,
      id: string,
      target: Map<string, T>,
    ) => {
      if (
        row.PK === undefined ||
        row.SK !== `ROW#${collection}#${digest(id)}` ||
        row.collection !== collection ||
        row.entryKey !== id ||
        row.data === undefined
      )
        throw unavailable();
      const value = decode(row.data) as T;
      target.set(id, value);
      this.baseline.set(rowId(row), row);
      this.scopesWithRows.add(row.PK);
      return value;
    };
    const budgetRow = await read(budgetKey);
    const accountRow = await read(accountKey);
    if (!budgetRow || !accountRow) throw notFound();
    const budget = retain(budgetRow, 'budgets', input.budgetId, this.budgets);
    const account = retain(accountRow, 'accounts', input.accountId, this.accounts);
    if (
      (budget as import('@naaseh/domain').Budget).groupId !== groupId ||
      (account as import('@naaseh/domain').FinancialAccount).scope.type !== accountScope.type ||
      financeAudience((account as import('@naaseh/domain').FinancialAccount).scope) !==
        financeAudience(accountScope)
    )
      throw unavailable();
    const pairResult = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeBudgetAccountPairKey(input.budgetId, input.accountId),
        ConsistentRead: true,
      }),
    );
    const pair = pairResult.Item as FinanceBudgetAccountPairLocator | undefined;
    const linkLocator = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeLocatorKey('budgetAccountLinks', input.id),
        ConsistentRead: true,
      }),
    );
    const requestedLocation = linkLocator.Item?.storageKey as
      | { PK?: unknown; SK?: unknown }
      | undefined;
    if (
      requestedLocation &&
      (requestedLocation.PK !== budgetKey.PK ||
        requestedLocation.SK !== `ROW#budgetAccountLinks#${digest(input.id)}`)
    )
      throw notFound();
    const requestedKey = {
      PK: budgetKey.PK,
      SK: `ROW#budgetAccountLinks#${digest(input.id)}`,
    };
    const requestedRow = await read(requestedKey);
    if (requestedRow && !requestedLocation) throw unavailable();
    if (requestedLocation && !requestedRow) throw unavailable();
    const loadLink = async (linkId: string, key: FinanceRecordKey) => {
      if (key.PK !== budgetKey.PK || key.SK !== `ROW#budgetAccountLinks#${digest(linkId)}`)
        throw unavailable();
      const row = await read(key);
      if (!row) throw unavailable();
      const link = retain(row, 'budgetAccountLinks', linkId, this.budgetAccountLinks);
      const value = link as import('@naaseh/domain').BudgetAccountLink;
      if (
        value.id !== linkId ||
        value.budgetId !== input.budgetId ||
        value.accountId !== input.accountId ||
        value.status !== 'active'
      )
        throw unavailable();
    };
    if (requestedLocation) await loadLink(input.id, requestedKey);
    if (pair) {
      if (
        pair.PK !== financeBudgetAccountPairKey(input.budgetId, input.accountId).PK ||
        pair.SK !== 'ACTIVE' ||
        !ulidSchema.safeParse(pair.linkId).success ||
        !pair.storageKey
      )
        throw unavailable();
      if (!this.budgetAccountLinks.has(pair.linkId)) await loadLink(pair.linkId, pair.storageKey);
    }
    for (const [PK, revision] of this.versions)
      if ((await this.revision(PK)) !== revision) throw unavailable();
  }

  /** Budget-item creation point-loads its parent, references and active account links. */
  private async loadBudgetItemCreate(actor: FinanceActor, input: BudgetItemCreateSources) {
    const unavailable = () =>
      new SafeApiError(
        503,
        'finance_replay_refresh_required',
        'Finance synchronization needs refreshed source evidence.',
        'dependency_failure',
      );
    const notFound = () =>
      new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
    const ids = [
      input.id,
      input.budgetId,
      input.financeCategoryId,
      ...(input.merchantId ? [input.merchantId] : []),
      ...(input.sourceReusableItemId ? [input.sourceReusableItemId] : []),
      ...input.relatedAccountIds,
    ];
    if (
      !actor.active ||
      ids.some((id) => !ulidSchema.safeParse(id).success) ||
      input.relatedAccountIds.length > 50 ||
      new Set(input.relatedAccountIds).size !== input.relatedAccountIds.length
    )
      throw notFound();
    const locate = async (collection: Collection, id: string, required = true) => {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: financeLocatorKey(collection, id),
          ConsistentRead: true,
        }),
      );
      const storageKey = result.Item?.storageKey as { PK?: unknown; SK?: unknown } | undefined;
      if (!storageKey) {
        if (required) throw unavailable();
        return undefined;
      }
      if (typeof storageKey.PK !== 'string' || storageKey.SK !== `ROW#${collection}#${digest(id)}`)
        throw unavailable();
      return { PK: storageKey.PK, SK: String(storageKey.SK) };
    };
    const budgetKey = await locate('budgets', input.budgetId);
    const groupId = /^FINANCE#SCOPE#GROUP#([^#]+)$/u.exec(budgetKey!.PK)?.[1];
    if (!groupId || !authorizeFinanceScope(actor, { type: 'group', groupId }, 'edit').allowed)
      throw notFound();
    const accountKeys = new Map<string, FinanceRecordKey>();
    for (const accountId of input.relatedAccountIds) {
      const key = (await locate('accounts', accountId))!;
      const scope: FinanceScope | undefined = key.PK.startsWith('FINANCE#SCOPE#OWNER#')
        ? { type: 'owner', ownerId: key.PK.slice('FINANCE#SCOPE#OWNER#'.length) }
        : key.PK.startsWith('FINANCE#SCOPE#GROUP#')
          ? { type: 'group', groupId: key.PK.slice('FINANCE#SCOPE#GROUP#'.length) }
          : undefined;
      if (
        !scope ||
        !authorizeFinanceScope(actor, scope, 'read').allowed ||
        (scope.type === 'group' && scope.groupId !== groupId)
      )
        throw notFound();
      accountKeys.set(accountId, key);
    }
    const partitions = [
      ...new Set([budgetKey!.PK, ...[...accountKeys.values()].map(({ PK }) => PK)]),
    ];
    for (const PK of [...partitions, catalog]) {
      const revision = await this.revision(PK);
      if (PK !== catalog && (!Number.isSafeInteger(revision) || revision < 1)) throw unavailable();
      this.versions.set(PK, revision);
    }
    if (
      this.scopeMetadata.get(budgetKey!.PK)?.budgetAccountLinkIndexVersion !==
      FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION
    )
      throw unavailable();
    const read = async (key: FinanceRecordKey) => {
      const result = await dynamodb.send(
        new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
      );
      return result.Item as StateRow | undefined;
    };
    const retain = <T>(
      row: StateRow,
      collection: Collection,
      id: string,
      target: Map<string, T>,
    ) => {
      if (
        row.SK !== `ROW#${collection}#${digest(id)}` ||
        row.collection !== collection ||
        row.entryKey !== id ||
        row.data === undefined
      )
        throw unavailable();
      const value = decode(row.data) as T;
      target.set(id, value);
      this.baseline.set(rowId(row), row);
      this.scopesWithRows.add(row.PK);
      return value;
    };
    const budgetRow = await read(budgetKey!);
    if (!budgetRow) throw notFound();
    const budget = retain(budgetRow, 'budgets', input.budgetId, this.budgets);
    if ((budget as import('@naaseh/domain').Budget).groupId !== groupId) throw unavailable();

    const existingKey = await locate('budgetItems', input.id, false);
    if (existingKey && existingKey.PK !== budgetKey!.PK) throw notFound();
    const expectedItemKey = { PK: budgetKey!.PK, SK: `ROW#budgetItems#${digest(input.id)}` };
    const existingRow = await read(expectedItemKey);
    if (Boolean(existingKey) !== Boolean(existingRow)) throw unavailable();
    if (existingRow) retain(existingRow, 'budgetItems', input.id, this.budgetItems);

    for (const [accountId, key] of accountKeys) {
      const row = await read(key);
      if (!row) throw notFound();
      const account = retain(row, 'accounts', accountId, this.accounts);
      if ((account as import('@naaseh/domain').FinancialAccount).currency !== input.currency)
        throw notFound();
      const pairResult = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: financeBudgetAccountPairKey(input.budgetId, accountId),
          ConsistentRead: true,
        }),
      );
      const pair = pairResult.Item as FinanceBudgetAccountPairLocator | undefined;
      if (
        !pair ||
        !ulidSchema.safeParse(pair.linkId).success ||
        !pair.storageKey ||
        pair.storageKey.PK !== budgetKey!.PK ||
        pair.storageKey.SK !== `ROW#budgetAccountLinks#${digest(pair.linkId)}`
      )
        throw notFound();
      const linkRow = await read(pair.storageKey);
      if (!linkRow) throw unavailable();
      const link = retain(linkRow, 'budgetAccountLinks', pair.linkId, this.budgetAccountLinks);
      const value = link as import('@naaseh/domain').BudgetAccountLink;
      if (
        value.budgetId !== input.budgetId ||
        value.accountId !== accountId ||
        value.status !== 'active'
      )
        throw unavailable();
    }

    const references: Array<['categories' | 'merchants', string, string]> = [
      ['categories', input.financeCategoryId, `category:${input.financeCategoryId}`],
      ...(input.merchantId
        ? [
            ['merchants', input.merchantId, `merchant:${input.merchantId}`] as [
              'merchants',
              string,
              string,
            ],
          ]
        : []),
    ];
    for (const [collection, id, counter] of references) {
      const row = await read({ PK: catalog, SK: `ROW#${collection}#${digest(id)}` });
      if (!row) throw notFound();
      const value =
        collection === 'categories'
          ? retain(row, collection, id, this.categories)
          : retain(row, collection, id, this.merchants);
      if (value.status !== 'active') throw notFound();
      const count = await read({
        PK: catalog,
        SK: `ROW#catalogReferenceCounts#${digest(counter)}`,
      });
      if (count) {
        if (!Number.isSafeInteger(count.data) || Number(count.data) < 0) throw unavailable();
        retain(count, 'catalogReferenceCounts', counter, this.catalogReferenceCounts);
      }
    }
    if (input.sourceReusableItemId) {
      const key = await locate('reusableItems', input.sourceReusableItemId);
      if (key!.PK !== budgetKey!.PK) throw notFound();
      const row = await read(key!);
      if (!row) throw notFound();
      const reusable = retain(row, 'reusableItems', input.sourceReusableItemId, this.reusableItems);
      if ((reusable as { status?: unknown }).status !== 'active') throw notFound();
    }
    for (const [PK, revision] of this.versions)
      if ((await this.revision(PK)) !== revision) throw unavailable();
  }

  /** Budget creation reads only the named group scope and an optional exact retry row. */
  private async loadBudgetCreate(actor: FinanceActor, input: BudgetCreateSources) {
    const unavailable = () =>
      new SafeApiError(
        503,
        'finance_replay_refresh_required',
        'Finance synchronization needs refreshed source evidence.',
        'dependency_failure',
      );
    const notFound = () =>
      new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
    if (
      !actor.active ||
      !ulidSchema.safeParse(input.id).success ||
      !ulidSchema.safeParse(input.groupId).success ||
      !authorizeFinanceScope(actor, { type: 'group', groupId: input.groupId }, 'edit').allowed
    )
      throw notFound();
    const PK = partitionFor({ type: 'group', groupId: input.groupId });
    const revision = await this.revision(PK);
    const locator = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeLocatorKey('budgets', input.id),
        ConsistentRead: true,
      }),
    );
    const expected = { PK, SK: `ROW#budgets#${digest(input.id)}` };
    const location = locator.Item?.storageKey as { PK?: unknown; SK?: unknown } | undefined;
    if (location && (location.PK !== expected.PK || location.SK !== expected.SK)) throw notFound();
    const result = await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: expected, ConsistentRead: true }),
    );
    if (location && !result.Item) throw notFound();
    if (result.Item) {
      if (!location) throw unavailable();
      const row = result.Item as StateRow;
      const value = decode(row.data) as Record<string, unknown>;
      if (
        row.PK !== expected.PK ||
        row.SK !== expected.SK ||
        row.collection !== 'budgets' ||
        row.entryKey !== input.id ||
        !value ||
        value.id !== input.id ||
        value.groupId !== input.groupId ||
        !Number.isSafeInteger(value.version) ||
        Number(value.version) < 1
      )
        throw unavailable();
      this.baseline.set(rowId(row), row);
      this.scopesWithRows.add(PK);
      this.budgets.set(input.id, value as unknown as import('@naaseh/domain').Budget);
    }
    if (revision === 0 && !result.Item) {
      const witness = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': PK },
          ProjectionExpression: 'PK, SK',
          Limit: 1,
          ConsistentRead: true,
        }),
      );
      if (witness.Items?.length || Object.keys(witness.LastEvaluatedKey ?? {}).length)
        throw unavailable();
    }
    if ((await this.revision(PK)) !== revision) throw unavailable();
    this.versions.set(PK, revision);
  }

  /** Creation reads only the named group, existing parents and their reference counters. */
  private async loadReusableCreate(actor: FinanceActor, input: ReusableCreateSources) {
    const unavailable = () =>
      new SafeApiError(
        503,
        'finance_replay_refresh_required',
        'Finance synchronization needs refreshed source evidence.',
        'dependency_failure',
      );
    const notFound = () =>
      new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
    if (!authorizeFinanceScope(actor, { type: 'group', groupId: input.groupId }, 'edit').allowed)
      throw notFound();
    if (
      ![
        input.id,
        input.groupId,
        input.financeCategoryId,
        ...(input.merchantId ? [input.merchantId] : []),
        ...input.relatedAccountIds,
      ].every((id) => ulidSchema.safeParse(id).success) ||
      input.relatedAccountIds.length > 50 ||
      new Set(input.relatedAccountIds).size !== input.relatedAccountIds.length
    )
      throw unavailable();
    const PK = partitionFor({ type: 'group', groupId: input.groupId });
    const groupRevision = await this.revision(PK);
    const catalogRevision = await this.revision(catalog);
    const locate = async (collection: string, id: string, required: boolean) => {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: financeLocatorKey(collection, id),
          ConsistentRead: true,
        }),
      );
      if (!result.Item) {
        if (required) throw unavailable();
        return false;
      }
      const key = result.Item.storageKey as { PK?: unknown; SK?: unknown } | undefined;
      if (!key || typeof key.PK !== 'string' || key.SK !== `ROW#${collection}#${digest(id)}`)
        throw unavailable();
      if (key.PK !== PK) throw notFound(); // Never read a foreign locator's scope metadata/body.
      return true;
    };
    const row = async (collection: Collection, id: string, scope: string) => {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: scope, SK: `ROW#${collection}#${digest(id)}` },
          ConsistentRead: true,
        }),
      );
      if (!result.Item) return undefined;
      const value = result.Item as StateRow;
      if (
        value.PK !== scope ||
        value.SK !== `ROW#${collection}#${digest(id)}` ||
        value.collection !== collection ||
        value.entryKey !== id ||
        value.data === undefined
      )
        throw unavailable();
      return value;
    };
    const retain = <T>(value: StateRow, target: Map<string, T>) => {
      const data = decode(value.data) as T;
      target.set(value.entryKey, data);
      this.baseline.set(rowId(value), value);
      this.scopesWithRows.add(value.PK);
      return data;
    };
    const object = (value: StateRow, id: string) => {
      const data = decode(value.data) as Record<string, unknown>;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== id)
        throw unavailable();
      return data;
    };
    const existingLocator = await locate('reusableItems', input.id, false);
    const existing = await row('reusableItems', input.id, PK);
    if (existingLocator && !existing) throw notFound();
    if (existing) {
      if (!existingLocator) throw unavailable();
      const data = object(existing, input.id);
      if (
        data.groupId !== input.groupId ||
        !Number.isSafeInteger(data.version) ||
        Number(data.version) < 1
      )
        throw unavailable();
      retain(existing, this.reusableItems);
    }
    for (const id of input.relatedAccountIds) {
      await locate('accounts', id, true);
      const account = await row('accounts', id, PK);
      if (!account) throw notFound();
      const data = object(account, id);
      const scope = data.scope as FinanceScope | undefined;
      if (!scope || scope.type !== 'group' || scope.groupId !== input.groupId) throw notFound();
      retain(account, this.accounts);
    }
    const references: Array<['categories' | 'merchants', string, string]> = [
      ['categories', input.financeCategoryId, `category:${input.financeCategoryId}`],
      ...(input.merchantId
        ? [
            ['merchants', input.merchantId, `merchant:${input.merchantId}`] as [
              'merchants',
              string,
              string,
            ],
          ]
        : []),
    ];
    for (const [collection, id, counter] of references) {
      const source = await row(collection, id, catalog);
      if (!source) throw notFound();
      const data = object(source, id);
      if (data.status !== 'active') throw notFound();
      if (collection === 'categories') retain(source, this.categories);
      else retain(source, this.merchants);
      const count = await row('catalogReferenceCounts', counter, catalog);
      if (count) {
        if (!Number.isSafeInteger(count.data) || Number(count.data) < 0) throw unavailable();
        retain(count, this.catalogReferenceCounts);
      }
    }
    if (groupRevision === 0) {
      if (this.scopesWithRows.has(PK)) throw unavailable();
      // Missing META is not a new-scope proof: canonical rows or surviving
      // publication state require trusted repair. Inspect one key only; a
      // genuinely empty namespace is fenced by conditional META creation.
      const witness = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': PK },
          ProjectionExpression: 'PK, SK',
          Limit: 1,
          ConsistentRead: true,
        }),
      );
      if (witness.Items?.length || Object.keys(witness.LastEvaluatedKey ?? {}).length)
        throw unavailable();
    }
    if (
      (await this.revision(PK)) !== groupRevision ||
      (await this.revision(catalog)) !== catalogRevision
    )
      throw unavailable();
    this.versions.set(PK, groupRevision);
    this.versions.set(catalog, catalogRevision);
  }

  static async forConnection(connectionId: string) {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeKeys.connection(connectionId),
        ConsistentRead: true,
      }),
    );
    const scope = result.Item?.scope as FinanceScope | undefined;
    if (!scope) throw new Error('Finance connection not found.');
    const repository = new DynamoFinanceRepository();
    await repository.load([
      ...new Set([
        catalog,
        partitionFor(scope),
        ...((result.Item?.accountPartitions ?? []) as string[]),
      ]),
    ]);
    if (!repository.connections.has(connectionId)) throw new Error('Finance connection not found.');
    return repository;
  }

  private async revision(PK: string) {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK, SK: 'META' },
        ConsistentRead: true,
      }),
    );
    this.scopeMetadata.set(PK, { ...(result.Item ?? {}) });
    return Number(result.Item?.revision ?? 0);
  }

  /** Point-loads the ordinary task named by an explicit task-link route. */
  async loadTaskForFinanceLink(taskId: string) {
    ulidSchema.parse(taskId);
    if (this.loadedTaskIds.has(taskId)) return;
    const task = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `TASK#${taskId}`, SK: 'CURRENT' },
        ConsistentRead: true,
      }),
    );
    if (task.Item?.data) this.tasks.set(taskId, task.Item.data as Task);
    this.loadedTaskIds.add(taskId);
  }

  /** Private dependency evidence for the explicitly supported REST snapshot routes. */
  cacheAuthorizationScopes() {
    return [...this.versions.keys()].flatMap((PK) => {
      const meta = this.scopeMetadata.get(PK);
      if (!meta?.PK && !this.scopesWithRows.has(PK) && PK !== catalog) return [];
      const authorizationRevision =
        meta?.financeAuthorizationRevision === undefined ? 0 : meta.financeAuthorizationRevision;
      if (
        (!meta?.PK && PK !== catalog) ||
        !Number.isSafeInteger(authorizationRevision) ||
        Number(authorizationRevision) < 0
      )
        throw new Error('Finance snapshot source evidence is unavailable.');
      return [{ PK, authorizationRevision: Number(authorizationRevision) }];
    });
  }

  /** Recheck the loaded snapshot with point reads before releasing its response. */
  async assertReadCurrent() {
    for (const [PK, expected] of this.versions) {
      if ((await this.revision(PK)) !== expected)
        throw new Error('Finance storage version conflict.');
    }
  }

  private async load(partitions: string[]) {
    for (const PK of partitions) {
      const revision = await this.revision(PK);
      let cursor: Record<string, unknown> | undefined;
      do {
        const page = await dynamodb.send(
          new QueryCommand({
            TableName: tableName,
            ConsistentRead: true,
            Limit: 200,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :row)',
            ExpressionAttributeValues: { ':pk': PK, ':row': 'ROW#' },
            ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          }),
        );
        if (page.Items?.length) this.scopesWithRows.add(PK);
        for (const item of page.Items ?? []) {
          const row = item as StateRow;
          // New server-only relationships are retained, but never hydrated into legacy DTOs.
          if ((row.collection as string) === 'refundRelationships') continue;
          if (!collections.includes(row.collection))
            throw new Error('Invalid Finance storage row.');
          this.baseline.set(rowId(row), row);
          if (
            row.collection === 'budgetReconciliations' &&
            row.financeSourceAccountIds !== undefined
          ) {
            if (
              !Array.isArray(row.financeSourceAccountIds) ||
              !row.financeSourceAccountIds.length ||
              row.financeSourceAccountIds.length > 1000 ||
              row.financeSourceAccountIds.some(
                (id) => typeof id !== 'string' || !id || id.length > 256,
              ) ||
              new Set(row.financeSourceAccountIds).size !== row.financeSourceAccountIds.length
            )
              throw new Error('Invalid Finance reconciliation source evidence.');
            this.reconciliationAccountSources.set(row.entryKey, [...row.financeSourceAccountIds]);
          }
          const target = this[row.collection] as Map<string, unknown> | unknown[] | Set<string>;
          const decoded = decode(row.data);
          const value =
            row.collection === 'financialTaskLinks'
              ? adaptLegacyFinancialTaskLink(decoded as import('@naaseh/domain').FinancialTaskLink)
              : decoded;
          if (target instanceof Map) target.set(row.entryKey, value);
          else if (target instanceof Set) target.add(row.entryKey);
          else target.push(value);
        }
        cursor = page.LastEvaluatedKey;
      } while (cursor);
      if ((await this.revision(PK)) !== revision)
        throw new Error('Finance storage version conflict.');
      this.versions.set(PK, revision);
    }
    for (const { taskId } of this.financialTaskLinks.values()) {
      if (this.loadedTaskIds.has(taskId)) continue;
      const task = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `TASK#${taskId}`, SK: 'CURRENT' },
          ConsistentRead: true,
        }),
      );
      if (task.Item?.data) this.tasks.set(taskId, task.Item.data);
      this.loadedTaskIds.add(taskId);
    }
  }

  private scopeFor(collection: Collection, key: string, value: unknown): string | undefined {
    if (
      [
        'categories',
        'merchants',
        'categoryNameLocks',
        'merchantKeyLocks',
        'catalogReferenceCounts',
      ].includes(collection)
    )
      return catalog;
    const data = value as Record<string, unknown> | undefined;
    if (
      collection === 'financialTaskLinks' &&
      typeof data?.financeAudience === 'string' &&
      /^(?:OWNER|GROUP)#[^#]+$/u.test(data.financeAudience)
    )
      return `FINANCE#SCOPE#${data.financeAudience}`;
    if (data?.scope) return partitionFor(data.scope as FinanceScope);
    if (typeof data?.groupId === 'string')
      return partitionFor({ type: 'group', groupId: data.groupId });
    if (collection === 'budgetAccountLinks' && typeof data?.budgetId === 'string') {
      const budget = this.budgets.get(data.budgetId);
      if (budget) return partitionFor({ type: 'group', groupId: budget.groupId });
    }
    if (typeof data?.accountId === 'string') {
      const scope = this.accounts.get(data.accountId)?.scope;
      if (scope) return partitionFor(scope);
    }
    if (typeof data?.budgetId === 'string') {
      const budget = this.budgets.get(data.budgetId);
      if (budget) return partitionFor({ type: 'group', groupId: budget.groupId });
    }
    if (typeof data?.connectionId === 'string') {
      const scope = this.connections.get(data.connectionId)?.scope as FinanceScope | undefined;
      if (scope) return partitionFor(scope);
    }
    if (typeof data?.transactionId === 'string') {
      const transaction = this.transactions.find(({ id }) => id === data.transactionId);
      if (transaction) return this.scopeFor('transactions', transaction.id, transaction);
    }
    if (['csvFileReceipts', 'csvRowReceipts'].includes(collection)) {
      const account = [...this.accounts.values()].find(({ id }) => key.startsWith(`${id}:`));
      if (account) return partitionFor(account.scope);
    }
    if (collection === 'pendingSimplefinAccounts') {
      const connection = [...this.connections].find(([id]) => key.startsWith(`${id}:`))?.[1];
      if (connection?.scope) return partitionFor(connection.scope as FinanceScope);
    }
    if (collection === 'reusableOccurrenceLocks') {
      const item = this.budgetItems.get(String(value));
      if (item) return this.scopeFor('budgetItems', item.id, item);
    }
    if (collection === 'fulfillmentClaimVersions') {
      const transaction = this.transactions.find(({ id }) => id === key);
      if (transaction) return this.scopeFor('transactions', transaction.id, transaction);
    }
    if (collection === 'upcomingPlannedSourceLocks') {
      const expense = this.upcomingExpenses.get(String(value));
      if (expense) return this.scopeFor('upcomingExpenses', expense.id, expense);
    }
    if (
      collection === 'sourceIdentities' ||
      collection === 'transactionAliases' ||
      collection === 'keptSeparatePairs'
    ) {
      const account = this.accounts.get(String(value));
      if (account) return partitionFor(account.scope);
      const transaction = this.transactions.find(
        ({ id }) => id === value || id === key || key.startsWith(`${id}:`),
      );
      if (transaction) return this.scopeFor('transactions', transaction.id, transaction);
    }
    if (collection === 'deletionPreviews' && data) {
      const id = String(data.recordId);
      if (data.recordType === 'category' || data.recordType === 'merchant') return catalog;
      const entity =
        this.accounts.get(id) ??
        this.budgets.get(id) ??
        this.reusableItems.get(id) ??
        this.transactionMatches.get(id) ??
        this.financialTaskLinks.get(id) ??
        this.transactions.find((entry) => entry.id === id);
      if (entity) return this.scopeFor('accounts', id, entity);
    }
    return undefined;
  }

  private snapshot() {
    const previous = new Map(
      [...this.baseline.values()].map((row) => [`${row.collection}/${row.entryKey}`, row.PK]),
    );
    const rows = new Map<string, StateRow>();
    for (const collection of collections) {
      const source = this[collection];
      const entries: Array<[string, unknown]> =
        source instanceof Map
          ? [...source]
          : source instanceof Set
            ? [...source].map((key) => [key, true])
            : source.map((value) => [value.id, value]);
      for (const [entryKey, value] of entries) {
        const PK =
          this.scopeFor(collection, entryKey, value) ?? previous.get(`${collection}/${entryKey}`);
        if (!PK || !this.versions.has(PK)) throw new Error('Finance storage scope is unavailable.');
        const row = {
          PK,
          SK: `ROW#${collection}#${digest(entryKey)}`,
          collection,
          entryKey,
          data: encode(value),
          ...(collection === 'budgetReconciliations' &&
          this.reconciliationAccountSources.has(entryKey)
            ? { financeSourceAccountIds: [...this.reconciliationAccountSources.get(entryKey)!] }
            : {}),
        };
        rows.set(rowId(row), row);
      }
    }
    return rows;
  }

  override async afterCommit(effect: () => Promise<void>) {
    this.effects.push(effect);
  }

  async commit() {
    await this.checkpoint();
    for (const effect of this.effects) await effect();
    this.effects.length = 0;
  }

  override async checkpoint() {
    let next = this.snapshot();
    this.updateCatalogReferences(next);
    next = this.snapshot();
    const changed = [...next].filter(([id, row]) => !isDeepStrictEqual(this.baseline.get(id), row));
    const removed = [...this.baseline].filter(([id]) => !next.has(id));
    const newReceipts = [...this.mutationReceipts].filter(([key]) => !this.loadedReceipts.has(key));
    if (!changed.length && !removed.length && !newReceipts.length && !this.feedChanges.length)
      return;
    const changedPartitions = new Set([...changed, ...removed].map(([, row]) => row.PK));
    const authorizationPartitions = financeAuthorizationPartitions([
      ...changed.map(([id, row]) => ({
        ...(this.baseline.get(id) ? { before: this.baseline.get(id)! } : {}),
        after: row,
      })),
      ...removed.map(([, row]) => ({ before: row })),
    ]);
    const writes: Writes = [
      ...changed.map(([, row]) => ({ Put: { TableName: tableName, Item: row } })),
      ...removed.map(([, row]) => ({
        Delete: { TableName: tableName, Key: { PK: row.PK, SK: row.SK } },
      })),
    ];
    // Server-only locators bridge legacy scope rows to touched-record reads. Keep both writers
    // on the same scope META revision so a new service and an older request cannot overwrite.
    const locatorCollections = new Set(Object.values(financeSyncSourceCollections));
    const priorLocations = new Map<string, { PK: string; SK: string }>();
    for (const row of this.baseline.values()) {
      if (!locatorCollections.has(row.collection)) continue;
      const key = rowId(financeLocatorKey(row.collection, row.entryKey));
      const previous = priorLocations.get(key);
      const location = { PK: row.PK, SK: row.SK };
      if (previous && !isDeepStrictEqual(previous, location))
        throw new Error('Finance locator conflict. Review duplicate source identifiers.');
      priorLocations.set(key, location);
    }
    const locatorCondition = (previous?: { PK: string; SK: string }) =>
      previous
        ? {
            ConditionExpression: 'attribute_not_exists(PK) OR #location = :expectedLocation',
            ExpressionAttributeNames: { '#location': 'storageKey' },
            ExpressionAttributeValues: { ':expectedLocation': previous },
          }
        : { ConditionExpression: 'attribute_not_exists(PK)' };
    const liveLocators = new Set<string>();
    for (const [, row] of changed)
      if (locatorCollections.has(row.collection)) {
        const key = financeLocatorKey(row.collection, row.entryKey);
        liveLocators.add(rowId(key));
        writes.push({
          Put: {
            TableName: tableName,
            Item: { ...key, storageKey: { PK: row.PK, SK: row.SK } },
            ...locatorCondition(priorLocations.get(rowId(key))),
          },
        });
      }
    for (const [, row] of removed)
      if (locatorCollections.has(row.collection)) {
        const key = financeLocatorKey(row.collection, row.entryKey);
        if (!liveLocators.has(rowId(key)))
          writes.push({
            Delete: {
              TableName: tableName,
              Key: key,
              ...locatorCondition({ PK: row.PK, SK: row.SK }),
            },
          });
      }
    // Pair locators make active budget/account uniqueness a point condition for targeted replay.
    // Existing scopes are trusted only after the separate bounded verifier stamps META coverage.
    const priorPairs = new Map<
      string,
      {
        key: ReturnType<typeof financeBudgetAccountPairKey>;
        locator: FinanceBudgetAccountPairLocator;
      }
    >();
    for (const row of this.baseline.values()) {
      if (row.collection !== 'budgetAccountLinks') continue;
      const link = decode(row.data) as import('@naaseh/domain').BudgetAccountLink;
      if (link.status !== 'active') continue;
      const key = financeBudgetAccountPairKey(link.budgetId, link.accountId);
      const locator = { ...key, linkId: link.id, storageKey: { PK: row.PK, SK: row.SK } };
      const previous = priorPairs.get(rowId(key));
      if (previous && !isDeepStrictEqual(previous.locator, locator))
        throw new Error('Duplicate active Finance budget/account links require operator review.');
      priorPairs.set(rowId(key), { key, locator });
    }
    const changedPairKeys = new Set<string>();
    for (const [, row] of changed) {
      if (row.collection !== 'budgetAccountLinks') continue;
      const link = decode(row.data) as import('@naaseh/domain').BudgetAccountLink;
      const key = financeBudgetAccountPairKey(link.budgetId, link.accountId);
      const keyId = rowId(key);
      changedPairKeys.add(keyId);
      const previous = priorPairs.get(keyId)?.locator;
      if (link.status === 'active') {
        const nextLocator = { ...key, linkId: link.id, storageKey: { PK: row.PK, SK: row.SK } };
        writes.push({
          Put: {
            TableName: tableName,
            Item: nextLocator,
            ...(previous
              ? {
                  ConditionExpression:
                    'attribute_not_exists(PK) OR (#linkId = :linkId AND #storageKey = :storageKey)',
                  ExpressionAttributeNames: {
                    '#linkId': 'linkId',
                    '#storageKey': 'storageKey',
                  },
                  ExpressionAttributeValues: {
                    ':linkId': previous.linkId,
                    ':storageKey': previous.storageKey,
                  },
                }
              : { ConditionExpression: 'attribute_not_exists(PK)' }),
          },
        });
      } else if (previous) {
        writes.push({
          Delete: {
            TableName: tableName,
            Key: key,
            ConditionExpression:
              'attribute_not_exists(PK) OR (#linkId = :linkId AND #storageKey = :storageKey)',
            ExpressionAttributeNames: { '#linkId': 'linkId', '#storageKey': 'storageKey' },
            ExpressionAttributeValues: {
              ':linkId': previous.linkId,
              ':storageKey': previous.storageKey,
            },
          },
        });
      }
    }
    for (const [, row] of removed) {
      if (row.collection !== 'budgetAccountLinks') continue;
      const link = decode(row.data) as import('@naaseh/domain').BudgetAccountLink;
      if (link.status !== 'active') continue;
      const key = financeBudgetAccountPairKey(link.budgetId, link.accountId);
      const previous = priorPairs.get(rowId(key))?.locator;
      if (previous && !changedPairKeys.has(rowId(key)))
        writes.push({
          Delete: {
            TableName: tableName,
            Key: key,
            ConditionExpression:
              'attribute_not_exists(PK) OR (#linkId = :linkId AND #storageKey = :storageKey)',
            ExpressionAttributeNames: { '#linkId': 'linkId', '#storageKey': 'storageKey' },
            ExpressionAttributeValues: {
              ':linkId': previous.linkId,
              ':storageKey': previous.storageKey,
            },
          },
        });
    }
    // Task and target partitions support bounded two-way relationship reads. The pair row is the
    // uniqueness fence; all three references change in the same transaction as the scoped source.
    const priorTaskLinks = new Map(
      [...this.baseline.values()]
        .filter((row) => row.collection === 'financialTaskLinks')
        .map((row) => {
          const link = adaptLegacyFinancialTaskLink(
            decode(row.data) as import('@naaseh/domain').FinancialTaskLink,
          );
          return [link.id, link] as const;
        }),
    );
    const removeTaskReferences = (link: import('@naaseh/domain').FinancialTaskLink) => {
      for (const key of [
        financeKeys.financialTaskReverseLink(link.taskId, link.id),
        financeKeys.financialTaskTargetLink(link.targetType, link.targetId, link.id),
        financeKeys.financialTaskPair(link.taskId, link.targetType, link.targetId),
      ]) writes.push({ Delete: { TableName: tableName, Key: key } });
    };
    for (const [, row] of changed) {
      if (row.collection !== 'financialTaskLinks') continue;
      const link = adaptLegacyFinancialTaskLink(
        decode(row.data) as import('@naaseh/domain').FinancialTaskLink,
      );
      const previous = priorTaskLinks.get(link.id);
      const retargeted = previous !== undefined && previous.targetId !== link.targetId;
      if (
        previous &&
        (previous.taskId !== link.taskId ||
          previous.targetType !== link.targetType ||
          (retargeted &&
            (link.targetType !== 'transaction' ||
              previous.status !== 'active' ||
              link.status !== 'active' ||
              this.transactionAliases.get(previous.targetId) !== link.targetId)))
      )
        throw new Error('Financial task link identity is immutable.');
      if (link.status !== 'active') {
        if (previous?.status === 'active') removeTaskReferences(previous);
        continue;
      }
      if (retargeted) {
        for (const key of [
          financeKeys.financialTaskTargetLink(previous.targetType, previous.targetId, previous.id),
          financeKeys.financialTaskPair(previous.taskId, previous.targetType, previous.targetId),
        ]) writes.push({ Delete: { TableName: tableName, Key: key } });
      }
      const reverseKey = financeKeys.financialTaskReverseLink(link.taskId, link.id);
      writes.push({
        Put: {
          TableName: tableName,
          Item: { ...reverseKey, linkId: link.id, data: encode(link) },
          ...(retargeted
            ? {
                ConditionExpression: 'attribute_not_exists(PK) OR #data.#version = :base',
                ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
                ExpressionAttributeValues: { ':base': previous.version },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      });
      const targetKey = financeKeys.financialTaskTargetLink(link.targetType, link.targetId, link.id);
      writes.push({
        Put: {
          TableName: tableName,
          Item: { ...targetKey, linkId: link.id, data: encode(link) },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
      writes.push({ Put: { TableName: tableName,
        Item: { ...financeKeys.financialTaskPair(link.taskId, link.targetType, link.targetId), linkId: link.id },
        ConditionExpression: 'attribute_not_exists(PK)' } });
    }
    for (const [, row] of removed) {
      if (row.collection !== 'financialTaskLinks') continue;
      const link = adaptLegacyFinancialTaskLink(
        decode(row.data) as import('@naaseh/domain').FinancialTaskLink,
      );
      if (link.status === 'active') removeTaskReferences(link);
    }
    const creation = this.creationIdentity;
    if (
      creation &&
      changed.some(
        ([id, row]) =>
          row.collection === creation.collection &&
          row.entryKey === creation.id &&
          !this.baseline.has(id),
      )
    ) {
      // A client chooses this ID, while the device cache keys all Finance types
      // by ID. Fence other existing namespaces without reading their bodies.
      for (const collection of locatorCollections)
        if (collection !== creation.collection)
          writes.push({
            ConditionCheck: {
              TableName: tableName,
              Key: financeLocatorKey(collection, creation.id),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          });
    }
    for (const [PK, revision] of this.versions) {
      const authorizationRevision = nextFinanceAuthorizationRevision(
        this.scopeMetadata.get(PK)?.financeAuthorizationRevision,
        authorizationPartitions.has(PK),
      );
      const condition = revision === 0 ? 'attribute_not_exists(PK)' : '#revision = :expected';
      const attributes =
        revision === 0
          ? {}
          : {
              ExpressionAttributeNames: { '#revision': 'revision' },
              ExpressionAttributeValues: { ':expected': revision },
            };
      writes.push(
        changedPartitions.has(PK)
          ? {
              Put: {
                TableName: tableName,
                Item: {
                  ...this.scopeMetadata.get(PK),
                  ...(revision === 0 &&
                  PK !== catalog &&
                  !this.scopeMetadata.get(PK)?.PK &&
                  !this.scopesWithRows.has(PK) &&
                  ![...next.values()].some(
                    (row) => row.PK === PK && (row.collection as string) === 'refundRelationships',
                  )
                    ? { refundRelationshipIndexVersion: 1 }
                    : {}),
                  ...(authorizationRevision === undefined
                    ? {}
                    : { financeAuthorizationRevision: authorizationRevision }),
                  PK,
                  SK: 'META',
                  revision: revision + 1,
                },
                ConditionExpression: condition,
                ...attributes,
              },
            }
          : {
              ConditionCheck: {
                TableName: tableName,
                Key: { PK, SK: 'META' },
                ConditionExpression: condition,
                ...attributes,
              },
            },
      );
    }
    const canonicalChanges = [
      ...changed.flatMap(([id, row]) => {
        const change = describeFinanceCanonicalChange(row, this.baseline.get(id), row);
        return change ? [change] : [];
      }),
      ...removed.flatMap(([, row]) => {
        const change = describeFinanceCanonicalChange(row, row);
        return change ? [change] : [];
      }),
    ];
    const publicationRecords = financePublicationJournalRecords(
      canonicalChanges,
      [...changedPartitions].map((PK) => ({
        PK,
        beforeRevision: this.versions.get(PK)!,
        afterRevision: this.versions.get(PK)! + 1,
      })),
    );
    for (const row of publicationRecords) {
      let condition = { ConditionExpression: 'attribute_not_exists(PK)' } as {
        ConditionExpression: string;
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
      if (
        [
          'finance-publication-deletion-v1',
          'finance-publication-account-deletion-v1',
          'finance-publication-account-birth-v1',
        ].includes(String(row.format))
      ) {
        const saved = await dynamodb.send(
          new GetCommand({
            TableName: tableName,
            Key: { PK: row.PK, SK: row.SK },
            ConsistentRead: true,
          }),
        );
        if (saved.Item) {
          if (
            saved.Item.format !== row.format ||
            (saved.Item.transactionId ?? saved.Item.accountId) !==
              (row.transactionId ?? row.accountId)
          )
            throw new Error('Finance deletion proof identity conflict.');
          condition = {
            ConditionExpression: '#publicationId = :publicationId AND #format = :format',
            ExpressionAttributeNames: { '#publicationId': 'publicationId', '#format': 'format' },
            ExpressionAttributeValues: {
              ':publicationId': saved.Item.publicationId,
              ':format': row.format,
            },
          };
        }
      }
      writes.push({
        Put: { TableName: tableName, Item: row, ...condition },
      });
    }
    // A reassigned provider account can live outside its connection's original scope.
    // The importer follows server-only locators so it preserves the existing identity owner.
    const locatedConnections = new Set(
      changed.filter(([, row]) => row.collection === 'connections').map(([, row]) => row.entryKey),
    );
    for (const [, row] of changed) {
      if (row.collection !== 'accounts') continue;
      const account = this.accounts.get(row.entryKey)!;
      if (account.connectionId) locatedConnections.add(account.connectionId);
    }
    for (const connectionId of locatedConnections) {
      const Key = financeKeys.connection(connectionId);
      const previous = (
        await dynamodb.send(new GetCommand({ TableName: tableName, Key, ConsistentRead: true }))
      ).Item;
      const scope = this.connections.get(connectionId)?.scope ?? previous?.scope;
      if (!scope) throw new Error('Finance connection not found.');
      const revision = Number(previous?.revision ?? 0);
      const accountPartitions = [
        ...new Set([
          ...((previous?.accountPartitions ?? []) as string[]),
          ...[...this.accounts.values()]
            .filter((account) => account.connectionId === connectionId)
            .map((account) => partitionFor(account.scope)),
        ]),
      ];
      writes.push({
        Put: {
          TableName: tableName,
          Item: { ...Key, scope, accountPartitions, revision: revision + 1 },
          ...(previous
            ? {
                ConditionExpression: '#revision = :expected',
                ExpressionAttributeNames: { '#revision': 'revision' },
                ExpressionAttributeValues: { ':expected': revision },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      });
    }
    for (const [, row] of removed) {
      if (row.collection === 'connections' && !this.connections.has(row.entryKey))
        writes.push({
          Delete: { TableName: tableName, Key: financeKeys.connection(row.entryKey) },
        });
    }
    for (const [key, data] of newReceipts) {
      const separator = key.indexOf(':');
      writes.push({
        Put: {
          TableName: tableName,
          Item: {
            ...financeKeys.mutationReceipt(key.slice(0, separator), key.slice(separator + 1)),
            data: encode(data),
            ...(this.requestFingerprint === undefined
              ? {}
              : { requestFingerprint: this.requestFingerprint }),
            requiredPartitions: [...this.versions.keys()].filter((pk) => pk !== catalog),
            requiredAuthorizationRevisions: Object.fromEntries(
              [...this.versions.keys()]
                .filter((pk) => pk !== catalog)
                .map((PK) => [
                  PK,
                  nextFinanceAuthorizationRevision(
                    this.scopeMetadata.get(PK)?.financeAuthorizationRevision,
                    authorizationPartitions.has(PK),
                  ) ?? 0,
                ]),
            ),
            expiresAt: Math.floor(Date.now() / 1000) + 2_592_000,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    for (const task of this.tasks.values()) {
      if (this.loadedTaskIds.has(task.id)) continue;
      writes.push(
        ...buildTaskTransaction(
          task,
          {
            id: createUlid(),
            taskId: task.id,
            actorId: task.ownerId,
            version: task.version,
            changedAt: task.updatedAt,
            operation: 'create',
            changedFields: ['label'],
            after: { label: task.label },
            syncOutcome: 'applied',
          },
          createUlid(),
        ).TransactItems!,
      );
    }
    // Legacy routes sometimes update the canonical maps without explicitly publishing.
    // Derive supported source events here, in the same atomic commit as their rows.
    // Keep the request queue unchanged so a failed checkpoint can safely be retried.
    const pendingChanges = [...this.feedChanges];
    const published = new Set(
      pendingChanges.map((change) => `${change.entityType}:${change.entityId}`),
    );
    const types = new Map(
      Object.entries(financeSyncSourceCollections).map(([type, collection]) => [collection, type]),
    );
    const changedAt = new Date().toISOString();
    for (const [, row] of changed) {
      const entityType = types.get(row.collection) as SyncChange['entityType'];
      if (!entityType || published.has(`${entityType}:${row.entryKey}`)) continue;
      const value = decode(row.data) as Record<string, unknown>;
      const version =
        value.version ??
        (['balanceSnapshots', 'budgetReconciliations'].includes(row.collection) ? 1 : undefined);
      if (value.id !== row.entryKey || !Number.isSafeInteger(version) || Number(version) < 1)
        throw new Error('Finance sync source identity or version is invalid.');
      const audience = row.PK === catalog ? 'PUBLIC' : row.PK.slice('FINANCE#SCOPE#'.length);
      if (row.PK !== catalog && !/^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(row.PK))
        throw new Error('Finance sync source audience is invalid.');
      const operation = ['tombstone', 'removed'].includes(String(value.status))
        ? 'tombstone'
        : 'upsert';
      pendingChanges.push({
        audience,
        entityType,
        entityId: row.entryKey,
        version: Number(version),
        changedAt,
        operation,
        ...(operation === 'upsert' ? { payload: value } : {}),
      });
      published.add(`${entityType}:${row.entryKey}`);
    }
    const changes = await prepareAudienceChanges(pendingChanges);
    writes.push(...feedTransactionItems(changes));
    // Fail before writing anything; callers checkpoint large imports in bounded batches.
    if (writes.length > 100 || Buffer.byteLength(JSON.stringify(writes)) > 3_500_000)
      throw new Error('Finance operation exceeds the atomic batch limit.');
    try {
      await dynamodb.send(new TransactWriteCommand({ TransactItems: writes }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException')
        throw new Error('Finance storage version conflict.');
      throw error;
    }
    this.baseline = next;
    // A later checkpoint in this request must retain protocol metadata established
    // by its first commit, just as a freshly loaded request would.
    for (const write of writes) {
      const item = write.Put?.Item;
      if (item?.SK === 'META' && changedPartitions.has(String(item.PK)))
        this.scopeMetadata.set(String(item.PK), { ...item });
    }
    for (const PK of changedPartitions) this.versions.set(PK, this.versions.get(PK)! + 1);
    for (const [key] of newReceipts) this.loadedReceipts.add(key);
    for (const id of this.tasks.keys()) this.loadedTaskIds.add(id);
    this.feedChanges.length = 0;
    await requestFinancePublication(
      publicationRecords.flatMap((row) => (typeof row.id === 'string' ? [row.id] : [])),
    );
  }

  private updateCatalogReferences(next: Map<string, StateRow>) {
    const counts = new Map(
      [...this.baseline.values()]
        .filter((row) => row.collection === 'catalogReferenceCounts')
        .map((row) => [row.entryKey, Number(row.data)]),
    );
    const references = (row: StateRow): string[] => {
      if (!['transactions', 'budgetItems', 'reusableItems', 'merchants'].includes(row.collection))
        return [];
      const data = row.data as Record<string, unknown>;
      const refs: string[] = [];
      if (typeof data.financeCategoryId === 'string')
        refs.push(`category:${data.financeCategoryId}`);
      if (typeof data.merchantId === 'string') refs.push(`merchant:${data.merchantId}`);
      for (const allocation of (data.allocations ?? []) as Array<{ financeCategoryId?: string }>)
        if (allocation.financeCategoryId) refs.push(`category:${allocation.financeCategoryId}`);
      return [...new Set(refs)];
    };
    for (const [id, row] of this.baseline) {
      if (isDeepStrictEqual(next.get(id), row)) continue;
      for (const ref of references(row)) counts.set(ref, (counts.get(ref) ?? 0) - 1);
    }
    for (const [id, row] of next) {
      if (isDeepStrictEqual(this.baseline.get(id), row)) continue;
      for (const ref of references(row)) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
    this.catalogReferenceCounts.clear();
    for (const [ref, count] of counts) {
      if (count < 0) throw new Error('Finance catalog reference invariant failed.');
      if (count) this.catalogReferenceCounts.set(ref, count);
    }
  }
}
