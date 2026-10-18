import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { List, ListItem } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
import { feedTransactionItems } from '../shared/store.js';
import { prepareAudienceChanges } from '../sync/change-feed-repository.js';
import { movedListItemAudienceChanges } from './list-audience.js';
import { findListItem } from './list-repository.js';

const transitionBatchSize = 40;
const maxBatchesPerRequest = 5;
const transitionTtlSeconds = 2_592_000;

export interface ListAudienceTransitionItemReference {
  id: string;
  version: number;
  updatedAt: string;
}

export interface ListAudienceTransition {
  PK: string;
  SK: 'TRANSITION';
  mutationId: string;
  actorId: string;
  listId: string;
  expectedVersion: number;
  previous: List;
  next: List;
  items: ListAudienceTransitionItemReference[];
  nextIndex: number;
  status: 'pending' | 'complete';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
}

const transitionKey = (actorId: string, mutationId: string) => ({
  PK: `LISTTRANSITION#${actorId}#${mutationId}`,
  SK: 'TRANSITION' as const,
});

const pointerKey = (listId: string) => ({
  PK: `LIST#${listId}`,
  SK: 'AUDIENCE_TRANSITION' as const,
});

export function createListAudienceTransition(
  previous: List,
  next: List,
  actorId: string,
  mutationId: string,
  items: readonly ListItem[],
  now = new Date(),
): { transition: ListAudienceTransition; records: Record<string, unknown>[] } {
  const timestamp = now.toISOString();
  const transition: ListAudienceTransition = {
    ...transitionKey(actorId, mutationId),
    mutationId,
    actorId,
    listId: next.id,
    expectedVersion: previous.version,
    previous,
    next,
    items: items
      .filter((item) => item.status !== 'removed')
      .map(({ id, version, updatedAt }) => ({ id, version, updatedAt })),
    nextIndex: 0,
    status: 'pending',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: Math.floor(now.getTime() / 1000) + transitionTtlSeconds,
  };
  return {
    transition,
    records: [
      { ...transition },
      {
        ...pointerKey(next.id),
        mutationId,
        actorId,
        status: 'pending',
        expiresAt: transition.expiresAt,
      },
    ],
  };
}

export async function findListAudienceTransition(actorId: string, mutationId: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: transitionKey(actorId, mutationId),
      ConsistentRead: true,
    }),
  );
  return result.Item as ListAudienceTransition | undefined;
}

export async function findPendingListAudienceTransition(listId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: pointerKey(listId), ConsistentRead: true }),
  );
  return result.Item as { mutationId: string; actorId: string; status: 'pending' } | undefined;
}

async function commitChunk(
  transition: ListAudienceTransition,
  feedChanges: Awaited<ReturnType<typeof prepareAudienceChanges>>,
  nextIndex: number,
) {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        ...feedTransactionItems(feedChanges),
        {
          Update: {
            TableName: tableName,
            Key: transitionKey(transition.actorId, transition.mutationId),
            UpdateExpression:
              'SET #nextIndex=:next, #updatedAt=:updatedAt, #attempts=#attempts+:one',
            ConditionExpression: '#nextIndex=:expected AND #status=:pending',
            ExpressionAttributeNames: {
              '#nextIndex': 'nextIndex',
              '#updatedAt': 'updatedAt',
              '#attempts': 'attempts',
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':next': nextIndex,
              ':expected': transition.nextIndex,
              ':updatedAt': new Date().toISOString(),
              ':one': 1,
              ':pending': 'pending',
            },
          },
        },
      ],
    }),
  );
}

async function completeTransition(transition: ListAudienceTransition) {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName,
            Key: transitionKey(transition.actorId, transition.mutationId),
            UpdateExpression: 'SET #status=:complete, #updatedAt=:updatedAt',
            ConditionExpression: '#nextIndex=:total AND #status=:pending',
            ExpressionAttributeNames: {
              '#nextIndex': 'nextIndex',
              '#status': 'status',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':total': transition.items.length,
              ':pending': 'pending',
              ':complete': 'complete',
              ':updatedAt': new Date().toISOString(),
            },
          },
        },
        {
          Delete: {
            TableName: tableName,
            Key: pointerKey(transition.listId),
            ConditionExpression: '#mutationId=:mutationId',
            ExpressionAttributeNames: { '#mutationId': 'mutationId' },
            ExpressionAttributeValues: { ':mutationId': transition.mutationId },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: keys.mutation(transition.actorId, transition.mutationId),
            UpdateExpression: 'SET #data.#status=:applied',
            ConditionExpression: '#data.#status=:retry',
            ExpressionAttributeNames: { '#data': 'data', '#status': 'status' },
            ExpressionAttributeValues: { ':retry': 'retry', ':applied': 'applied' },
          },
        },
      ],
    }),
  );
}

export async function resumeListAudienceTransition(initial: ListAudienceTransition) {
  let transition = initial;
  let batches = 0;
  while (
    transition.status === 'pending' &&
    transition.nextIndex < transition.items.length &&
    batches < maxBatchesPerRequest
  ) {
    const references = transition.items.slice(
      transition.nextIndex,
      transition.nextIndex + transitionBatchSize,
    );
    const currentItems = await Promise.all(references.map(({ id }) => findListItem(id)));
    const intents = references.flatMap((reference, index) => {
      const current = currentItems[index];
      const item =
        current?.listId === transition.listId
          ? current
          : {
              ...reference,
              status: 'removed' as const,
            };
      return movedListItemAudienceChanges(transition.previous, transition.next, item, item);
    });
    const feedChanges = await prepareAudienceChanges(intents);
    const nextIndex = transition.nextIndex + references.length;
    await commitChunk(transition, feedChanges, nextIndex);
    transition = { ...transition, nextIndex, attempts: transition.attempts + 1 };
    batches += 1;
  }
  if (transition.status === 'pending' && transition.nextIndex === transition.items.length) {
    await completeTransition(transition);
    transition = { ...transition, status: 'complete' };
  }
  return transition;
}

export const listAudienceTransitionLimits = {
  batchSize: transitionBatchSize,
  maxBatchesPerRequest,
} as const;
