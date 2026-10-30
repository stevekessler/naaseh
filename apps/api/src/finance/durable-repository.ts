import { encodeFinanceValue as encode, decodeFinanceValue as decode } from './storage-codec.js';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { createUlid, taskRevisionSchema, type Task } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { buildTaskTransaction, feedTransactionItems } from '../shared/store.js';
import { prepareAudienceChanges } from '../sync/change-feed-repository.js';
import { notifyStackMembershipWorkChange } from '../ranking/stack-membership-lifecycle.js';
import { taskProjectionWrites } from '../tasks/task-repository.js';
import { privacyFeedChanges, administratorTaskFeedChange } from '../tasks/privacy-transition.js';
import { FinanceMemoryRepository } from './repository.js';

const partition = 'FINANCE#RECORDS';
const clockKey = { PK: partition, SK: 'CLOCK' };
type Writes = NonNullable<TransactWriteCommandInput['TransactItems']>;
export type FinanceDocumentClient = Pick<typeof dynamodb, 'send'>;

function rows(repository: FinanceMemoryRepository) {
  const values = new Map<string, string>();
  for (const [collection, value] of Object.entries(repository)) {
    if (collection === 'feedChanges') continue;
    const entries =
      value instanceof Map
        ? [...value.entries()]
        : value instanceof Set
          ? [...value].map((item) => [String(item), item])
          : Array.isArray(value)
            ? value.map((item) => [String((item as { id: string }).id), item])
            : [];
    for (const [id, record] of entries)
      values.set(`RECORD#${collection}#${encodeURIComponent(String(id))}`, encode(record));
  }
  return values;
}

/** Per-record canonical storage. A scalar epoch fences complete read sets and reference checks;
 * no application-wide serialized snapshot or Lambda-local cache is used for durability. */
export class DynamoFinanceRepository {
  constructor(private readonly client: FinanceDocumentClient = dynamodb) {}

  async load(collections?: readonly string[], receiptKey?: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const first = await this.clock();
      const repository = new FinanceMemoryRepository();
      for (const prefix of collections?.map((name) => `RECORD#${name}#`) ?? ['RECORD#']) {
        let cursor: Record<string, unknown> | undefined;
        do {
          const page = await this.client.send(
            new QueryCommand({
              TableName: tableName,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
              ExpressionAttributeValues: { ':pk': partition, ':prefix': prefix },
              ConsistentRead: true,
              ...(cursor ? { ExclusiveStartKey: cursor } : {}),
            }),
          );
          for (const row of page.Items ?? []) {
            const [, collection, encodedId] = String(row.SK).split('#');
            const target = (repository as unknown as Record<string, unknown>)[collection!];
            const value = decode(String(row.value));
            if (target instanceof Map) target.set(decodeURIComponent(encodedId!), value);
            else if (target instanceof Set) target.add(value);
            else if (Array.isArray(target)) target.push(value);
            else throw new Error('Unsupported persisted Finance collection.');
          }
          cursor = page.LastEvaluatedKey;
        } while (cursor);
      }
      if (receiptKey) {
        const result = await this.client.send(
          new GetCommand({
            TableName: tableName,
            Key: { PK: partition, SK: `RECORD#mutationReceipts#${encodeURIComponent(receiptKey)}` },
            ConsistentRead: true,
          }),
        );
        if (result.Item)
          repository.mutationReceipts.set(receiptKey, decode(String(result.Item.value)));
      }
      if ((await this.clock()) !== first) continue;
      // Read task policy from the ordinary task store rather than a stale Finance projection.
      for (const id of repository.tasks.keys()) {
        const result = await this.client.send(
          new GetCommand({
            TableName: tableName,
            Key: { PK: `TASK#${id}`, SK: 'CURRENT' },
            ConsistentRead: true,
          }),
        );
        if (result.Item?.data) repository.tasks.set(id, result.Item.data as Task);
        else repository.tasks.delete(id);
      }
      return new FinanceUnitOfWork(this.client, repository, first);
    }
    throw new Error('Finance read version conflict.');
  }
  async clock() {
    const result = await this.client.send(
      new GetCommand({ TableName: tableName, Key: clockKey, ConsistentRead: true }),
    );
    return Number(result.Item?.version ?? 0);
  }
}

export class FinanceUnitOfWork {
  private before: Map<string, string>;
  constructor(
    private readonly client: FinanceDocumentClient,
    readonly repository: FinanceMemoryRepository,
    public version: number,
  ) {
    this.before = rows(repository);
  }
  async commit() {
    const after = rows(this.repository);
    const changes: Writes = [];
    for (const [key, value] of after) {
      if (this.before.get(key) === value) continue;
      if (Buffer.byteLength(value) > 350_000)
        throw new Error('Finance record exceeds the storage limit.');
      changes.push({
        Put: {
          TableName: tableName,
          Item: { PK: partition, SK: key, value },
          ...(!this.before.has(key) ? { ConditionExpression: 'attribute_not_exists(PK)' } : {}),
        },
      });
    }
    for (const key of this.before.keys())
      if (!after.has(key))
        changes.push({ Delete: { TableName: tableName, Key: { PK: partition, SK: key } } });
    if (!changes.length && !this.repository.feedChanges.length) return;
    const taskChanges = this.repository.feedChanges.filter(
      (change) => change.entityType === 'task',
    );
    const intents = this.repository.feedChanges.filter((change) => change.entityType !== 'task');
    for (const change of taskChanges) {
      const task = change.payload as Task;
      intents.push(...privacyFeedChanges(undefined, task), administratorTaskFeedChange(task));
    }
    const feeds = await prepareAudienceChanges(intents);
    for (const change of taskChanges) {
      const task = change.payload as Task;
      const prior = this.before.get(`RECORD#tasks#${encodeURIComponent(task.id)}`);
      if (prior) throw new Error('Finance cannot overwrite an ordinary task.');
      const revision = {
        id: createUlid(),
        taskId: task.id,
        version: task.version,
        actorId: task.ownerId,
        operation: 'create',
        changedFields: ['label', 'assigneeId'],
        changedAt: task.updatedAt,
        after: { label: task.label, assigneeId: task.assigneeId },
        syncOutcome: 'applied',
      };
      const validatedRevision = taskRevisionSchema.parse(revision);
      changes.push(
        ...(buildTaskTransaction(
          task,
          validatedRevision,
          createUlid(),
          [],
          [
            ...taskProjectionWrites(task),
            {
              ConditionCheck: {
                TableName: tableName,
                Key: { PK: `USER#${task.assigneeId}`, SK: 'PROFILE' },
                ConditionExpression: '#data.#active = :active',
                ExpressionAttributeNames: { '#data': 'data', '#active': 'active' },
                ExpressionAttributeValues: { ':active': true },
              },
            },
          ],
        ).TransactItems ?? []),
      );
    }
    changes.push(...feedTransactionItems(feeds));
    changes.unshift({
      Put: {
        TableName: tableName,
        Item: { ...clockKey, version: this.version + 1 },
        ConditionExpression: 'attribute_not_exists(PK) OR #version = :expected',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':expected': this.version },
      },
    });
    if (changes.length > 100) throw new Error('Finance command exceeds the transaction limit.');
    await this.client.send(new TransactWriteCommand({ TransactItems: changes }));
    this.version += 1;
    this.before = after;
    this.repository.feedChanges.length = 0;
    for (const change of taskChanges)
      notifyStackMembershipWorkChange('task', undefined, change.payload as Task, 'create');
  }
}
