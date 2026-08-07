import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { type ContentActor, type PersonalStackScope, type WorkReference } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
import { listProjectedWork } from '../reporting/work-view-repository.js';
import {
  dynamoStackCompactionRepository,
  type StackCompactionMetadata,
  type StackCompactionRepository,
} from './stack-compactor.js';
import {
  buildStackAcceptanceTransaction,
  prepareStackOperationRecords,
  recoverCanonicalStack,
  type PreparedStackSnapshot,
} from './stack-repository.js';
import {
  createPersonalStackService,
  type EligibleStackWork,
  type PersonalStackCommitInput,
  type PersonalStackReorderResult,
  type PersonalStackServiceRepository,
} from './stack-service.js';

export interface DurableStackStore {
  loadMetadata(scope: PersonalStackScope): Promise<StackCompactionMetadata | undefined>;
  loadSnapshot(
    scope: PersonalStackScope,
    generation: number,
    throughVersion: number,
  ): Promise<PreparedStackSnapshot | undefined>;
  loadOperations(
    scope: PersonalStackScope,
    throughVersion: number,
  ): Promise<Array<Record<string, unknown>>>;
  loadReceipt(userId: string, mutationId: string): Promise<Record<string, unknown> | undefined>;
  loadOwnerFeedSequence(userId: string): Promise<number>;
  transact(items: NonNullable<TransactWriteCommandInput['TransactItems']>): Promise<void>;
}

const conditionalFailure = (error: unknown) => {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException';
};

const resultFromReceipt = (
  value: Record<string, unknown> | undefined,
): PersonalStackReorderResult | undefined => {
  if (!value) return undefined;
  const status = value.status;
  const stackVersion = Number(value.stackVersion ?? value.version);
  if (
    (status !== 'applied' &&
      status !== 'pending_compaction' &&
      status !== 'conflict' &&
      status !== 'rejected') ||
    !Number.isSafeInteger(stackVersion) ||
    stackVersion < 0
  )
    return undefined;
  return {
    status,
    stackVersion,
    ...(typeof value.reason === 'string'
      ? { reason: value.reason as PersonalStackReorderResult['reason'] }
      : {}),
  };
};

const addTableName = (
  items: readonly Record<string, Record<string, unknown> | undefined>[],
): NonNullable<TransactWriteCommandInput['TransactItems']> =>
  items.map((item) => ({
    ...(item.Put ? { Put: { ...item.Put, TableName: tableName } } : {}),
    ...(item.Update ? { Update: { ...item.Update, TableName: tableName } } : {}),
    ...(item.Delete ? { Delete: { ...item.Delete, TableName: tableName } } : {}),
    ...(item.ConditionCheck
      ? { ConditionCheck: { ...item.ConditionCheck, TableName: tableName } }
      : {}),
  })) as NonNullable<TransactWriteCommandInput['TransactItems']>;

