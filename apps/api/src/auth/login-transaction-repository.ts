import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { loginTransactionSchema, type LoginTransaction } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export async function putLoginTransaction(transaction: LoginTransaction) {
  const value = loginTransactionSchema.parse(transaction);
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.loginTransaction(value.tokenDigest), data: value, expiresAt: value.ttl },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

export async function getLoginTransaction(tokenDigest: string, now = new Date()) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.loginTransaction(tokenDigest),
      ConsistentRead: true,
    }),
  );
  const parsed = loginTransactionSchema.safeParse(result.Item?.data);
  return parsed.success && new Date(parsed.data.expiresAt) > now ? parsed.data : undefined;
}

export async function registerLoginTransactionFailure(tokenDigest: string) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.loginTransaction(tokenDigest),
      UpdateExpression: 'SET #data.#attemptCount = #data.#attemptCount + :one',
      ConditionExpression: '#data.#attemptCount < :maximum',
      ExpressionAttributeNames: { '#data': 'data', '#attemptCount': 'attemptCount' },
      ExpressionAttributeValues: { ':one': 1, ':maximum': 5 },
    }),
  );
}

export async function setPendingEnrollmentSecret(tokenDigest: string, ciphertext: string) {
  await dynamodb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: keys.loginTransaction(tokenDigest),
      UpdateExpression: 'SET #data.#pendingSecret=:ciphertext',
      ConditionExpression: '#data.#purpose=:purpose AND #data.#attemptCount < :maximum',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#pendingSecret': 'pendingSecretCiphertext',
        '#purpose': 'purpose',
        '#attemptCount': 'attemptCount',
      },
      ExpressionAttributeValues: {
        ':ciphertext': ciphertext,
        ':purpose': 'tfa_enrollment',
        ':maximum': 5,
      },
    }),
  );
}

export const consumeLoginTransaction = (tokenDigest: string) =>
  dynamodb.send(
    new DeleteCommand({ TableName: tableName, Key: keys.loginTransaction(tokenDigest) }),
  );
