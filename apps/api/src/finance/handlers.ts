import { z } from 'zod';
import { itemsForBudget, itemBudgetIds } from './budget-membership.js';
import { linkSharedFinanceBudgetItem, updateSharedFinanceBudgetItem } from './budget-service.js';
import { authorizedFinanceProjection, projectionDigest } from './sync-runtime.js';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  csvImportChunkInputSchema,
  financeAccountPatchSchema,
  financeBudgetAccountLinkInputSchema,
  financeBudgetInputSchema,
  financeBudgetItemInputSchema,
  financeBudgetPatchSchema,
  financeBudgetReconciliationInputSchema,
  financeCategoryInputSchema,
  financeCategoryPatchSchema,
  financeDeletionConfirmationSchema,
  financeMerchantInputSchema,
  financeReusableCopyInputSchema,
  financeReusableItemInputSchema,
  financeTaskCreateInputSchema,
  financeTransactionMatchDecisionSchema,
  manualFinanceAccountInputSchema,
  manualFinanceBalanceInputSchema,
  manualFinanceTransactionInputSchema,
  providerReconciliationDecisionInputSchema,
  simplefinClaimInputSchema,
  transactionAllocationReplacementSchema,
} from '@naaseh/contracts';
import {
  archiveFinanceCategory,
  archiveBudget,
  archiveBudgetItem,
  archiveFinancialTransaction,
  archiveMerchant,
  archiveReusableBudgetItem,
  assertFinanceTransition,
  assertUniqueActiveCategoryName,
  canPermanentlyDeleteFinanceCategory,
  canPermanentlyDeleteBudget,
  canPermanentlyDeleteMerchant,
  canPermanentlyDeleteTransaction,
  createMerchant,
  createUlid,
  createUserFinanceCategory,
  renameFinanceCategory,
  tombstoneTransactionMatch,
} from '@naaseh/domain';
import { json } from '../shared/http.js';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import {
  changeAccountLifecycle,
  createManualAccount,
  recordManualBalance,
} from './account-service.js';
import {
  addFinanceBudgetItem,
  createFinanceBudget,
  getFinanceBudget,
  linkFinanceBudgetAccount,
  listFinanceBudgets,
  updateFinanceBudget,
} from './budget-service.js';
import { claimSimplefinConnection, dispatchSimplefinRefresh } from './connection-service.js';
import { commitAuthorizedCsvImportChunk } from './csv-import-service.js';
import {
  createAuthorizedDeletionPreview,
  createDeletionPreview,
  createFinancialTaskLinkDeletionPreview,
  executeDeletion,
} from './deletion-service.js';
import { decideProviderReconciliation } from './provider-reconciliation-service.js';
import {
  acceptFinanceTransactionMatch,
  invalidateBudgetTransactionSuggestions,
  copyReusableItemToBudget,
  createFinanceReusableItem,
  evaluateFinanceTransactionMatches,
  listFinanceReusableItems,
  listFinanceTransactionMatches,
  listReusableOffers,
  rejectFinanceTransactionMatch,
  undoFinanceTransactionMatch,
} from './matching-service.js';
import {
  markFinanceBudgetsChangedByTransaction,
  reconcileFinanceBudget,
} from './reconciliation-service.js';
import {
  createTaskFromFinanceBudgetItem,
  removeAuthorizedFinancialTaskLink,
} from './task-link-service.js';
import {
  claimFinanceCategoryName,
  claimFinanceMerchantKey,
  FinanceMemoryRepository,
} from './repository.js';
import {
  accountAfterTransactionChange,
  associateTransactionMerchant,
  confirmTransactionTransfer,
  createManualTransaction,
  readAuthorizedMerchantActivity,
  replaceTransactionAllocationsForActor,
  searchAuthorizedTransactions,
} from './transaction-service.js';

export type FinanceRouteHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyResultV2>;

const routeKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

export class FinanceRouteRegistry {
  readonly #routes = new Map<string, FinanceRouteHandler>();

  register(method: string, path: string, handler: FinanceRouteHandler) {
    const key = routeKey(method, path);
    if (this.#routes.has(key)) throw new Error(`Duplicate Finance route: ${key}`);
    this.#routes.set(key, handler);
    return this;
  }

  resolve(method: string, routePath: string) {
    return this.#routes.get(routeKey(method, routePath));
  }

  match(method: string, path: string) {
    const segments = path.split('/');
    for (const [key, handler] of this.#routes) {
      const [registeredMethod, template] = key.split(' ');
      if (registeredMethod !== method.toUpperCase()) continue;
      const expected = template!.split('/');
      if (expected.length !== segments.length) continue;
      const parameters: Record<string, string> = {};
      const matches = expected.every((segment, index) => {
        const name = /^\{([^}]+)\}$/u.exec(segment)?.[1];
        if (!name) return segment === segments[index];
        const value = decodeURIComponent(segments[index]!);
        if (!value || value.includes('/')) return false;
        parameters[name] = value;
        return true;
      });
      if (matches) return { handler, parameters };
    }
    return undefined;
  }
}

export interface UserStory1RouteDependencies {
  repository: FinanceMemoryRepository;
  actorFor: (event: APIGatewayProxyEventV2) => Promise<FinanceActor> | FinanceActor;
  deletionSigningSecret: string;
  allowedSimplefinHosts: readonly string[];
  kms?: NonNullable<Parameters<typeof claimSimplefinConnection>[2]>['kms'];
  fetcher?: typeof fetch;
  lambda?: Parameters<typeof dispatchSimplefinRefresh>[4];
  importFunctionName?: string;
  now?: () => Date;
  validateAssignee?: (id: string) => Promise<void>;
  snapshotToken?: string;
}

const bodyOf = (event: APIGatewayProxyEventV2) =>
  JSON.parse(
    event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '{}'),
  ) as unknown;
const parameter = (event: APIGatewayProxyEventV2, name: string) => {
  const value = event.pathParameters?.[name];
  if (!value) throw new Error(`Missing Finance route parameter ${name}.`);
  return value;
};
const mutationId = (event: APIGatewayProxyEventV2) =>
  event.headers['idempotency-key'] ?? createUlid();
