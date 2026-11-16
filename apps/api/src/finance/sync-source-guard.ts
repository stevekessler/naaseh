import { projectTransactionBudgetLinks } from './transaction-query-service.js';
import type { FinanceCacheAuthorizationSnapshot } from './cache-proof.js';
import { isDeepStrictEqual } from 'node:util';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { canReadTaskAs, expenseRefundRelationshipSchema, type SyncChange } from '@naaseh/domain';
import { getMembership } from '../groups/group-repository.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { SafeApiError } from '../shared/http.js';
import { FinanceUnitOfWork, financeLocatorKey, loadTargetedFinanceEntity } from './unit-of-work.js';

export const financeSyncSourceCollections: Readonly<Record<string, string>> = {
  financeAccount: 'accounts',
  financeBalanceSnapshot: 'balanceSnapshots',
  financeTransaction: 'transactions',
  financeTransfer: 'transfers',
  financeCategory: 'categories',
  financeMerchant: 'merchants',
  financeBudget: 'budgets',
  financeBudgetAccountLink: 'budgetAccountLinks',
  financeBudgetItem: 'budgetItems',
  financeReusableItem: 'reusableItems',
  financeTransactionMatch: 'transactionMatches',
  financeReconciliation: 'budgetReconciliations',
  financeTaskLink: 'financialTaskLinks',
  financeReviewIssue: 'reviewIssues',
  financeUpcomingExpense: 'upcomingExpenses',
  financeFulfillment: 'expenseFulfillments',
};
type Source = NonNullable<
  Awaited<ReturnType<typeof loadTargetedFinanceEntity<Record<string, unknown>>>>
>;
type Member = { userId: string; groupId: string; status: string; role: string; version?: number };
type Task = {
  ownerId: string;
  visibility: 'public' | 'private';
  groupId?: string;
  version: number;
};
const changed = () =>
  new SafeApiError(
    409,
    'finance_sync_sources_changed',
    'Finance access or records changed. Retry synchronization.',
    'authorization',
  );
export async function loadCurrentFinanceTaskAccess(id: string): Promise<Task | undefined> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `TASK#${id}`, SK: 'CURRENT' },
      ConsistentRead: true,
      ProjectionExpression: '#d.#o, #d.#s, #d.#g, #d.#v',
      ExpressionAttributeNames: {
        '#d': 'data',
        '#o': 'ownerId',
        '#s': 'visibility',
        '#g': 'groupId',
        '#v': 'version',
      },
    }),
  );
  const data = result.Item?.data;
  if (
    !data ||
    typeof data.ownerId !== 'string' ||
    !['public', 'private'].includes(data.visibility) ||
    !Number.isSafeInteger(data.version) ||
    data.version < 1
  )
    return undefined;
  return {
    ownerId: data.ownerId,
    visibility: data.visibility,
    version: data.version,
    ...(typeof data.groupId === 'string' ? { groupId: data.groupId } : {}),
  };
}

/** Check task-bearing REST/receipt results again without reading private task content. */
export async function assertFinanceTaskResultAccess(
  value: unknown,
  actor: { id: string; role: 'user' | 'admin'; active: boolean; groupIds?: string[] },
) {
  const pending = [value],
    seen = new WeakSet<object>(),
    ids = new Set<string>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    const object = current as Record<string, unknown>;
    if (
      typeof object.taskId === 'string' &&
      ((typeof object.budgetId === 'string' && typeof object.budgetItemId === 'string') ||
        (typeof object.targetType === 'string' && typeof object.targetId === 'string') ||
        typeof object.financialTaskLinkId === 'string')
    )
      ids.add(object.taskId);
    if (
      typeof object.id === 'string' &&
      typeof object.ownerId === 'string' &&
      typeof object.label === 'string' &&
      ['public', 'private'].includes(String(object.visibility))
    )
      ids.add(object.id);
    for (const item of Object.values(object)) pending.push(item);
  }
  const tasks: FinanceCacheAuthorizationSnapshot['tasks'] = [];
  for (const id of ids) {
    const task = await loadCurrentFinanceTaskAccess(id);
    // Finance does not inherit the ordinary administrator private-task read override.
    if (!task || !canReadTaskAs(task, { ...actor, role: 'user' }).allowed)
      throw new SafeApiError(
        409,
        'finance_task_access_changed',
        'Finance task access changed. Refresh before reviewing this result.',
        'authorization',
      );
    tasks.push({
      id,
      ownerId: task.ownerId,
      visibility: task.visibility,
      ...(task.groupId ? { groupId: task.groupId } : {}),
    });
  }
  return tasks;
}

