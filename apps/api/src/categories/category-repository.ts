import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { CategoryRecord } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';

const canonical = (name: string) => name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
const categoryKey = (id: string) => ({ PK: `CATEGORY#${id}`, SK: 'CATEGORY' });
const nameKey = (name: string) => ({ PK: `CATEGORYNAME#${canonical(name)}`, SK: 'CATEGORY' });

export async function listCategories() {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :category',
      ExpressionAttributeValues: { ':category': 'CATEGORY' },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as CategoryRecord);
}

export async function getCategory(id: string) {
  return (
    await dynamodb.send(
      new GetCommand({ TableName: tableName, Key: categoryKey(id), ConsistentRead: true }),
    )
  ).Item?.data as CategoryRecord | undefined;
}

export async function createCategoryRecord(category: CategoryRecord) {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: { ...nameKey(category.name), categoryId: category.id },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...categoryKey(category.id),
              GSI1PK: 'CATEGORY',
              GSI1SK: canonical(category.name),
              data: category,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    }),
  );
}

export async function updateCategoryRecord(current: CategoryRecord, next: CategoryRecord) {
  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> =
    [];
  if (canonical(current.name) !== canonical(next.name)) {
    items.push(
      {
        Delete: {
          TableName: tableName,
          Key: nameKey(current.name),
          ConditionExpression: 'categoryId=:id',
          ExpressionAttributeValues: { ':id': current.id },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: { ...nameKey(next.name), categoryId: next.id },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    );
  }
  items.push({
    Put: {
      TableName: tableName,
      Item: {
        ...categoryKey(next.id),
        GSI1PK: 'CATEGORY',
        GSI1SK: canonical(next.name),
        data: next,
      },
      ConditionExpression: '#data.#version=:version',
      ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
      ExpressionAttributeValues: { ':version': current.version },
    },
  });
  await dynamodb.send(new TransactWriteCommand({ TransactItems: items }));
}

export async function archiveCategory(id: string) {
  const current = await getCategory(id);
  if (!current) throw new Error('Category not found.');
  const next = { ...current, archived: true, version: current.version + 1 };
  await updateCategoryRecord(current, next);
  return next;
}
