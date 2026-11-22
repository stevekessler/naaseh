import type { ImagePointer } from '@naaseh/contacts-inventory-contracts';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../shared/dynamodb.js';
import type {
  ChangeEntry,
  Commit,
  Receipt,
  RecordKey,
  StoredRecord,
  WorkspaceStore,
} from './repository.js';

const sequenceKey = (sequence: number) => `CHANGE#${String(sequence).padStart(16, '0')}`;
export type ImageCandidate = ImagePointer & {
  workspaceGeneration: number;
  imageGeneration: number;
  createdAt: number;
  version?: string;
};
const candidateKey = (itemId: string, id: string) => `CANDIDATE#${itemId}#${id}`;

const recordKey = ({ kind, id }: RecordKey) => `RECORD#${kind}#${id}`;

export class DynamoWorkspaceStore implements WorkspaceStore {
  private readonly pk: string;

  constructor(
    workspace: string,
    private readonly table: string,
    private readonly ledgerTable: string,
  ) {
    this.pk = `WORKSPACE#${workspace}`;
  }

  private async get<T>(sk: string) {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: this.pk, sk },
        ConsistentRead: true,
      }),
    );
    return result.Item?.value as T | undefined;
  }

  async checkpoint() {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: this.pk, sk: 'STATE' },
        ConsistentRead: true,
      }),
    );
    return result.Item
      ? { generation: Number(result.Item.generation), sequence: Number(result.Item.sequence) }
      : { generation: 1, sequence: 0 };
  }

  record(key: RecordKey) {
    return this.get<StoredRecord>(recordKey(key));
  }

  receipt(actor: string, mutationId: string) {
    return this.get<Receipt>(`RECEIPT#${JSON.stringify([actor, mutationId])}`);
  }

  async scanChanges(after: number, through: number, limit: number) {
    if (after === through) return [];
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: this.table,
        ConsistentRead: true,
        Limit: limit,
        KeyConditionExpression: 'pk = :pk AND sk BETWEEN :first AND :last',
        ExpressionAttributeValues: {
          ':pk': this.pk,
          ':first': sequenceKey(after + 1),
          ':last': sequenceKey(through),
        },
      }),
    );
    return (result.Items ?? []).map((item) => item.value as ChangeEntry);
  }

  async listRecords(kind: RecordKey['kind'], after: string | undefined, limit: number) {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: this.table,
        ConsistentRead: true,
        Limit: limit,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': this.pk, ':prefix': `RECORD#${kind}#` },
        ...(after
          ? { ExclusiveStartKey: { pk: this.pk, sk: recordKey({ kind, id: after }) } }
          : {}),
      }),
    );
    const last = result.LastEvaluatedKey?.sk;
    return {
      records: (result.Items ?? []).map((item) => item.value as StoredRecord),
      next: typeof last === 'string' ? last.slice(`RECORD#${kind}#`.length) : undefined,
    };
  }

  imageCandidate(itemId: string, id: string) {
    return this.get<ImageCandidate>(candidateKey(itemId, id));
  }

  async reserveImageCandidate(itemId: string, candidate: ImageCandidate) {
    try {
      await dynamodb.send(
        new PutCommand({
          TableName: this.table,
          Item: { pk: this.pk, sk: candidateKey(itemId, candidate.id), value: candidate },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return candidate;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      return this.imageCandidate(itemId, candidate.id);
    }
  }

  async confirmImageVersion(itemId: string, candidate: ImageCandidate, version: string) {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: this.pk, sk: candidateKey(itemId, candidate.id) },
          ConditionExpression:
            'attribute_exists(pk) AND (attribute_not_exists(#v.#version) OR #v.#version = :version)',
          UpdateExpression: 'SET #v.#version = :version',
          ExpressionAttributeNames: { '#v': 'value', '#version': 'version' },
          ExpressionAttributeValues: { ':version': version },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async changeImage(
    itemId: string,
    workspaceGeneration: number,
    expectedImageGeneration: number,
    image?: ImagePointer,
  ) {
    const ref = { kind: 'item' as const, id: itemId };
    for (let attempt = 0; attempt < 6; attempt++) {
      const expected = await this.checkpoint();
      if (expected.generation !== workspaceGeneration) return false;
      const item = await this.record(ref);
      if (!item || 'deleted' in item || (item.imageGeneration ?? 0) !== expectedImageGeneration)
        return false;
      const sequence = expected.sequence + 1;
      const next = {
        ...item,
        lastChangeSequence: sequence,
        imageGeneration: expectedImageGeneration + 1,
      };
      if (image) next.image = image;
      else delete next.image;
      const writes: NonNullable<TransactWriteCommandInput['TransactItems']> = [
        {
          Update: {
            TableName: this.table,
            Key: { pk: this.pk, sk: 'STATE' },
            ConditionExpression: '#g = :generation AND #s = :previous',
            UpdateExpression: 'SET #s = :next',
            ExpressionAttributeNames: { '#g': 'generation', '#s': 'sequence' },
            ExpressionAttributeValues: {
              ':generation': workspaceGeneration,
              ':previous': expected.sequence,
              ':next': sequence,
            },
          },
        },
        { Put: { TableName: this.table, Item: { pk: this.pk, sk: recordKey(ref), value: next } } },
        {
          Put: {
            TableName: this.table,
            Item: { pk: this.pk, sk: sequenceKey(sequence), value: { ...ref, sequence } },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ];
      if (item.image)
        writes.push({
          Put: {
            TableName: this.ledgerTable,
            Item: {
              pk: this.pk,
              sk: `DELETION#${workspaceGeneration}#${sequence}#${recordKey(ref)}`,
              value: {
                ...ref,
                generation: workspaceGeneration,
                lastChangeSequence: sequence,
                imageGeneration: next.imageGeneration,
                imageId: item.image.id,
              },
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        });
      try {
        await dynamodb.send(new TransactWriteCommand({ TransactItems: writes }));
        return true;
      } catch (error) {
        if (
          !(error instanceof TransactionCanceledException) ||
          !error.CancellationReasons?.some(
            ({ Code }) => Code === 'ConditionalCheckFailed' || Code === 'TransactionConflict',
          )
        )
          throw error;
      }
    }
    return false;
  }

  async referenceCount(id: string) {
    const { Item } = await dynamodb.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: this.pk, sk: `PRESCRIBER#${id}` },
        ConsistentRead: true,
      }),
    );
    return Number(Item?.count ?? 0);
  }

  async commit({ expected, record, receipt, entry, ledger, referenceDeltas }: Commit) {
    const receiptKey = `RECEIPT#${JSON.stringify([receipt.actor, receipt.mutationId])}`;
    const writes: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Put: {
          TableName: this.table,
          Item: {
            pk: this.pk,
            sk: 'STATE',
            generation: expected.generation,
            sequence: entry.sequence,
          },
          // All record changes and restore generation transitions serialize on this row.
          ConditionExpression:
            expected.sequence === 0 && expected.generation === 1
              ? 'attribute_not_exists(pk) OR (#g = :generation AND #s = :sequence)'
              : '#g = :generation AND #s = :sequence',
          ExpressionAttributeNames: { '#g': 'generation', '#s': 'sequence' },
          ExpressionAttributeValues: {
            ':generation': expected.generation,
            ':sequence': expected.sequence,
          },
        },
      },
      {
        Put: { TableName: this.table, Item: { pk: this.pk, sk: recordKey(record), value: record } },
      },
      {
        Put: {
          TableName: this.table,
          Item: { pk: this.pk, sk: sequenceKey(entry.sequence), value: entry },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      {
        Put: {
          TableName: this.table,
          Item: { pk: this.pk, sk: receiptKey, value: receipt },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];
    for (const { id, count } of referenceDeltas ?? []) {
      writes.push({
        Update: {
          TableName: this.table,
          Key: { pk: this.pk, sk: `PRESCRIBER#${id}` },
          UpdateExpression: 'ADD #count :delta',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: { ':delta': count, ...(count < 0 ? { ':zero': 0 } : {}) },
          ...(count < 0 ? { ConditionExpression: '#count > :zero' } : {}),
        },
      });
    }
    if (ledger)
      writes.push({
        Put: {
          TableName: this.ledgerTable,
          Item: {
            pk: this.pk,
            sk: `DELETION#${ledger.generation}#${entry.sequence}#${recordKey(record)}`,
            value: ledger,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      });
    try {
      await dynamodb.send(new TransactWriteCommand({ TransactItems: writes }));
      return true;
    } catch (error) {
      if (
        error instanceof TransactionCanceledException &&
        error.CancellationReasons?.some(
          ({ Code }) => Code === 'ConditionalCheckFailed' || Code === 'TransactionConflict',
        )
      )
        return false;
      throw error;
    }
  }
}
