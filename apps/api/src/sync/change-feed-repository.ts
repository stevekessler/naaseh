import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { SyncChange } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';

export interface PreparedFeedChange {
  change: SyncChange;
  expectedSequence: number;
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
    feedAudience.owner(input.ownerId),
    feedAudience.administrator(administratorShard(input.entityId, input.administratorShards)),
  ];
  if (!input.locked)
    audiences.push(input.groupId ? feedAudience.group(input.groupId) : feedAudience.public());
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
): Promise<SyncChange[]> {
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
  return (result.Items ?? []).map((item) => item.data as SyncChange);
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