export function createDurableStackRepository(
  store: DurableStackStore,
): PersonalStackServiceRepository {
  return {
    async loadScope(scope, eligible = []) {
      const metadata = await store.loadMetadata(scope);
      if (!metadata) return { version: 0, order: [] };
      const [snapshot, operations] = await Promise.all([
        metadata.currentSnapshotGeneration
          ? store.loadSnapshot(
              scope,
              metadata.currentSnapshotGeneration,
              metadata.snapshotThroughVersion,
            )
          : Promise.resolve(undefined),
        store.loadOperations(scope, metadata.version),
      ]);
      const recovered = recoverCanonicalStack({
        scope,
        baseMembership: [...eligible],
        ...(snapshot ? { snapshot } : {}),
        operations,
      });
      if (Number(recovered.throughVersion) !== metadata.version)
        throw new Error('Personal stack recovery did not reach the stored version.');
      return { version: metadata.version, order: recovered.workRefs };
    },

    async findMutation(userId, mutationId) {
      return resultFromReceipt(await store.loadReceipt(userId, mutationId));
    },

    async commit(input: PersonalStackCommitInput) {
      try {
        if (!input.move) {
          await store.transact([
            {
              ConditionCheck: {
                TableName: tableName,
                Key: keys.personalStackMetadata(input.scope),
                ConditionExpression:
                  '(attribute_not_exists(#version) AND :expected=:zero) OR #version=:expected',
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: {
                  ':expected': input.expectedVersion,
                  ':zero': 0,
                },
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...keys.personalStackMutationReceipt(input.scope.userId, input.mutationId),
                  data: {
                    mutationId: input.mutationId,
                    status: input.result.status,
                    stackVersion: input.result.stackVersion,
                    ...(input.result.reason ? { reason: input.result.reason } : {}),
                  },
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ]);
          return true;
        }

        const acceptedAt = input.acceptedAt ?? new Date().toISOString();
        const affectedWork =
          input.move.kind === 'filtered_permutation'
            ? input.move.affectedWork
            : [input.move.movedWork];
        const operation = {
          id: input.mutationId,
          mutationId: input.mutationId,
          userId: input.scope.userId,
          scopeType: input.scope.scopeType,
          ...(input.scope.scopeType === 'project' ? { scopeId: input.scope.scopeId } : {}),
          baseVersion: input.expectedVersion,
          version: input.next.version,
          ...input.move,
          affectedCount: affectedWork.length,
          sourceClientId: input.sourceClientId ?? 'unknown',
          acceptedAt,
          outcome: input.result.status,
        };
        const prepared = prepareStackOperationRecords({
          scope: input.scope,
          operation,
          affectedWork,
        });
        const expectedOwnerFeedSequence = await store.loadOwnerFeedSequence(input.scope.userId);
        const transaction = buildStackAcceptanceTransaction({
          scope: input.scope,
          expectedVersion: input.expectedVersion,
          prepared,
          expectedOwnerFeedSequence,
        });
        await store.transact(
          addTableName(
            transaction.TransactItems as unknown as readonly Record<
              string,
              Record<string, unknown> | undefined
            >[],
          ),
        );
        return true;
      } catch (error) {
        if (conditionalFailure(error)) return false;
        throw error;
      }
    },
  };
}

const dynamoStore: DurableStackStore = {
  loadMetadata: (scope) => dynamoStackCompactionRepository.loadMetadata(scope),
  loadSnapshot: (scope, generation, throughVersion) =>
    dynamoStackCompactionRepository.loadSnapshot(scope, generation, throughVersion),
  loadOperations: (scope, throughVersion) =>
    dynamoStackCompactionRepository.loadCanonicalOperations(scope, throughVersion),
  async loadReceipt(userId, mutationId) {
    const response = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.personalStackMutationReceipt(userId, mutationId),
        ConsistentRead: true,
      }),
    );
    return response.Item?.data as Record<string, unknown> | undefined;
  },
  async loadOwnerFeedSequence(userId) {
    const response = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.personalStackOwnerFeedCounter(userId),
        ConsistentRead: true,
      }),
    );
    return Number(response.Item?.sequence ?? 0);
  },
  transact: (items) =>
    dynamodb.send(new TransactWriteCommand({ TransactItems: items })).then(() => undefined),
};

export async function listEligibleStackWork(
  scope: PersonalStackScope,
  actor: ContentActor = {
    id: scope.userId,
    role: 'user',
    active: true,
    groupIds: [],
  },
): Promise<EligibleStackWork[]> {
  const projected = await listProjectedWork({
    actor,
    lifecycle: 'active',
    ...(scope.scopeType === 'project'
      ? { scopeType: 'project' as const, scopeId: scope.scopeId }
      : {}),
  });
  return [
    ...projected.tasks.map((work) => ({
      workType: 'task' as const,
      workId: work.id,
      membershipEpoch: `${String(work.version).padStart(12, '0')}:${work.updatedAt}`,
      urgency: work.urgency,
      projectId: work.projectId,
      categoryId: work.categoryId,
      assigneeId: work.assigneeId,
      dueDate: work.dueAt?.slice(0, 10),
      lifecycle: work.lifecycle ?? (work.status === 'open' ? 'active' : work.status),
      active: true,
      authorized: true,
    })),
    ...projected.lists.map((work) => ({
      workType: 'list' as const,
      workId: work.id,
      membershipEpoch: `${String(work.version).padStart(12, '0')}:${work.updatedAt}`,
      urgency: work.urgency,
      projectId: work.projectId,
      lifecycle: work.lifecycle ?? (work.status === 'active' ? 'active' : 'archived'),
      active: true,
      authorized: true,
    })),
  ];
}

export const durablePersonalStackRepository = createDurableStackRepository(dynamoStore);

export const defaultPersonalStackService = createPersonalStackService({
  repository: durablePersonalStackRepository,
  listEligibleWork: listEligibleStackWork,
  shouldMarkPendingCompaction: ({ nextVersion, move }) =>
    move.kind === 'filtered_permutation' || nextVersion % 20 === 0,
});

const lambda = new LambdaClient({});

export async function dispatchStackCompaction(scope: PersonalStackScope, actor: ContentActor) {
  const functionName = process.env.STACK_COMPACTOR_FUNCTION_NAME;
  if (!functionName) throw new Error('Stack compactor function is not configured.');
  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ scope, actor })),
    }),
  );
}

export function compactionMembershipRepository(actor: ContentActor): StackCompactionRepository {
  return {
    ...dynamoStackCompactionRepository,
    async loadMembership(scope) {
      return (await listEligibleStackWork(scope, actor)).map(
        ({ workType, workId, membershipEpoch }): WorkReference => ({
          workType,
          workId,
          membershipEpoch,
        }),
      );
    },
  };
}
