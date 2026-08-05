import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { SyncChange } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';

export interface PreparedFeedChange {
  change: SyncChange;
  expectedSequence: number;
}

export interface PersonalStackFeedChange {
  audience: string;
  sequence: number;
  entityId: string;
  entityType: 'personalStackOperation';
  version?: number;
  operation: 'upsert';
  payload: {
    operationId: string;
    status?: 'applied' | 'pending_compaction' | 'conflict' | 'rejected';
    scope?: 'overall' | 'project';
    projectId?: string;
  };
  changedAt?: string;
}

export type SyncFeedChange = SyncChange | PersonalStackFeedChange;

const rankFields = new Set([
  'rank',
  'overallRank',
  'projectRank',
  'overallPosition',
  'projectPosition',
  'stackPosition',
]);

export function assertFeedChangePrivacy(change: SyncFeedChange) {
  if (change.entityType !== 'personalStackOperation') return;
  if (!change.audience.startsWith('OWNER#'))
    throw new Error('Personal stack operations may only use an owner feed.');
  if (Object.keys(change.payload).some((field) => rankFields.has(field)))
    throw new Error('Personal rank values cannot be serialized into synchronization feeds.');
}

export function deserializeAudienceFeedItems(
  audience: string,
  items: Array<{ SK?: unknown; data?: unknown }>,
): SyncFeedChange[] {
  const changes: SyncFeedChange[] = [];
  for (const item of items) {
    const data = item.data as Record<string, unknown> | undefined;
    if (data?.entityType !== 'personalStackOperation') {
      changes.push(data as unknown as SyncChange);
      continue;
    }
    if (!audience.startsWith('OWNER#')) continue;
    const operationId = String(data.operationId ?? data.entityId ?? '');
    if (!operationId) throw new Error('Owner stack feed record has no operation identifier.');
    const sequence = Number(data.sequence ?? String(item.SK ?? '').slice('CHANGE#'.length));
    if (!Number.isSafeInteger(sequence) || sequence < 1)
      throw new Error('Owner stack feed record has an invalid sequence.');
    const statuses = ['applied', 'pending_compaction', 'conflict', 'rejected'] as const;
    const status = statuses.find((candidate) => candidate === data.status);
    const payload: PersonalStackFeedChange['payload'] = {
      operationId,
      ...(status ? { status } : {}),
      ...(data.scope === 'overall' || data.scope === 'project' ? { scope: data.scope } : {}),
      ...(typeof data.projectId === 'string' ? { projectId: data.projectId } : {}),
    };
    const change: PersonalStackFeedChange = {
      audience,
      sequence,
      entityId: operationId,
      entityType: 'personalStackOperation',
      ...(typeof data.version === 'number' ? { version: data.version } : {}),
      operation: 'upsert',
      payload,
      ...(typeof data.changedAt === 'string' ? { changedAt: data.changedAt } : {}),
    };
    assertFeedChangePrivacy(change);
    changes.push(change);
  }
  return changes;
}

export const feedAudience = {
  public: () => 'PUBLIC',
  owner: (ownerId: string) => `OWNER#${ownerId}`,
  group: (groupId: string) => `GROUP#${groupId}`,
  administrator: (shard: number) => `ADMIN#${shard}`,
  accessControl: (userId: string) => `ACCESS#${userId}`,
} as const;

export function administratorShard(entityId: string, shardCount = 16): number {
  if (!Number.isInteger(shardCount) || shardCount < 1) throw new Error('Invalid shard count');
  let hash = 2166136261;
  for (const character of entityId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % shardCount;
}

export function contentAudiences(input: {
  entityId: string;
  ownerId: string;
  groupId?: string;
  locked?: boolean;
  administratorShards?: number;
}): string[] {
  const audiences = [
    input.locked
      ? feedAudience.owner(input.ownerId)
      : input.groupId
        ? feedAudience.group(input.groupId)
        : feedAudience.public(),
    feedAudience.administrator(administratorShard(input.entityId, input.administratorShards)),
  ];
  return [...new Set(audiences)];
}

/**
 * Read the counter used by the subsequent task transaction. The transaction
 * conditionally advances this exact value while writing the feed item, so a
 * concurrent writer can create a harmless retry but never an invisible gap.
 */
export async function prepareAudienceChange(
  change: Omit<SyncChange, 'sequence'>,
): Promise<PreparedFeedChange> {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `FEED#${change.audience}`, SK: 'COUNTER' },
      ConsistentRead: true,
    }),
  );
  const expectedSequence = Number(result.Item?.value ?? 0);
  return { expectedSequence, change: { ...change, sequence: expectedSequence + 1 } };
}

export async function pullAudience(
  audience: string,
  after: number,
  limit = 200,
): Promise<SyncFeedChange[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND SK > :after',
      ExpressionAttributeValues: {
        ':pk': `FEED#${audience}`,
        ':after': `CHANGE#${String(after).padStart(20, '0')}`,
      },
      Limit: limit,
    }),
  );
  return deserializeAudienceFeedItems(audience, result.Items ?? []);
}
export async function appendAudienceChange(change: Omit<SyncChange, 'sequence'>) {
  const prepared = await prepareAudienceChange(change);
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName,
            Key: { PK: `FEED#${change.audience}`, SK: 'COUNTER' },
            UpdateExpression: 'SET #value=:next',
            ConditionExpression: 'attribute_not_exists(#value) OR #value=:expected',
            ExpressionAttributeNames: { '#value': 'value' },
            ExpressionAttributeValues: {
              ':next': prepared.change.sequence,
              ':expected': prepared.expectedSequence,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              PK: `FEED#${change.audience}`,
              SK: `CHANGE#${String(prepared.change.sequence).padStart(20, '0')}`,
              data: prepared.change,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    }),
  );
  return prepared.change;
}
