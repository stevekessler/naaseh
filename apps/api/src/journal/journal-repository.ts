import type {
  CiphertextEnvelope,
  JournalEntryCiphertext,
  JournalKeyEnvelope,
  JournalMutation,
} from '@naaseh/domain';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';

type MaybePromise<T> = T | Promise<T>;
type DocumentClient = { send(command: unknown): Promise<Record<string, any>> };

export interface JournalCiphertextRecord {
  ownerId: string;
  entryId: string;
  dateToken: string;
  version: number;
  payload: JournalEntryCiphertext;
  createdAt: string;
  updatedAt: string;
}
export interface JournalMutationReceipt {
  ownerId: string;
  mutationId: string;
  status: 'applied';
  version: number;
}

export interface JournalFeedRow {
  ownerId: string;
  sequence: number;
  entityType: 'journalEntry' | 'journalProfile';
  entityId: string;
  entityVersion: number;
  payload: JournalEntryCiphertext | CiphertextEnvelope;
}

export interface JournalRepository {
  read(ownerId: string, entryId: string): MaybePromise<JournalCiphertextRecord | undefined>;
  receipt(ownerId: string, mutationId: string): MaybePromise<JournalMutationReceipt | undefined>;
  dateOwner(ownerId: string, dateToken: string): MaybePromise<string | undefined>;
  profile(
    ownerId: string,
  ): MaybePromise<{ ownerId: string; version: number; payload: CiphertextEnvelope } | undefined>;
  saveProfile(
    ownerId: string,
    mutation: JournalMutation,
    payload: CiphertextEnvelope,
    version: number,
  ): MaybePromise<{ ownerId: string; version: number; payload: CiphertextEnvelope }>;
  keyEnvelope(ownerId: string): MaybePromise<JournalKeyEnvelope | undefined>;
  saveKeyEnvelope(
    ownerId: string,
    envelope: JournalKeyEnvelope,
    baseVersion: number,
  ): MaybePromise<JournalKeyEnvelope | undefined>;
  changes(
    ownerId: string,
    cursor: number,
    limit?: number,
  ): MaybePromise<{ rows: JournalFeedRow[]; cursor: number; hasMore: boolean }>;
  bootstrap(ownerId: string): MaybePromise<
    Array<{
      entityType: 'journalEntry' | 'journalProfile';
      entityId: string;
      entityVersion: number;
      payload: JournalEntryCiphertext | CiphertextEnvelope;
    }>
  >;
  save(
    ownerId: string,
    mutation: JournalMutation,
    payload: JournalEntryCiphertext,
    version: number,
  ): MaybePromise<JournalCiphertextRecord>;
  hasCurrentCrisisPlan(ownerId: string): MaybePromise<boolean>;
}

