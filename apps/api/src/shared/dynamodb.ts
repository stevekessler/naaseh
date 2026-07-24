import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
export const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
export const tableName = process.env.NAASEH_TABLE ?? 'naaseh-local';
export const transact = async (items: NonNullable<TransactWriteCommandInput['TransactItems']>) =>
  dynamodb.send(new TransactWriteCommand({ TransactItems: items }));
