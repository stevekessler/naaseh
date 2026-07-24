import { DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Attachment, AttachmentBlob, BlobReference } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { getRecord, putRecord } from '../shared/store.js';
import { keys } from '../shared/keys.js';
export async function findAttachment(id: string) {
  return (await getRecord<{ data: Attachment }>(keys.attachment(id).PK, 'CURRENT'))?.data;
}
export async function saveAttachment(value: Attachment, expectedVersion: number) {
  await putRecord(
    {
      ...keys.attachment(value.id),
      data: value,
      version: value.version,
      GSI1PK: `ATTACHMENT#PARENT#${value.parentType}#${value.parentId}`,
      GSI1SK: `${value.createdAt}#${value.id}`,
    },
    expectedVersion === 0 ? 'attribute_not_exists(PK)' : '#version = :expected',
    expectedVersion ? { '#version': 'version' } : undefined,
    expectedVersion ? { ':expected': expectedVersion } : undefined,
  );
  return value;
}
export async function listParentAttachments(
  parentType: Attachment['parentType'],
  parentId: string,
) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK=:pk',
      ExpressionAttributeValues: { ':pk': `ATTACHMENT#PARENT#${parentType}#${parentId}` },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as Attachment);
}
export async function saveUploadSession(session: Record<string, unknown>) {
  await putRecord(
    { ...keys.uploadSession(String(session.id)), ...session },
    'attribute_not_exists(PK)',
  );
}
export async function findUploadSession<T>(id: string) {
  return getRecord<T>(keys.uploadSession(id).PK, 'SESSION');
}
export async function saveAttachmentBlob(blob: AttachmentBlob) {
  await putRecord({ ...keys.attachmentBlob(blob.blobId), data: blob });
  return blob;
}
export async function findAttachmentBlob(id: string) {
  return (await getRecord<{ data: AttachmentBlob }>(keys.attachmentBlob(id).PK, 'CURRENT'))?.data;
}
export async function saveBlobReference(reference: BlobReference) {
  await putRecord(
    { ...keys.blobReference(reference.blobId, reference.attachmentId), data: reference },
    'attribute_not_exists(PK)',
  );
  return reference;
}
export async function releaseBlobReference(blobId: string, attachmentId: string) {
  await dynamodb.send(
    new DeleteCommand({ TableName: tableName, Key: keys.blobReference(blobId, attachmentId) }),
  );
}
export async function listBlobReferences(blobId: string) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK=:pk AND begins_with(SK,:ref)',
      ExpressionAttributeValues: { ':pk': `BLOB#${blobId}`, ':ref': 'REF#' },
    }),
  );
  return (result.Items ?? []).map((item) => item.data as BlobReference);
}

async function scanCurrentRecords<T>(prefix: string): Promise<T[]> {
  const values: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK,:prefix) AND SK=:current',
        ExpressionAttributeValues: { ':prefix': prefix, ':current': 'CURRENT' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const item of result.Items ?? []) if (item.data) values.push(item.data as T);
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return values;
}

export const listAllAttachments = () => scanCurrentRecords<Attachment>('ATTACHMENT#');
export const listAllAttachmentBlobs = () => scanCurrentRecords<AttachmentBlob>('BLOB#');
