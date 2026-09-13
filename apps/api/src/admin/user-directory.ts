import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { createProfilePictureReadUrl } from './profile-picture.js';

export async function listUserDirectory() {
  const users: { id: string; displayName: string; username: string; pictureUrl?: string }[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :partition',
        ExpressionAttributeValues: { ':partition': 'ADMIN#USER' },
        ProjectionExpression:
          '#data.id, #data.displayName, #data.username, #data.active, #data.pictureKey',
        ExpressionAttributeNames: { '#data': 'data' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const item of page.Items ?? []) {
      const user = item.data;
      if (user?.active !== true || user.username === 'naaseh-smoke') continue;
      users.push({
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        ...(user.pictureKey
          ? { pictureUrl: await createProfilePictureReadUrl(user.pictureKey) }
          : {}),
      });
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return { items: users };
}