/** Call only after the canonical session/PIN gate. Feed snapshots never establish source rights. */
export class FinanceSyncSourceGuard {
  private readonly work: FinanceUnitOfWork;
  private readonly sources = new Map<string, Source | undefined>();
  private readonly scopes = new Map<string, number>();
  private readonly members = new Map<string, Member | undefined>();
  private readonly tasks = new Map<string, Task>();
  private reads = 0;
  constructor(
    private readonly options: {
      userId: string;
      role: 'user' | 'admin';
      work?: () => FinanceUnitOfWork;
      membership?: (groupId: string, userId: string) => Promise<Member | undefined>;
      task?: (id: string) => Promise<Task | undefined>;
    },
  ) {
    this.work = options.work?.() ?? new FinanceUnitOfWork();
  }
  private async scopeAllowed(PK: string) {
    if (PK === 'FINANCE#CATALOG') return true;
    const match = /^FINANCE#SCOPE#(OWNER|GROUP)#([^#]+)$/u.exec(PK);
    if (!match) return false;
    if (match[1] === 'OWNER') return match[2] === this.options.userId;
    const groupId = match[2]!;
    if (!this.members.has(groupId))
      this.members.set(
        groupId,
        await (this.options.membership ?? getMembership)(groupId, this.options.userId),
      );
    const member = this.members.get(groupId);
    return Boolean(
      member &&
        member.groupId === groupId &&
        member.userId === this.options.userId &&
        member.status === 'active' &&
        ['owner', 'manager', 'member'].includes(member.role),
    );
  }
  private async source(collection: string, id: unknown): Promise<Source | undefined> {
    if (typeof id !== 'string' || !id || id.length > 256) return undefined;
    const key = JSON.stringify([collection, id]);
    if (!this.sources.has(key)) {
      if (++this.reads > 5000) throw changed();
      // Bracket source reads with the scope revision. Reading META only after
      // the row could pair an old snapshot with a new revision and miss a race.
      const locator = await this.work.get(financeLocatorKey(collection, id));
      const storageKey = locator?.storageKey as { PK?: unknown } | undefined;
      if (typeof storageKey?.PK !== 'string' || !(await this.scopeAllowed(storageKey.PK))) {
        this.sources.set(key, undefined);
        return undefined;
      }
      await this.work.get({ PK: storageKey.PK, SK: 'META' });
      const source = await loadTargetedFinanceEntity<Record<string, unknown>>(
        this.work,
        collection,
        id,
      );
      if (source) {
        const previous = this.scopes.get(source.scopeKey.PK);
        if (previous !== undefined && previous !== source.scopeRevision) throw changed();
        this.scopes.set(source.scopeKey.PK, source.scopeRevision);
      }
      this.sources.set(key, source);
    }
    const source = this.sources.get(key);
    return source?.value.id === id && (await this.scopeAllowed(source.storageKey.PK))
      ? source
      : undefined;
  }
  private async eligible(
    collection: string,
    id: unknown,
    ancestors = new Set<string>(),
  ): Promise<Source | undefined> {
    const identity = JSON.stringify([collection, id]);
    if (ancestors.has(identity) || ancestors.size > 8) return undefined;
    const source = await this.source(collection, id);
    if (!source) return undefined;
    const data = source.value,
      path = new Set([...ancestors, identity]);
    const parent = async (kind: string, key: unknown) => {
      const value = await this.eligible(kind, key, path);
      return value?.value.status === 'tombstone' ? undefined : value;
    };
    const all = async (kind: string, ids: unknown) => {
      if (!Array.isArray(ids) || ids.length > 1000) return false;
      for (const key of ids) if (!(await parent(kind, key))) return false;
      return true;
    };
    if (collection === 'categories' || collection === 'merchants')
      return source.storageKey.PK === 'FINANCE#CATALOG' ? source : undefined;
    if (source.storageKey.PK === 'FINANCE#CATALOG') return undefined;
    if (collection === 'accounts') {
      const scope = data.scope as { type?: string; ownerId?: string; groupId?: string } | undefined;
      const expected =
        scope?.type === 'owner'
          ? `FINANCE#SCOPE#OWNER#${scope.ownerId}`
          : scope?.type === 'group'
            ? `FINANCE#SCOPE#GROUP#${scope.groupId}`
            : '';
      return expected === source.storageKey.PK ? source : undefined;
    }
    if (collection === 'budgets' || collection === 'reusableItems')
      return source.storageKey.PK === `FINANCE#SCOPE#GROUP#${data.groupId}` ? source : undefined;
    if (
      collection === 'transactions' ||
      collection === 'balanceSnapshots' ||
      collection === 'reviewIssues'
    ) {
      const account = await parent('accounts', data.accountId);
      if (account?.storageKey.PK !== source.storageKey.PK) return undefined;
      if (collection === 'transactions' && Array.isArray(data.allocations)) {
        for (const allocation of data.allocations) {
          if (!allocation || typeof allocation !== 'object') return undefined;
          const budgetItemId = (allocation as Record<string, unknown>).budgetItemId;
          if (budgetItemId !== undefined && !(await parent('budgetItems', budgetItemId)))
            return undefined;
        }
      }
      return source;
    }
    if (collection === 'transfers')
      return (await all('transactions', data.legTransactionIds)) ? source : undefined;
    if (collection === 'budgetItems') {
      const budget = await parent('budgets', data.budgetId);
      return budget?.storageKey.PK === source.storageKey.PK &&
        (await all('accounts', data.relatedAccountIds ?? []))
        ? source
        : undefined;
    }
    if (collection === 'budgetAccountLinks') {
      const budget = await parent('budgets', data.budgetId);
      return budget?.storageKey.PK === source.storageKey.PK &&
        (await parent('accounts', data.accountId))
        ? source
        : undefined;
    }
    if (collection === 'transactionMatches')
      return (await parent('transactions', data.transactionId)) &&
        (await parent('budgetItems', data.budgetItemId))
        ? source
        : undefined;
    if (collection === 'budgetReconciliations')
      return (await parent('budgets', data.budgetId)) ? source : undefined;
    if (collection === 'upcomingExpenses') {
      const account = await parent('accounts', data.accountId);
      const budget = await parent('budgets', data.budgetId);
      return account?.storageKey.PK === source.storageKey.PK &&
        budget?.value.groupId === data.groupId
        ? source
        : undefined;
    }
    if (collection === 'expenseFulfillments')
      return (await parent('upcomingExpenses', data.expenseId)) &&
        (await parent('transactions', data.transactionId))
        ? source
        : undefined;
    if (collection === 'financialTaskLinks') {
      const targetType = data.targetType ?? (data.budgetItemId ? 'budgetItem' : undefined);
      const targetId = data.targetId ?? data.budgetItemId;
      if (typeof data.taskId !== 'string' || typeof targetId !== 'string') return undefined;
      if (targetType === 'budgetItem') {
        const item = await parent('budgetItems', targetId);
        if (!item || !(await parent('budgets', data.budgetId ?? item.value.budgetId)))
          return undefined;
      } else if (targetType === 'transaction') {
        if (!(await parent('transactions', targetId))) return undefined;
      } else if (targetType === 'upcomingExpense') {
        if (!(await parent('upcomingExpenses', targetId))) return undefined;
      } else return undefined;
      const task = await (this.options.task ?? loadCurrentFinanceTaskAccess)(data.taskId);
      if (
        !task ||
        !canReadTaskAs(task, { id: this.options.userId, role: 'user', active: true }).allowed
      )
        return undefined;
      this.tasks.set(data.taskId, task);
      return source;
    }
    return undefined;
  }
  supports(entityType: string) {
    return Object.hasOwn(financeSyncSourceCollections, entityType);
  }
  async canDeliver(change: SyncChange) {
    if (!this.options.userId) return false;
    const collection = financeSyncSourceCollections[change.entityType ?? ''];
    if (!collection) return false;
    const source = await this.eligible(collection, change.entityId);
    if (!source) return false;
    if (change.payload !== undefined && !isDeepStrictEqual(source.value, change.payload))
      return false;
    if (
      change.payload === undefined &&
      (change.operation !== 'tombstone' ||
        source.value.version !== change.version ||
        !['tombstone', 'removed'].includes(String(source.value.status)))
    )
      return false;
    if (collection === 'budgetReconciliations') {
      const accounts = (await this.work.get(source.storageKey))?.financeSourceAccountIds;
      if (
        !Array.isArray(accounts) ||
        !accounts.length ||
        accounts.length > 1000 ||
        accounts.some((id) => typeof id !== 'string' || !id || id.length > 256) ||
        new Set(accounts).size !== accounts.length
      )
        return false;
      for (const id of accounts) if (!(await this.eligible('accounts', id))) return false;
    }
    return true;
  }
  /** Point-read a source and its current authorized parent graph, without scope hydration. */
  async readCanonicalSource(entityType: string, entityId: string) {
    if (!this.supports(entityType)) return undefined;
    const source = await this.eligible(financeSyncSourceCollections[entityType]!, entityId);
    if (!source || ['tombstone', 'removed', 'deleting'].includes(String(source.value.status)))
      return undefined;
    const version =
      source.value.version ??
      (['financeBalanceSnapshot', 'financeReconciliation'].includes(entityType) ? 1 : undefined);
    if (!Number.isSafeInteger(version) || Number(version) < 1) throw changed();
    return structuredClone(source.value);
  }
  /** Fence a targeted write against the canonical source and membership reads. */
  sourceWriteConditions() {
    return [
      ...[...this.scopes].map(([PK, revision]) => ({
        ConditionCheck: {
          TableName: tableName,
          Key: { PK, SK: 'META' },
          ConditionExpression: '#revision = :expected',
          ExpressionAttributeNames: { '#revision': 'revision' },
          ExpressionAttributeValues: { ':expected': revision },
        },
      })),
      ...[...this.members.values()].flatMap((member) => {
        if (!member || member.status !== 'active') return [];
        return [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: { PK: `GROUP#${member.groupId}`, SK: `MEMBER#${member.userId}` },
              ConditionExpression: '#data = :membership',
              ExpressionAttributeNames: { '#data': 'data' },
              ExpressionAttributeValues: { ':membership': member },
            },
          },
        ];
      }),
    ];
  }

  /** The browsing view authorizes the transaction and each optional linked budget separately. */
  async readTransactionForBrowsing(id: string) {
    const source = await this.source('transactions', id);
    const value = source?.value;
    if (!source || !value || value.status !== 'active') return undefined;
    const account = await this.eligible('accounts', value.accountId);
    if (
      !account ||
      account.storageKey.PK !== source.storageKey.PK ||
      ['tombstone', 'deleting'].includes(String(account.value.status))
    )
      return undefined;
    const projection = await projectTransactionBudgetLinks(value, async (itemId) => {
      const locator = await this.work.get(financeLocatorKey('budgetItems', itemId));
      if (!locator) return { status: 'missing' };
      const item = await this.eligible('budgetItems', itemId);
      if (item?.value.status === 'tombstone') return { status: 'missing' };
      if (!item || typeof item.value.budgetId !== 'string') return { status: 'hidden' };
      const budget = await this.eligible('budgets', item.value.budgetId);
      if (budget?.value.status === 'tombstone') return { status: 'missing' };
      if (!budget || typeof budget.value.name !== 'string') return { status: 'hidden' };
      return { status: 'visible', budgetId: item.value.budgetId, budgetName: budget.value.name };
    });
    if (Number(value.amountMinor) <= 0) return projection;
    const stored = await loadTargetedFinanceEntity(this.work, 'refundRelationships', id);
    if (
      stored?.storageKey.PK !== source.storageKey.PK ||
      stored.scopeRevision !== source.scopeRevision
    )
      return projection;
    const relationship = expenseRefundRelationshipSchema.safeParse(stored.value);
    if (
      !relationship.success ||
      relationship.data.status !== 'active' ||
      relationship.data.refundTransactionId !== id
    )
      return projection;
    const original = await this.readCanonicalSource(
      'financeTransaction',
      relationship.data.originalExpenseTransactionId,
    );
    return original && typeof original.description === 'string'
      ? {
          ...projection,
          refundOriginal: {
            id: relationship.data.originalExpenseTransactionId,
            description: original.description,
          },
        }
      : projection;
  }

  /** Private evidence for sources checked in this delivery; never a public Finance DTO. */
  async cacheAuthorizationSnapshot(): Promise<FinanceCacheAuthorizationSnapshot> {
    if (!this.options.userId) throw changed();
    const scopes: FinanceCacheAuthorizationSnapshot['scopes'] = [];
    for (const PK of this.scopes.keys()) {
      const meta = await this.work.get({ PK, SK: 'META' });
      const authorizationRevision =
        meta?.financeAuthorizationRevision === undefined ? 0 : meta.financeAuthorizationRevision;
      if (
        !meta ||
        typeof authorizationRevision !== 'number' ||
        !Number.isSafeInteger(authorizationRevision) ||
        authorizationRevision < 0
      )
        throw changed();
      scopes.push({ PK, authorizationRevision });
    }
    const groups = new Set(
      scopes
        .filter(({ PK }) => PK.startsWith('FINANCE#SCOPE#GROUP#'))
        .map(({ PK }) => PK.slice('FINANCE#SCOPE#GROUP#'.length)),
    );
    const members: FinanceCacheAuthorizationSnapshot['members'] = [];
    for (const groupId of groups) {
      const member = this.members.get(groupId);
      if (
        !member ||
        member.status !== 'active' ||
        !['owner', 'manager', 'member'].includes(member.role)
      )
        throw changed();
      members.push({
        groupId,
        role: member.role as 'owner' | 'manager' | 'member',
        ...(member.version === undefined ? {} : { version: member.version }),
      });
    }
    await this.assertCurrent();
    return {
      userId: this.options.userId,
      scopes,
      members,
      tasks: [...this.tasks].map(([id, task]) => ({
        id,
        ownerId: task.ownerId,
        visibility: task.visibility,
        ...(task.groupId ? { groupId: task.groupId } : {}),
      })),
    };
  }
  async assertCurrent() {
    const fresh = this.options.work?.() ?? new FinanceUnitOfWork();
    for (const [PK, revision] of this.scopes)
      if ((await fresh.get({ PK, SK: 'META' }))?.revision !== revision) throw changed();
    for (const [groupId, member] of this.members)
      if (
        !isDeepStrictEqual(
          member,
          await (this.options.membership ?? getMembership)(groupId, this.options.userId),
        )
      )
        throw changed();
    for (const [id, task] of this.tasks)
      if (!isDeepStrictEqual(task, await (this.options.task ?? loadCurrentFinanceTaskAccess)(id)))
        throw changed();
  }
}

/** Server-only dependency evidence must never become an additive public/Apple field. */
export function serializeFinanceFeedChange(
  change: SyncChange & { financeDelivery?: unknown },
): SyncChange {
  return {
    audience: change.audience,
    sequence: change.sequence,
    entityId: change.entityId,
    ...(change.entityType ? { entityType: change.entityType } : {}),
    ...(change.version === undefined ? {} : { version: change.version }),
    operation: change.operation,
    ...(change.operation === 'upsert' && change.payload !== undefined
      ? { payload: change.payload }
      : {}),
    changedAt: change.changedAt,
  };
}