export class InMemoryJournalRepository {
  private records = new Map<string, JournalCiphertextRecord>();
  private dates = new Map<string, string>();
  private receipts = new Map<string, JournalMutationReceipt>();
  private profiles = new Map<
    string,
    { ownerId: string; version: number; payload: CiphertextEnvelope }
  >();
  private keyEnvelopes = new Map<string, JournalKeyEnvelope>();
  private feed: Array<{
    ownerId: string;
    sequence: number;
    entityType: 'journalEntry' | 'journalProfile';
    entityId: string;
    entityVersion: number;
    payload: JournalEntryCiphertext | CiphertextEnvelope;
  }> = [];
  private key(ownerId: string, entryId: string) {
    return `${ownerId}:${entryId}`;
  }
  private dateKey(ownerId: string, dateToken: string) {
    return `${ownerId}:${dateToken}`;
  }
  read(ownerId: string, entryId: string) {
    return this.records.get(this.key(ownerId, entryId));
  }
  receipt(ownerId: string, mutationId: string) {
    return this.receipts.get(this.key(ownerId, mutationId));
  }
  dateOwner(ownerId: string, dateToken: string) {
    return this.dates.get(this.dateKey(ownerId, dateToken));
  }
  profile(ownerId: string) {
    return this.profiles.get(ownerId);
  }
  saveProfile(
    ownerId: string,
    mutation: JournalMutation,
    payload: CiphertextEnvelope,
    version: number,
  ) {
    const record = { ownerId, version, payload };
    this.profiles.set(ownerId, record);
    this.receipts.set(this.key(ownerId, mutation.id), {
      ownerId,
      mutationId: mutation.id,
      status: 'applied',
      version,
    });
    this.feed.push({
      ownerId,
      sequence: this.feed.length + 1,
      entityType: 'journalProfile',
      entityId: 'journal-profile',
      entityVersion: version,
      payload,
    });
    return record;
  }
  keyEnvelope(ownerId: string) {
    return this.keyEnvelopes.get(ownerId);
  }
  saveKeyEnvelope(ownerId: string, envelope: JournalKeyEnvelope, baseVersion: number) {
    const current = this.keyEnvelope(ownerId);
    if ((current?.version ?? 0) !== baseVersion) return undefined;
    this.keyEnvelopes.set(ownerId, envelope);
    return envelope;
  }
  changes(ownerId: string, cursor: number, limit = 100) {
    const rows = this.feed
      .filter((row) => row.ownerId === ownerId && row.sequence > cursor)
      .slice(0, limit);
    return {
      rows,
      cursor: rows.at(-1)?.sequence ?? cursor,
      hasMore: this.feed.some(
        (row) => row.ownerId === ownerId && row.sequence > (rows.at(-1)?.sequence ?? cursor),
      ),
    };
  }
  bootstrap(ownerId: string): Array<{
    entityType: 'journalEntry' | 'journalProfile';
    entityId: string;
    entityVersion: number;
    payload: JournalEntryCiphertext | CiphertextEnvelope;
  }> {
    const records: Array<{
      entityType: 'journalEntry' | 'journalProfile';
      entityId: string;
      entityVersion: number;
      payload: JournalEntryCiphertext | CiphertextEnvelope;
    }> = [...this.records.values()]
      .filter((row) => row.ownerId === ownerId)
      .map((row) => ({
        entityType: 'journalEntry',
        entityId: row.entryId,
        entityVersion: row.version,
        payload: row.payload,
      }));
    const profile = this.profile(ownerId);
    if (profile)
      records.push({
        entityType: 'journalProfile',
        entityId: 'journal-profile',
        entityVersion: profile.version,
        payload: profile.payload,
      });
    return records;
  }
  save(
    ownerId: string,
    mutation: JournalMutation,
    payload: JournalEntryCiphertext,
    version: number,
  ) {
    const now = new Date().toISOString();
    const current = this.read(ownerId, payload.entryId);
    if (mutation.priorDateToken && mutation.priorDateToken !== payload.dateToken)
      this.dates.delete(this.dateKey(ownerId, mutation.priorDateToken));
    const record: JournalCiphertextRecord = {
      ownerId,
      entryId: payload.entryId,
      dateToken: payload.dateToken,
      version,
      payload,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(this.key(ownerId, payload.entryId), record);
    this.dates.set(this.dateKey(ownerId, payload.dateToken), payload.entryId);
    this.receipts.set(this.key(ownerId, mutation.id), {
      ownerId,
      mutationId: mutation.id,
      status: 'applied',
      version,
    });
    this.feed.push({
      ownerId,
      sequence: this.feed.length + 1,
      entityType: 'journalEntry',
      entityId: payload.entryId,
      entityVersion: version,
      payload,
    });
    return record;
  }
  hasCurrentCrisisPlan() {
    return true;
  }
}

const ownerPk = (ownerId: string) => `JOURNAL#OWNER#${ownerId}`;
const entrySk = (entryId: string) => `ENTRY#${entryId}`;
const dateSk = (dateToken: string) => `DATE#${dateToken}`;
const receiptSk = (mutationId: string) => `MUTATION#${mutationId}`;
const feedPk = (ownerId: string) => `FEED#OWNER#${ownerId}`;
const feedSk = (sequence: number) => `CHANGE#${String(sequence).padStart(20, '0')}`;

/** Durable repository used by Lambda. In-memory storage above is deliberately test-only. */
export class DynamoJournalRepository implements JournalRepository {
  constructor(
    private readonly client: DocumentClient = dynamodb as unknown as DocumentClient,
    private readonly table = tableName,
    private readonly now = () => new Date().toISOString(),
  ) {}

