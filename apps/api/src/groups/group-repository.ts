import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { GroupMembership, GroupRecord } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { prepareAudienceChange } from '../sync/change-feed-repository.js';
import type { SyncChange } from '@naaseh/domain';

const groupKey = (groupId: string) => ({ PK: `GROUP#${groupId}`, SK: 'GROUP' });
const groupMemberKey = (groupId: string, userId: string) => ({
  PK: `GROUP#${groupId}`,
  SK: `MEMBER#${userId}`,
});
const userGroupKey = (userId: string, groupId: string) => ({
  PK: `USER#${userId}`,
  SK: `GROUP#${groupId}`,
});

function membershipItem(key: { PK: string; SK: string }, membership: GroupMembership) {
  return { ...key, data: membership };
}

export function buildCreateGroupTransaction(
  group: GroupRecord,
  owner: GroupMembership,
): TransactWriteCommandInput {
  return {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: {
            ...groupKey(group.id),
            GSI1PK: 'GROUP#ACTIVE',
            GSI1SK: `${group.name.toLocaleLowerCase()}#${group.id}`,
            data: group,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...[groupMemberKey(group.id, owner.userId), userGroupKey(owner.userId, group.id)].map(
        (key) => ({
          Put: {
            TableName: tableName,
            Item: membershipItem(key, owner),
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        }),
      ),
    ],
  };
}

export function buildJoinGroupTransaction(membership: GroupMembership): TransactWriteCommandInput {
  return {
    TransactItems: [
      groupMemberKey(membership.groupId, membership.userId),
      userGroupKey(membership.userId, membership.groupId),
    ].map((key) => ({
      Put: {
        TableName: tableName,
        Item: membershipItem(key, membership),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    })),
  };
}

export function buildRevokeMembershipTransaction(
  membership: GroupMembership,
  revokedAt = new Date().toISOString(),
): TransactWriteCommandInput {
  const revoked = {
    ...membership,
    status: 'revoked' as const,
    revokedAt,
    version: membership.version + 1,
  };
  return {
    TransactItems: [
      groupMemberKey(membership.groupId, membership.userId),
      userGroupKey(membership.userId, membership.groupId),
    ].map((key) => ({
      Put: {
        TableName: tableName,
        Item: membershipItem(key, revoked),
        ConditionExpression: '#data.#version=:expected',
        ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
        ExpressionAttributeValues: { ':expected': membership.version },
      },
    })),
  };
}

export function buildUpdateMembershipTransaction(
  current: GroupMembership,
  next: GroupMembership,
): TransactWriteCommandInput {
  return {
    TransactItems: [
      groupMemberKey(next.groupId, next.userId),
      userGroupKey(next.userId, next.groupId),
    ].map((key) => ({
      Put: {
        TableName: tableName,
        Item: membershipItem(key, next),
        ConditionExpression: '#data.#version=:expected',
        ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
        ExpressionAttributeValues: { ':expected': current.version },
      },
    })),
  };
}

export const putGroupWithOwner = (group: GroupRecord, owner: GroupMembership) =>
  dynamodb.send(new TransactWriteCommand(buildCreateGroupTransaction(group, owner)));
export const putMembership = (membership: GroupMembership) =>
  dynamodb.send(new TransactWriteCommand(buildJoinGroupTransaction(membership)));
export async function revokeMembership(
  membership: GroupMembership,
  accessChange?: Omit<SyncChange, 'sequence'>,
) {
  const transaction = buildRevokeMembershipTransaction(membership);
  if (accessChange) {
    const prepared = await prepareAudienceChange(accessChange);
    transaction.TransactItems?.push(
      {
        Update: {
          TableName: tableName,
          Key: { PK: `FEED#${accessChange.audience}`, SK: 'COUNTER' },
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
            PK: `FEED#${accessChange.audience}`,
            SK: `CHANGE#${String(prepared.change.sequence).padStart(20, '0')}`,
            data: prepared.change,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    );
  }
  return dynamodb.send(new TransactWriteCommand(transaction));
}
export const updateMembership = (current: GroupMembership, next: GroupMembership) =>
  dynamodb.send(new TransactWriteCommand(buildUpdateMembershipTransaction(current, next)));

export async function listMemberships(groupId: string) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK=:pk AND begins_with(SK,:member)',
      ExpressionAttributeValues: { ':pk': `GROUP#${groupId}`, ':member': 'MEMBER#' },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as GroupMembership);
}

export async function listUserMemberships(userId: string) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK=:pk AND begins_with(SK,:group)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':group': 'GROUP#' },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as GroupMembership);
}

export async function getMembership(groupId: string, userId: string) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: groupMemberKey(groupId, userId),
      ConsistentRead: true,
    }),
  );
  return result.Item?.data as GroupMembership | undefined;
}

export async function listActiveGroups() {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk',
      ExpressionAttributeValues: { ':pk': 'GROUP#ACTIVE' },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as GroupRecord);
}

export async function getGroup(groupId: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: groupKey(groupId), ConsistentRead: true }),
  );
  return result.Item?.data as GroupRecord | undefined;
}
