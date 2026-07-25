import { GetCommand, QueryCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { canonicalProjectName, type Project } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export const buildProjectNameReservation = (categoryId: string, name: string) =>
  keys.projectName(categoryId, canonicalProjectName(name));

export async function getProject(id: string) {
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: keys.project(id), ConsistentRead: true }),
  );
  return result.Item?.data as Project | undefined;
}

export async function listProjects(categoryId?: string) {
  const result = categoryId
    ? await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK=:pk',
          ExpressionAttributeValues: { ':pk': `PROJECT#CATEGORY#${categoryId}` },
        }),
      )
    : await dynamodb.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: 'begins_with(PK,:prefix) AND SK=:current',
          ExpressionAttributeValues: { ':prefix': 'PROJECT#', ':current': 'CURRENT' },
        }),
      );
  return (result.Items ?? []).map((item) => item.data as Project);
}

export async function createProjectRecord(project: Project) {
  const reservation = buildProjectNameReservation(project.categoryId, project.name);
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: { ...reservation, projectId: project.id },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.project(project.id),
              data: project,
              version: project.version,
              GSI1PK: `PROJECT#CATEGORY#${project.categoryId}`,
              GSI1SK: `${canonicalProjectName(project.name)}#${project.id}`,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    }),
  );
  return project;
}

export async function updateProjectRecord(current: Project, next: Project) {
  const oldReservation = buildProjectNameReservation(current.categoryId, current.name);
  const newReservation = buildProjectNameReservation(next.categoryId, next.name);
  const reservationChanged = oldReservation.PK !== newReservation.PK;
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        ...(reservationChanged
          ? [
              {
                Put: {
                  TableName: tableName,
                  Item: { ...newReservation, projectId: next.id },
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ]
          : []),
        {
          Put: {
            TableName: tableName,
            Item: {
              ...keys.project(next.id),
              data: next,
              version: next.version,
              GSI1PK: `PROJECT#CATEGORY#${next.categoryId}`,
              GSI1SK: `${canonicalProjectName(next.name)}#${next.id}`,
            },
            ConditionExpression: '#version=:version',
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: { ':version': current.version },
          },
        },
        ...(reservationChanged
          ? [
              {
                Delete: {
                  TableName: tableName,
                  Key: oldReservation,
                  ConditionExpression: 'projectId=:id',
                  ExpressionAttributeValues: { ':id': current.id },
                },
              },
            ]
          : []),
      ],
    }),
  );
  return next;
}

export async function deleteEmptyProjectRecord(project: Project) {
  await dynamodb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: tableName,
            Key: keys.project(project.id),
            ConditionExpression: '#version=:version',
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: { ':version': project.version },
          },
        },
        {
          Delete: {
            TableName: tableName,
            Key: buildProjectNameReservation(project.categoryId, project.name),
            ConditionExpression: 'projectId=:id',
            ExpressionAttributeValues: { ':id': project.id },
          },
        },
      ],
    }),
  );
}