  private async get<T>(PK: string, SK: string): Promise<T | undefined> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { PK, SK }, ConsistentRead: true }),
    );
    return result.Item?.data as T | undefined;
  }

  private async prepareFeed(ownerId: string, row: Omit<JournalFeedRow, 'sequence'>) {
    const PK = feedPk(ownerId);
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { PK, SK: 'COUNTER' }, ConsistentRead: true }),
    );
    const expected = Number(result.Item?.value ?? 0);
    const sequence = expected + 1;
    const changedAt = this.now();
    return {
      expected,
      sequence,
      items: [
        {
          Update: {
            TableName: this.table,
            Key: { PK, SK: 'COUNTER' },
            UpdateExpression: 'SET #value = :next',
            ConditionExpression: 'attribute_not_exists(#value) OR #value = :expected',
            ExpressionAttributeNames: { '#value': 'value' },
            ExpressionAttributeValues: { ':next': sequence, ':expected': expected },
          },
        },
        {
          Put: {
            TableName: this.table,
            Item: {
              PK,
              SK: feedSk(sequence),
              data: {
                audience: `OWNER#${ownerId}`,
                sequence,
                entityType: row.entityType,
                entityId: row.entityId,
                version: row.entityVersion,
                operation: 'upsert',
                payload: row.payload,
                changedAt,
              },
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ] satisfies NonNullable<TransactWriteCommandInput['TransactItems']>,
    };
  }

  read(ownerId: string, entryId: string) {
    return this.get<JournalCiphertextRecord>(ownerPk(ownerId), entrySk(entryId));
  }
  receipt(ownerId: string, mutationId: string) {
    return this.get<JournalMutationReceipt>(ownerPk(ownerId), receiptSk(mutationId));
  }
  async dateOwner(ownerId: string, dateToken: string) {
    const value = await this.get<{ entryId: string }>(ownerPk(ownerId), dateSk(dateToken));
    return value?.entryId;
  }
  profile(ownerId: string) {
    return this.get<{ ownerId: string; version: number; payload: CiphertextEnvelope }>(
      ownerPk(ownerId),
      'PROFILE',
    );
  }
  keyEnvelope(ownerId: string) {
    return this.get<JournalKeyEnvelope>(ownerPk(ownerId), 'KEY_ENVELOPE');
  }
  async hasCurrentCrisisPlan(ownerId: string) {
    return Boolean(await this.get(ownerPk(ownerId), 'CRISIS_PLAN'));
  }

  async saveProfile(
    ownerId: string,
    mutation: JournalMutation,
    payload: CiphertextEnvelope,
    version: number,
  ) {
    const record = { ownerId, version, payload };
    const feed = await this.prepareFeed(ownerId, {
      ownerId,
      entityType: 'journalProfile',
      entityId: 'journal-profile',
      entityVersion: version,
      payload,
    });
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.table,
              Item: { PK: ownerPk(ownerId), SK: 'PROFILE', data: record },
              ConditionExpression: 'attribute_not_exists(PK) OR (#data.#version = :baseVersion)',
              ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
              ExpressionAttributeValues: { ':baseVersion': version - 1 },
            },
          },
          {
            Put: {
              TableName: this.table,
              Item: {
                PK: ownerPk(ownerId),
                SK: receiptSk(mutation.id),
                data: { ownerId, mutationId: mutation.id, status: 'applied', version },
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          ...feed.items,
        ],
      }),
    );
    return record;
  }

  async saveKeyEnvelope(ownerId: string, envelope: JournalKeyEnvelope, baseVersion: number) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: ownerPk(ownerId), SK: 'KEY_ENVELOPE', data: envelope },
          ConditionExpression: 'attribute_not_exists(PK) OR #data.#version = :baseVersion',
          ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
          ExpressionAttributeValues: { ':baseVersion': baseVersion },
        }),
      );
      return envelope;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException')
        return undefined;
      throw error;
    }
  }

  async changes(ownerId: string, cursor: number, limit = 100) {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :first AND :last',
        ExpressionAttributeValues: {
          ':pk': feedPk(ownerId),
          ':first': feedSk(cursor + 1),
          ':last': `CHANGE#${'9'.repeat(20)}`,
        },
        Limit: limit + 1,
      }),
    );
    const all = ((result.Items ?? []) as Array<{ data: Record<string, any> }>)
      .map((item) => item.data)
      .filter((data) => data.entityType === 'journalEntry' || data.entityType === 'journalProfile')
      .map(
        (data): JournalFeedRow => ({
          ownerId,
          sequence: Number(data.sequence),
          entityType: data.entityType,
          entityId: String(data.entityId),
          entityVersion: Number(data.version),
          payload: data.payload,
        }),
      );
    const rows = all.slice(0, limit);
    return { rows, cursor: rows.at(-1)?.sequence ?? cursor, hasMore: all.length > limit };
  }

  async bootstrap(ownerId: string) {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': ownerPk(ownerId) },
        ConsistentRead: true,
      }),
    );
    const records: Array<{
      entityType: 'journalEntry' | 'journalProfile';
      entityId: string;
      entityVersion: number;
      payload: JournalEntryCiphertext | CiphertextEnvelope;
    }> = [];
    for (const item of (result.Items ?? []) as Array<{ SK?: string; data?: unknown }>) {
      const sk = String(item.SK ?? '');
      if (sk.startsWith('ENTRY#')) {
        const record = item.data as JournalCiphertextRecord;
        records.push({
          entityType: 'journalEntry',
          entityId: record.entryId,
          entityVersion: record.version,
          payload: record.payload,
        });
      } else if (sk === 'PROFILE') {
        const record = item.data as { version: number; payload: CiphertextEnvelope };
        records.push({
          entityType: 'journalProfile',
          entityId: 'journal-profile',
          entityVersion: record.version,
          payload: record.payload,
        });
      }
    }
    return records;
  }

  async save(
    ownerId: string,
    mutation: JournalMutation,
    payload: JournalEntryCiphertext,
    version: number,
  ) {
    const current = await this.read(ownerId, payload.entryId);
    const now = this.now();
    const record: JournalCiphertextRecord = {
      ownerId,
      entryId: payload.entryId,
      dateToken: payload.dateToken,
      version,
      payload,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    const feed = await this.prepareFeed(ownerId, {
      ownerId,
      entityType: 'journalEntry',
      entityId: payload.entryId,
      entityVersion: version,
      payload,
    });
    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      ...(version === 1
        ? [
            {
              ConditionCheck: {
                TableName: this.table,
                Key: { PK: ownerPk(ownerId), SK: 'CRISIS_PLAN' },
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
          ]
        : []),
      {
        Put: {
          TableName: this.table,
          Item: { PK: ownerPk(ownerId), SK: entrySk(payload.entryId), data: record },
          ConditionExpression: 'attribute_not_exists(PK) OR #data.#version = :baseVersion',
          ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
          ExpressionAttributeValues: { ':baseVersion': version - 1 },
        },
      },
      {
        Put: {
          TableName: this.table,
          Item: {
            PK: ownerPk(ownerId),
            SK: dateSk(payload.dateToken),
            data: { entryId: payload.entryId },
          },
          ConditionExpression: 'attribute_not_exists(PK) OR #data.#entryId = :entryId',
          ExpressionAttributeNames: { '#data': 'data', '#entryId': 'entryId' },
          ExpressionAttributeValues: { ':entryId': payload.entryId },
        },
      },
      ...(mutation.priorDateToken && mutation.priorDateToken !== payload.dateToken
        ? [
            {
              Delete: {
                TableName: this.table,
                Key: { PK: ownerPk(ownerId), SK: dateSk(mutation.priorDateToken) },
                ConditionExpression: 'attribute_not_exists(PK) OR #data.#entryId = :entryId',
                ExpressionAttributeNames: { '#data': 'data', '#entryId': 'entryId' },
                ExpressionAttributeValues: { ':entryId': payload.entryId },
              },
            },
          ]
        : []),
      {
        Put: {
          TableName: this.table,
          Item: {
            PK: ownerPk(ownerId),
            SK: receiptSk(mutation.id),
            data: { ownerId, mutationId: mutation.id, status: 'applied', version },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...feed.items,
    ];
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    return record;
  }
}
