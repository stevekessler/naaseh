import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface MigrationCheckpoint {
  id: string;
  status: 'planned' | 'created' | 'backfilled' | 'verified';
  lastEvaluatedKey?: Record<string, unknown>;
  expected: number;
  migrated: number;
  updatedAt: string;
}

export async function getMigrationCheckpoint(name: string, id: string) {
  const key = keys.migrationCheckpoint(name, id);
  return (
    await dynamodb.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }))
  ).Item?.data as MigrationCheckpoint | undefined;
}

export async function putMigrationCheckpoint(name: string, value: MigrationCheckpoint) {
  await dynamodb.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...keys.migrationCheckpoint(name, value.id), data: value },
    }),
  );
}