const query = (event: APIGatewayProxyEventV2, name: string) => event.queryStringParameters?.[name];
const visible = (
  actor: FinanceActor,
  scope: import('@naaseh/domain').FinanceScope,
  action: 'read' | 'edit' | 'connect' | 'delete' = 'read',
) => authorizeFinanceScope(actor, scope, action).allowed;

const accountDeletionReferences = (repository: FinanceMemoryRepository, accountId: string) => ({
  transactions: repository.transactions.filter((item) => item.accountId === accountId).length,
  budgetLinks: [...repository.budgetAccountLinks.values()].filter(
    (link) => link.accountId === accountId,
  ).length,
  budgetItems: [...repository.budgetItems.values()].filter((item) =>
    item.relatedAccountIds.includes(accountId),
  ).length,
  balanceSnapshots: repository.balanceSnapshots.filter(
    (snapshot) => snapshot.accountId === accountId && snapshot.id !== `${accountId}-opening`,
  ).length,
});
const transactionDeletionReferences = (
  repository: FinanceMemoryRepository,
  transaction: import('@naaseh/domain').FinancialTransaction,
) => ({
  allocations: transaction.allocations.length,
  merchant: transaction.merchantId ? 1 : 0,
  transfer: transaction.transferId ? 1 : 0,
  matches: [...repository.transactionMatches.values()].filter(
    (match) => match.transactionId === transaction.id,
  ).length,
  reviewIssues: [...repository.reviewIssues.values()].filter((issue) =>
    issue.candidateIds.includes(transaction.id),
  ).length,
});
const hasDeletionReferences = (references: Record<string, number>) =>
  Object.values(references).some((count) => count > 0);
const visibleDeletionCounts = (references: Record<string, number>) =>
  Object.fromEntries(Object.entries(references).filter(([, count]) => count > 0));

const hasAdditionalDeletionReferences = (
  repository: FinanceMemoryRepository,
  type: string,
  id: string,
) => {
  const items = [...repository.budgetItems.values()];
  const reusable = [...repository.reusableItems.values()];
  if (type === 'category')
    return (
      repository.transactions.some((transaction) =>
        transaction.allocations.some((allocation) => allocation.financeCategoryId === id),
      ) ||
      [...repository.merchants.values()].some((merchant) => merchant.financeCategoryId === id) ||
      [...items, ...reusable].some((item) => item.financeCategoryId === id)
    );
  if (type === 'merchant')
    return (
      repository.transactions.some((transaction) => transaction.merchantId === id) ||
      [...items, ...reusable].some((item) => item.merchantId === id)
    );
  if (type === 'reusable-item') return items.some((item) => item.sourceReusableItemId === id);
  if (type === 'budget')
    return (
      itemsForBudget(repository, id).length > 0 ||
      [...repository.budgetAccountLinks.values()].some((link) => link.budgetId === id) ||
      repository.budgetReconciliations.some((record) => record.budgetId === id) ||
      [...repository.financialTaskLinks.values()].some((link) => link.budgetId === id)
    );
  return false;
};

export function registerUserStory1FinanceRoutes(
  registry: FinanceRouteRegistry,
  dependencies: UserStory1RouteDependencies,
) {
  const { repository } = dependencies;
  registry.register('GET', '/api/v1/finance/sync/bootstrap', async (event) => {
    const actor = await dependencies.actorFor(event);
    const records = authorizedFinanceProjection(repository, actor);
    const digest = projectionDigest(records);
    const cursor = query(event, 'cursor');
    let offset = 0;
    if (cursor) {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        offset: number;
        digest: string;
      };
      if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || parsed.digest !== digest)
        throw new Error('Finance snapshot version conflict.');
      offset = parsed.offset;
    }
    const page: typeof records = [];
    let bytes = 0;
    while (offset + page.length < records.length && page.length < 100) {
      const record: (typeof records)[number] = records[offset + page.length]!;
      const size = Buffer.byteLength(JSON.stringify(record));
      if (page.length && bytes + size > 1_000_000) break;
      page.push(record);
      bytes += size;
    }
    const next = offset + page.length;
    return json(200, {
      records: page,
      digest,
      ...(dependencies.snapshotToken ? { token: dependencies.snapshotToken } : {}),
      scopes:
        actor.role === 'admin'
          ? []
          : [`OWNER#${actor.id}`, ...actor.groupMemberships.map((item) => `GROUP#${item.groupId}`)],
      nextCursor:
        next < records.length
          ? Buffer.from(JSON.stringify({ offset: next, digest })).toString('base64url')
          : null,
    });
  });
  registry.register('GET', '/api/v1/finance/accounts', async (event) => {
    const actor = await dependencies.actorFor(event);
    const items = [...repository.accounts.values()].filter((account) =>
      visible(actor, account.scope),
    );
    return json(200, { items, nextCursor: null });
  });
  registry.register('POST', '/api/v1/finance/accounts', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = manualFinanceAccountInputSchema.parse(bodyOf(event));
    const account = await createManualAccount(
      repository,
      actor,
      {
        id: createUlid(),
        scope: input.scope,
        sourceName: input.sourceName,
        organizationName: input.organizationName,
        friendlyName: input.friendlyName,
        accountType: input.accountType,
        currency: input.currency,
        openingBalanceMinor: input.openingBalanceMinor,
        balanceAt: input.balanceAt,
        ...(input.availableBalanceMinor === undefined
          ? {}
          : { availableBalanceMinor: input.availableBalanceMinor }),
      },
      mutationId(event),
    );
    return json(201, account);
  });
  registry.register('GET', '/api/v1/finance/accounts/{accountId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const account = repository.accounts.get(parameter(event, 'accountId'));
    if (!account || !visible(actor, account.scope)) throw new Error('Finance record not found.');
    return json(200, account);
  });
  registry.register('PATCH', '/api/v1/finance/accounts/{accountId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = parameter(event, 'accountId');
    const input = financeAccountPatchSchema.parse(bodyOf(event));
    const account = repository.accounts.get(accountId);
    if (!account || !visible(actor, account.scope, input.status ? 'delete' : 'edit'))
      throw new Error('Finance record not found.');
    if (account.version !== input.expectedVersion) throw new Error('Account version conflict.');
    if (
      input.scope &&
      (!visible(actor, account.scope, 'connect') || !visible(actor, input.scope, 'connect'))
    ) {
      throw new Error('Finance record not found.');
    }
    const changed = Boolean(
      input.friendlyName || input.scope || (input.status && input.status !== account.status),
    );
    const updated = changed
      ? {
          ...account,
          ...(input.friendlyName ? { friendlyName: input.friendlyName } : {}),
          ...(input.scope ? { scope: input.scope } : {}),
          ...(input.status && input.status !== account.status
            ? {
                status: assertFinanceTransition(account.status, input.status) as
                  | 'active'
                  | 'archived',
              }
            : {}),
          version: account.version + 1,
        }
      : account;
    repository.accounts.set(accountId, updated);
    return json(200, updated);
  });
  registry.register('POST', '/api/v1/finance/accounts/{accountId}/balances', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = parameter(event, 'accountId');
    const input = manualFinanceBalanceInputSchema.parse(bodyOf(event));
    const now = dependencies.now?.() ?? new Date();
    return json(
      201,
      await recordManualBalance(
        repository,
        actor,
        accountId,
        {
          id: createUlid(),
          expectedAccountVersion: input.expectedAccountVersion,
          balanceMinor: input.balanceMinor,
          effectiveAt: input.effectiveAt,
          recordedAt: now.toISOString(),
          ...(input.availableBalanceMinor === undefined
            ? {}
            : { availableBalanceMinor: input.availableBalanceMinor }),
        },
        mutationId(event),
      ),
    );
  });
  registry.register('GET', '/api/v1/finance/accounts/{accountId}/transactions', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = parameter(event, 'accountId');
    const account = repository.accounts.get(accountId);
    if (!account || !visible(actor, account.scope)) throw new Error('Finance record not found.');
    return json(200, {
      items: repository.transactions.filter((item) => item.accountId === accountId),
      cursor: null,
      totalsComplete: true,
    });
  });
  registry.register('POST', '/api/v1/finance/accounts/{accountId}/transactions', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = parameter(event, 'accountId');
    const input = manualFinanceTransactionInputSchema.parse(bodyOf(event));
    const transaction = await createManualTransaction(
      repository,
      actor,
      accountId,
      {
        id: createUlid(),
        amountMinor: input.amountMinor,
        transactedAt: input.transactedAt,
        description: input.description,
        ...(input.postedAt === undefined ? {} : { postedAt: input.postedAt }),
        ...(input.payee === undefined ? {} : { payee: input.payee }),
        ...(input.memo === undefined ? {} : { memo: input.memo }),
      },
      mutationId(event),
    );
    return json(201, transaction);
  });
  registry.register('GET', '/api/v1/finance/transactions', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = query(event, 'accountId');
    const limit = query(event, 'limit');
    return json(
      200,
      searchAuthorizedTransactions(repository, actor, {
        query: query(event, 'query') ?? '',
        ...(accountId ? { accountId } : {}),
        ...(limit ? { limit: Number(limit) } : {}),
      }),
    );
  });
  registry.register(
    'PUT',
    '/api/v1/finance/transactions/{transactionId}/allocations',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = transactionAllocationReplacementSchema.parse(bodyOf(event));
      return json(
        200,
        await replaceTransactionAllocationsForActor(
          repository,
          actor,
          parameter(event, 'transactionId'),
          {
            expectedVersion: input.expectedVersion,
            allocations: input.allocations.map((allocation) => ({
              id: allocation.id,
              amountMinor: allocation.amountMinor,
              financeCategoryId: allocation.financeCategoryId,
              ...(allocation.budgetItemId ? { budgetItemId: allocation.budgetItemId } : {}),
              ...(allocation.budgetId ? { budgetId: allocation.budgetId } : {}),
              ...(allocation.note ? { note: allocation.note } : {}),
            })),
          },
          mutationId(event),
        ),
      );
    },
  );
  registry.register(
    'POST',
    '/api/v1/finance/transactions/{transactionId}/merchant',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = bodyOf(event) as { merchantId?: unknown; expectedVersion?: unknown };
      if (typeof input.merchantId !== 'string' || !Number.isSafeInteger(input.expectedVersion)) {
        throw new Error('Invalid merchant association.');
      }
      return json(
        200,
        await associateTransactionMerchant(
          repository,
          actor,
          parameter(event, 'transactionId'),
          input.merchantId,
          input.expectedVersion as number,
          mutationId(event),
        ),
      );
    },
  );
  registry.register('POST', '/api/v1/finance/transfers', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = bodyOf(event) as { id?: unknown; scope?: unknown; transactionIds?: unknown };
    if (
      typeof input.id !== 'string' ||
      !input.scope ||
      !Array.isArray(input.transactionIds) ||
      input.transactionIds.length < 2 ||
      input.transactionIds.some((id) => typeof id !== 'string')
    ) {
      throw new Error('Invalid transfer confirmation.');
    }
    return json(
      201,
      await confirmTransactionTransfer(
        repository,
        actor,
        {
          id: input.id,
          scope: input.scope as import('@naaseh/domain').FinanceScope,
          transactionIds: input.transactionIds as string[],
        },
        mutationId(event),
      ),
    );
  });
  registry.register(
    'POST',
    '/api/v1/finance/transactions/{transactionId}/provider-reconciliation',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = providerReconciliationDecisionInputSchema.parse(bodyOf(event));
      return json(
        200,
        decideProviderReconciliation(
          repository,
          actor,
          parameter(event, 'transactionId'),
          input,
          mutationId(event),
        ),
      );
    },
  );
  registry.register('GET', '/api/v1/finance/review-issues', async (event) => {
    const actor = await dependencies.actorFor(event);
    const items = [...repository.reviewIssues.values()]
      .filter((review) => {
        const account = repository.accounts.get(review.accountId);
        return account && visible(actor, account.scope);
      })
      .map((review) => ({
        ...review,
        candidates: review.candidateIds
          .map((id) => repository.transactions.find((item) => item.id === id))
          .filter((item) => item?.accountId === review.accountId),
      }));
    return json(200, { items, cursor: null });
  });
  registry.register('GET', '/api/v1/finance/categories', async (event) => {
    const actor = await dependencies.actorFor(event);
    if (!actor.active) throw new Error('Finance record not found.');
    return json(200, { items: [...repository.categories.values()] });
  });
  registry.register('POST', '/api/v1/finance/categories', async (event) => {
    const actor = await dependencies.actorFor(event);
    if (!actor.active) throw new Error('Finance record not found.');
    const input = financeCategoryInputSchema.parse(bodyOf(event));
    const category = createUserFinanceCategory({
      id: createUlid(),
      name: input.name,
      creatorId: actor.id,
    });
    assertUniqueActiveCategoryName([...repository.categories.values()], category.name);
    claimFinanceCategoryName(repository, category.canonicalName, category.id);
    repository.categories.set(category.id, category);
    return json(201, repository.remember(actor.id, mutationId(event), category));
  });
  registry.register('PATCH', '/api/v1/finance/categories/{categoryId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeCategoryPatchSchema.parse(bodyOf(event));
    const category = repository.categories.get(parameter(event, 'categoryId'));
    if (!category) throw new Error('Finance record not found.');
    if (category.version !== input.expectedVersion)
      throw new Error('Finance category version conflict.');
    let updated = category;
    if (input.name && input.name !== category.name) {
      assertUniqueActiveCategoryName([...repository.categories.values()], input.name, category.id);
      const renamed = renameFinanceCategory(updated, input.name, actor);
      if (repository.categoryNameLocks.get(category.canonicalName) === category.id) {
        repository.categoryNameLocks.delete(category.canonicalName);
      }
      claimFinanceCategoryName(repository, renamed.canonicalName, renamed.id);
      updated = renamed;
    }
    if (input.status === 'archived' && updated.status !== 'archived')
      updated = archiveFinanceCategory(updated, actor);
    repository.categories.set(updated.id, updated);
    return json(200, repository.remember(actor.id, mutationId(event), updated));
  });
  registry.register('GET', '/api/v1/finance/merchants', async (event) => {
    const actor = await dependencies.actorFor(event);
    if (!actor.active) throw new Error('Finance record not found.');
    const normalizedQuery = (query(event, 'query') ?? '')
      .normalize('NFC')
      .toLocaleLowerCase('und')
      .trim();
    const items = [...repository.merchants.values()].filter(
      (merchant) =>
        merchant.status === 'active' &&
        (!normalizedQuery ||
          [merchant.name, merchant.city, merchant.region].some((value) =>
            value?.normalize('NFC').toLocaleLowerCase('und').includes(normalizedQuery),
          )),
    );
    return json(200, { items, cursor: null });
  });
  registry.register('POST', '/api/v1/finance/merchants', async (event) => {
    const actor = await dependencies.actorFor(event);
    if (!actor.active) throw new Error('Finance record not found.');
    const input = financeMerchantInputSchema.parse(bodyOf(event));
    const merchant = createMerchant({
      id: createUlid(),
      name: input.name,
      ...(input.city ? { city: input.city } : {}),
      ...(input.region ? { region: input.region } : {}),
      ...(input.merchantCategoryCode ? { merchantCategoryCode: input.merchantCategoryCode } : {}),
      ...(input.financeCategoryId ? { financeCategoryId: input.financeCategoryId } : {}),
      source: 'manual',
      creatorId: actor.id,
    });
    claimFinanceMerchantKey(repository, merchant.canonicalKey, merchant.id);
    repository.merchants.set(merchant.id, merchant);
    return json(201, repository.remember(actor.id, mutationId(event), merchant));
  });
  registry.register('GET', '/api/v1/finance/merchants/{merchantId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    if (!actor.active) throw new Error('Finance record not found.');
    return json(
      200,
      readAuthorizedMerchantActivity(repository, actor, parameter(event, 'merchantId')),
    );
  });
  registry.register('POST', '/api/v1/finance/accounts/{accountId}/csv-imports', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = parameter(event, 'accountId');
    const input = csvImportChunkInputSchema.parse(bodyOf(event));
    return json(
      201,
      await commitAuthorizedCsvImportChunk(repository, actor, { accountId, ...input }),
    );
  });
  registry.register('GET', '/api/v1/finance/budgets', async (event) => {
    const actor = await dependencies.actorFor(event);
    return json(200, listFinanceBudgets(repository, actor, query(event, 'groupId')));
  });
  registry.register('POST', '/api/v1/finance/budgets', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeBudgetInputSchema.parse(bodyOf(event));
    const budget = await createFinanceBudget(
      repository,
      actor,
      {
        id: createUlid(),
        groupId: input.groupId,
        name: input.name,
        budgetDate: input.budgetDate,
        startDate: input.startDate,
        ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
        ...(input.status === 'active' ? { status: 'active' as const } : {}),
      },
      mutationId(event),
    );
    return json(201, getFinanceBudget(repository, actor, budget.id));
  });
  registry.register('GET', '/api/v1/finance/budgets/{budgetId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    return json(200, getFinanceBudget(repository, actor, parameter(event, 'budgetId')));
  });
  registry.register('PATCH', '/api/v1/finance/budgets/{budgetId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeBudgetPatchSchema.parse(bodyOf(event));
    const budgetId = parameter(event, 'budgetId');
    await updateFinanceBudget(
      repository,
      actor,
      budgetId,
      {
        expectedVersion: input.expectedVersion,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.budgetDate === undefined ? {} : { budgetDate: input.budgetDate }),
        ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
        ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      mutationId(event),
    );
    return json(200, getFinanceBudget(repository, actor, budgetId));
  });
  registry.register('POST', '/api/v1/finance/budgets/{budgetId}/accounts', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeBudgetAccountLinkInputSchema.parse(bodyOf(event));
    const budgetId = parameter(event, 'budgetId');
    const link = await linkFinanceBudgetAccount(
      repository,
      actor,
      budgetId,
      {
        id: input.id ?? createUlid(),
        accountId: input.accountId,
        expectedBudgetVersion: input.expectedBudgetVersion,
      },
      mutationId(event),
    );
    return json(201, link);
  });
  registry.register('POST', '/api/v1/finance/budgets/{budgetId}/items', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeBudgetItemInputSchema.parse(bodyOf(event));
    const item = await addFinanceBudgetItem(
      repository,
      actor,
      parameter(event, 'budgetId'),
      {
        id: input.id ?? createUlid(),
        expectedBudgetVersion: input.expectedBudgetVersion,
        description: input.description,
        financeCategoryId: input.financeCategoryId,
        plannedAmountMinor: input.plannedAmountMinor,
        currency: input.currency,
        currencyExponent: input.currencyExponent,
        relatedAccountIds: input.relatedAccountIds,
        ...(input.sourceReusableItemId ? { sourceReusableItemId: input.sourceReusableItemId } : {}),
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        ...(input.applicableDate ? { applicableDate: input.applicableDate } : {}),
      },
      mutationId(event),
    );
    return json(201, item);
  });
  registry.register('POST', '/api/v1/finance/budgets/{budgetId}/items/{itemId}', async (event) => {
    const input = z
      .object({ expectedBudgetVersion: z.number().int().positive() })
      .strict()
      .parse(bodyOf(event));
    return json(
      201,
      await linkSharedFinanceBudgetItem(
        repository,
        await dependencies.actorFor(event),
        parameter(event, 'budgetId'),
        parameter(event, 'itemId'),
        input.expectedBudgetVersion,
        mutationId(event),
      ),
    );
  });
  registry.register('PATCH', '/api/v1/finance/budget-items/{budgetItemId}', async (event) => {
    const input = z
      .object({
        expectedVersion: z.number().int().positive(),
        description: z.string().trim().min(1).max(1000),
        plannedAmountMinor: z.number().int().safe(),
      })
      .strict()
      .parse(bodyOf(event));
    return json(
      200,
      await updateSharedFinanceBudgetItem(
        repository,
        await dependencies.actorFor(event),
        parameter(event, 'budgetItemId'),
        input,
        mutationId(event),
      ),
    );
  });
  registry.register('POST', '/api/v1/finance/budgets/{budgetId}/reconcile', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeBudgetReconciliationInputSchema.parse(bodyOf(event));
    const record = await reconcileFinanceBudget(
      repository,
      actor,
      parameter(event, 'budgetId'),
      {
        id: createUlid(),
        expectedVersion: input.expectedVersion,
      },
      mutationId(event),
      dependencies.now?.() ?? new Date(),
    );
    return json(201, record);
  });
  registry.register('POST', '/api/v1/finance/budget-items/{budgetItemId}/tasks', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeTaskCreateInputSchema.parse(bodyOf(event));
    await dependencies.validateAssignee?.(input.assigneeId);
    const requestMutationId = mutationId(event);
    const replay = repository.mutation(actor, requestMutationId);
    const result = createTaskFromFinanceBudgetItem(
      repository,
      actor,
      parameter(event, 'budgetItemId'),
      {
        taskId: createUlid(),
        ...(input.budgetId ? { budgetId: input.budgetId } : {}),
        linkId: createUlid(),
        label: input.label,
        assigneeId: input.assigneeId,
        ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      },
      requestMutationId,
      dependencies.now?.() ?? new Date(),
    );
    return json(replay ? 200 : 201, {
      taskId: result.taskId,
      financialTaskLinkId: result.financialTaskLinkId,
    });
  });
  registry.register('GET', '/api/v1/finance/reusable-items', async (event) => {
    const actor = await dependencies.actorFor(event);
    return json(200, listFinanceReusableItems(repository, actor, query(event, 'groupId')));
  });
  registry.register('POST', '/api/v1/finance/reusable-items', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeReusableItemInputSchema.parse(bodyOf(event));
    const item = await createFinanceReusableItem(
      repository,
      actor,
      {
        id: createUlid(),
        groupId: input.groupId,
        description: input.description,
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        financeCategoryId: input.financeCategoryId,
        plannedAmountMinor: input.plannedAmountMinor,
        currency: input.currency,
        currencyExponent: input.currencyExponent,
        relatedAccountIds: input.relatedAccountIds,
        ...(input.applicableDate ? { applicableDate: input.applicableDate } : {}),
        ...(input.recurrence
          ? {
              recurrence: {
                interval: input.recurrence.interval,
                unit: input.recurrence.unit,
                startDate: input.recurrence.startDate,
                ...(input.recurrence.endDate ? { endDate: input.recurrence.endDate } : {}),
              },
            }
          : {}),
      },
      mutationId(event),
    );
    return json(201, item);
  });
  registry.register('GET', '/api/v1/finance/budgets/{budgetId}/reusable-offers', async (event) => {
    const actor = await dependencies.actorFor(event);
    return json(200, {
      items: listReusableOffers(repository, actor, parameter(event, 'budgetId')),
    });
  });
  registry.register(
    'POST',
    '/api/v1/finance/budgets/{budgetId}/reusable-items/{reusableItemId}/copy',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = financeReusableCopyInputSchema.parse(bodyOf(event));
      const item = await copyReusableItemToBudget(
        repository,
        actor,
        parameter(event, 'budgetId'),
        parameter(event, 'reusableItemId'),
        input.occurrenceDate,
        input.budgetItemId ?? createUlid(),
        input.expectedBudgetVersion,
        mutationId(event),
      );
      return json(201, item);
    },
  );
  registry.register(
    'GET',
    '/api/v1/finance/transactions/{transactionId}/matches',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      return json(
        200,
        listFinanceTransactionMatches(repository, actor, parameter(event, 'transactionId')),
      );
    },
  );
  registry.register(
    'POST',
    '/api/v1/finance/transactions/{transactionId}/matches/evaluate',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const items = await evaluateFinanceTransactionMatches(
        repository,
        actor,
        parameter(event, 'transactionId'),
        createUlid,
        mutationId(event),
      );
      return json(200, { items });
    },
  );
  registry.register('POST', '/api/v1/finance/matches/{matchId}/decision', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeTransactionMatchDecisionSchema.parse(bodyOf(event));
    const args = [
      repository,
      actor,
      parameter(event, 'matchId'),
      input.expectedVersion,
      input.expectedTransactionVersion,
      mutationId(event),
    ] as const;
    const match =
      input.decision === 'accept'
        ? await acceptFinanceTransactionMatch(...args)
        : input.decision === 'reject'
          ? await rejectFinanceTransactionMatch(...args)
          : await undoFinanceTransactionMatch(...args);
    return json(200, match);
  });
  registry.register(
    'GET',
    '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const recordType = parameter(event, 'recordType');
      const recordId = parameter(event, 'recordId');
      const now = dependencies.now?.() ?? new Date();
      let preview;
      if (recordType === 'account') {
        const account = repository.accounts.get(recordId);
        if (!account) throw new Error('Finance record not found.');
        const references = accountDeletionReferences(repository, recordId);
        const hasReferences = hasDeletionReferences(references);
        preview = createAuthorizedDeletionPreview(actor, account.scope, {
          recordType,
          recordId,
          expectedVersion: account.version,
          // Budget relationships may belong to an inaccessible group.
          visibleDependentCounts: references.transactions
            ? { transactions: references.transactions }
            : {},
          hasReferences,
          isMistake: !hasReferences,
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else if (recordType === 'transaction') {
        const transaction = repository.transactions.find((item) => item.id === recordId);
        const account = transaction ? repository.accounts.get(transaction.accountId) : undefined;
        if (!transaction || !account) throw new Error('Finance record not found.');
        const references = transactionDeletionReferences(repository, transaction);
        const hasReferences = hasDeletionReferences(references);
        preview = createAuthorizedDeletionPreview(actor, account.scope, {
          recordType,
          recordId,
          expectedVersion: transaction.version,
          visibleDependentCounts: visibleDeletionCounts({
            allocations: references.allocations,
            merchant: references.merchant,
            transfer: references.transfer,
          }),
          hasReferences,
          isMistake: canPermanentlyDeleteTransaction(transaction, {
            hasReferences,
            isMistake: true,
          }),
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else if (recordType === 'budget') {
        const budget = repository.budgets.get(recordId);
        if (!budget) throw new Error('Finance record not found.');
        const scope = { type: 'group' as const, groupId: budget.groupId };
        if (!visible(actor, scope, 'delete')) throw new Error('Finance record not found.');
        const links = [...repository.budgetAccountLinks.values()].filter(
          (link) => link.budgetId === budget.id && link.status === 'active',
        );
        const items = itemsForBudget(repository, budget.id).filter(
          (item) => item.status === 'active',
        );
        const visibleLinks = links.filter((link) => {
          const account = repository.accounts.get(link.accountId);
          return account && visible(actor, account.scope);
        });
        const hasReferences = hasAdditionalDeletionReferences(repository, recordType, recordId);
        preview = createAuthorizedDeletionPreview(actor, scope, {
          recordType,
          recordId,
          expectedVersion: budget.version,
          visibleDependentCounts: {
            ...(visibleLinks.length ? { accountLinks: visibleLinks.length } : {}),
            ...(items.length ? { items: items.length } : {}),
          },
          hasReferences,
          isMistake: canPermanentlyDeleteBudget(budget, { hasReferences, isMistake: true }),
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else if (recordType === 'category') {
        const category = repository.categories.get(recordId);
        if (!category) throw new Error('Finance record not found.');
        archiveFinanceCategory(category, actor);
        const referencedTransactions = repository.transactions.filter((transaction) =>
          transaction.allocations.some(
            ({ financeCategoryId }) => financeCategoryId === category.id,
          ),
        );
        const referencedMerchants = [...repository.merchants.values()].filter(
          ({ financeCategoryId }) => financeCategoryId === category.id,
        );
        const visibleTransactions = referencedTransactions.filter((transaction) => {
          const account = repository.accounts.get(transaction.accountId);
          return account && visible(actor, account.scope);
        });
        const hasReferences = hasAdditionalDeletionReferences(repository, recordType, recordId);
        preview = createDeletionPreview({
          recordType,
          recordId,
          expectedVersion: category.version,
          visibleDependentCounts: {
            ...(visibleTransactions.length ? { transactions: visibleTransactions.length } : {}),
            ...(referencedMerchants.length ? { merchants: referencedMerchants.length } : {}),
          },
          hasReferences,
          isMistake: canPermanentlyDeleteFinanceCategory(category, actor, hasReferences, true),
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else if (recordType === 'merchant') {
        const merchant = repository.merchants.get(recordId);
        if (!merchant) throw new Error('Finance record not found.');
        archiveMerchant(merchant, actor);
        const references = repository.transactions.filter(
          ({ merchantId }) => merchantId === merchant.id,
        );
        const visibleReferences = references.filter((transaction) => {
          const account = repository.accounts.get(transaction.accountId);
          return account && visible(actor, account.scope);
        });
        const hasReferences = hasAdditionalDeletionReferences(repository, recordType, recordId);
        preview = createDeletionPreview({
          recordType,
          recordId,
          expectedVersion: merchant.version,
          visibleDependentCounts: visibleReferences.length
            ? { transactions: visibleReferences.length }
            : {},
          hasReferences,
          isMistake: canPermanentlyDeleteMerchant(merchant, actor, hasReferences, true),
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else if (recordType === 'reusable-item') {
        const reusable = repository.reusableItems.get(recordId);
        if (!reusable || !visible(actor, { type: 'group', groupId: reusable.groupId }, 'delete')) {
          throw new Error('Finance record not found.');
        }
        const copies = [...repository.budgetItems.values()].filter(
          ({ sourceReusableItemId }) => sourceReusableItemId === reusable.id,
        );
        preview = createAuthorizedDeletionPreview(
          actor,
          { type: 'group', groupId: reusable.groupId },
          {
            recordType,
            recordId,
            expectedVersion: reusable.version,
            visibleDependentCounts: copies.length ? { budgetItems: copies.length } : {},
            hasReferences: copies.length > 0,
            isMistake: copies.length === 0,
            now,
            signingSecret: dependencies.deletionSigningSecret,
          },
        );
      } else if (recordType === 'match') {
        const match = repository.transactionMatches.get(recordId);
        const transaction = match
          ? repository.transactions.find(({ id }) => id === match.transactionId)
          : undefined;
        const account = transaction ? repository.accounts.get(transaction.accountId) : undefined;
        if (!match || !account || !visible(actor, account.scope, 'delete')) {
          throw new Error('Finance record not found.');
        }
        preview = createAuthorizedDeletionPreview(actor, account.scope, {
          recordType,
          recordId,
          expectedVersion: match.version,
          visibleDependentCounts: match.status === 'accepted' ? { allocations: 1 } : {},
          hasReferences: match.status === 'accepted' || Boolean(match.decidedAt),
          isMistake: match.status === 'suggested',
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else if (recordType === 'task-link') {
        const link = repository.financialTaskLinks.get(recordId);
        const budget = link ? repository.budgets.get(link.budgetId) : undefined;
        if (!link || !budget) throw new Error('Finance record not found.');
        preview = createFinancialTaskLinkDeletionPreview({
          actor,
          groupId: budget.groupId,
          link,
          now,
          signingSecret: dependencies.deletionSigningSecret,
        });
      } else {
        throw new Error('Finance record not found.');
      }
      repository.deletionPreviews.set(preview.confirmationToken, preview);
      return json(200, preview);
    },
  );
  registry.register(
    'POST',
    '/api/v1/finance/records/{recordType}/{recordId}/deletion',
    async (event) => {
      const confirmation = financeDeletionConfirmationSchema.parse(bodyOf(event));
      const preview = repository.deletionPreviews.get(confirmation.confirmationToken);
      if (
        !preview ||
        preview.recordType !== parameter(event, 'recordType') ||
        preview.recordId !== parameter(event, 'recordId')
      ) {
        throw new Error('Finance record not found.');
      }
      const actor = await dependencies.actorFor(event);
      const account =
        preview.recordType === 'account'
          ? repository.accounts.get(preview.recordId)
          : preview.recordType === 'transaction'
            ? repository.accounts.get(
                repository.transactions.find((item) => item.id === preview.recordId)?.accountId ??
                  '',
              )
            : undefined;
      const budget =
        preview.recordType === 'budget' ? repository.budgets.get(preview.recordId) : undefined;
      const reusable =
        preview.recordType === 'reusable-item'
          ? repository.reusableItems.get(preview.recordId)
          : undefined;
      const match =
        preview.recordType === 'match'
          ? repository.transactionMatches.get(preview.recordId)
          : undefined;
      const taskLink =
        preview.recordType === 'task-link'
          ? repository.financialTaskLinks.get(preview.recordId)
          : undefined;
      if (
        (preview.recordType === 'account' || preview.recordType === 'transaction') &&
        (!account || !visible(actor, account.scope, 'delete'))
      )
        throw new Error('Finance record not found.');
      if (
        preview.recordType === 'budget' &&
        (!budget || !visible(actor, { type: 'group', groupId: budget.groupId }, 'delete'))
      ) {
        throw new Error('Finance record not found.');
      }
      if (
        preview.recordType === 'reusable-item' &&
        (!reusable || !visible(actor, { type: 'group', groupId: reusable.groupId }, 'delete'))
      ) {
        throw new Error('Finance record not found.');
      }
      if (preview.recordType === 'match') {
        const transaction = match
          ? repository.transactions.find(({ id }) => id === match.transactionId)
          : undefined;
        const matchAccount = transaction
          ? repository.accounts.get(transaction.accountId)
          : undefined;
        if (!match || !matchAccount || !visible(actor, matchAccount.scope, 'delete')) {
          throw new Error('Finance record not found.');
        }
      }
      if (preview.recordType === 'task-link') {
        const linkBudget = taskLink ? repository.budgets.get(taskLink.budgetId) : undefined;
        if (
          !taskLink ||
          !linkBudget ||
          !visible(actor, { type: 'group', groupId: linkBudget.groupId }, 'delete')
        ) {
          throw new Error('Finance record not found.');
        }
      }
      const result = executeDeletion(
        preview,
        confirmation,
        dependencies.now?.() ?? new Date(),
        dependencies.deletionSigningSecret,
      );
      if (
        result.outcome === 'permanent-delete' &&
        hasAdditionalDeletionReferences(repository, preview.recordType, preview.recordId)
      ) {
        throw new Error('Deletion preview is stale.');
      }
      // No await separates the state checks below from mutation in this repository.
      if (preview.recordType === 'account') {
        if (
          !account ||
          account.version !== preview.expectedVersion ||
          (result.outcome === 'permanent-delete' &&
            hasDeletionReferences(accountDeletionReferences(repository, account.id)))
        ) {
          throw new Error('Deletion preview is stale.');
        }
        if (result.outcome === 'permanent-delete') repository.accounts.delete(preview.recordId);
        else
          changeAccountLifecycle(
            repository,
            actor,
            preview.recordId,
            preview.expectedVersion,
            'archived',
          );
      } else if (preview.recordType === 'transaction') {
        const index = repository.transactions.findIndex((item) => item.id === preview.recordId);
        const transaction = repository.transactions[index];
        if (
          !transaction ||
          transaction.version !== preview.expectedVersion ||
          (result.outcome === 'permanent-delete' &&
            hasDeletionReferences(transactionDeletionReferences(repository, transaction)))
        ) {
          throw new Error('Deletion preview is stale.');
        }
        const archived =
          result.outcome === 'permanent-delete'
            ? undefined
            : archiveFinancialTransaction(transaction);
        const updatedAccount = accountAfterTransactionChange(account!, transaction, archived);
        if (result.outcome === 'permanent-delete') repository.transactions.splice(index, 1);
        else repository.transactions[index] = archived!;
        repository.accounts.set(updatedAccount.id, updatedAccount);
        markFinanceBudgetsChangedByTransaction(repository, transaction);
      } else if (preview.recordType === 'budget') {
        if (!budget || budget.version !== preview.expectedVersion)
          throw new Error('Deletion preview is stale.');
        if (result.outcome === 'permanent-delete') repository.budgets.delete(budget.id);
        else {
          repository.budgets.set(budget.id, archiveBudget(budget));
          invalidateBudgetTransactionSuggestions(repository, budget.id);
          for (const [id, item] of repository.budgetItems) {
            if (itemBudgetIds(repository, item).includes(budget.id) && item.status === 'active') {
              const remaining = itemBudgetIds(repository, item).filter((id) => id !== budget.id);
              repository.budgetItemMemberships.delete(`${budget.id}:${id}`);
              if (!remaining.length) repository.budgetItems.set(id, archiveBudgetItem(item));
            }
          }
        }
      } else if (preview.recordType === 'category') {
        const category = repository.categories.get(preview.recordId);
        if (!category || category.version !== preview.expectedVersion)
          throw new Error('Deletion preview is stale.');
        archiveFinanceCategory(category, actor);
        if (result.outcome === 'permanent-delete') {
          repository.categories.delete(category.id);
          if (repository.categoryNameLocks.get(category.canonicalName) === category.id) {
            repository.categoryNameLocks.delete(category.canonicalName);
          }
        } else repository.categories.set(category.id, archiveFinanceCategory(category, actor));
      } else if (preview.recordType === 'merchant') {
        const merchant = repository.merchants.get(preview.recordId);
        if (!merchant || merchant.version !== preview.expectedVersion)
          throw new Error('Deletion preview is stale.');
        archiveMerchant(merchant, actor);
        if (result.outcome === 'permanent-delete') {
          repository.merchants.delete(merchant.id);
          if (repository.merchantKeyLocks.get(merchant.canonicalKey) === merchant.id) {
            repository.merchantKeyLocks.delete(merchant.canonicalKey);
          }
        } else repository.merchants.set(merchant.id, archiveMerchant(merchant, actor));
      } else if (preview.recordType === 'reusable-item') {
        if (!reusable || reusable.version !== preview.expectedVersion)
          throw new Error('Deletion preview is stale.');
        if (result.outcome === 'permanent-delete') repository.reusableItems.delete(reusable.id);
        else repository.reusableItems.set(reusable.id, archiveReusableBudgetItem(reusable));
      } else if (preview.recordType === 'match') {
        if (!match || match.version !== preview.expectedVersion)
          throw new Error('Deletion preview is stale.');
        repository.transactionMatches.set(match.id, tombstoneTransactionMatch(match));
      } else if (preview.recordType === 'task-link') {
        removeAuthorizedFinancialTaskLink(
          repository,
          actor,
          preview.recordId,
          preview.expectedVersion,
          dependencies.now?.() ?? new Date(),
        );
      } else {
        throw new Error('Finance record not found.');
      }
      repository.deletionPreviews.delete(confirmation.confirmationToken);
      return json(200, result);
    },
  );
  registry.register('GET', '/api/v1/finance/connections', async (event) => {
    const actor = await dependencies.actorFor(event);
    const items = [...repository.connections.values()]
      .filter(
        (connection) =>
          connection.scope &&
          visible(actor, connection.scope as import('@naaseh/domain').FinanceScope, 'connect'),
      )
      .map((connection) => ({
        id: connection.id,
        scope: connection.scope,
        provider: connection.provider,
        status: connection.status,
        version: connection.version,
        lastSuccessfulAt: connection.lastSuccessfulAt,
      }));
    return json(200, { items });
  });
  registry.register('POST', '/api/v1/finance/connections/simplefin/claim', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = simplefinClaimInputSchema.parse(bodyOf(event));
    if (!visible(actor, input.scope, 'connect')) throw new Error('Finance record not found.');
    const connection = await claimSimplefinConnection(
      repository,
      {
        id: createUlid(),
        ...input,
        allowedHosts: dependencies.allowedSimplefinHosts,
        keyId: process.env.NAASEH_FINANCE_KMS_KEY_ARN ?? 'finance-local',
      },
      {
        ...(dependencies.kms ? { kms: dependencies.kms } : {}),
        ...(dependencies.fetcher ? { fetcher: dependencies.fetcher } : {}),
      },
    );
    return json(201, connection);
  });
  registry.register('POST', '/api/v1/finance/connections/{connectionId}/refresh', async (event) => {
    const actor = await dependencies.actorFor(event);
    const connectionId = parameter(event, 'connectionId');
    const connection = repository.connections.get(connectionId) as
      | { scope?: import('@naaseh/domain').FinanceScope }
      | undefined;
    if (!connection?.scope || !visible(actor, connection.scope, 'connect'))
      throw new Error('Finance record not found.');
    const receipt = repository.mutation<import('@naaseh/domain').ImportJob>(
      actor,
      mutationId(event),
    );
    if (receipt) return json(202, receipt);
    const job = await dispatchSimplefinRefresh(
      repository,
      connectionId,
      createUlid(),
      dependencies.now?.() ?? new Date(),
      dependencies.lambda,
      dependencies.importFunctionName,
    );
    return json(202, repository.remember(actor.id, mutationId(event), job));
  });
  registry.register('GET', '/api/v1/finance/import-jobs/{jobId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const job = repository.importJobs.get(parameter(event, 'jobId'));
    const connection = job
      ? (repository.connections.get(job.connectionId) as
          | { scope?: import('@naaseh/domain').FinanceScope }
          | undefined)
      : undefined;
    if (!job || !connection?.scope || !visible(actor, connection.scope))
      throw new Error('Finance record not found.');
    return json(200, job);
  });
  return registry;
}
