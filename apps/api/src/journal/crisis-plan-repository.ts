import type { CrisisPlanRecord, CrisisPlanShare } from '@naaseh/domain';
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

export interface CrisisPlanReceipt {
  ownerId: string;
  mutationId: string;
  version: number;
  operation: string;
}

export interface CrisisPlanRepository {
  readOwner(ownerId: string): MaybePromise<CrisisPlanRecord | undefined>;
  readPlanForOwner(ownerId: string, planId: string): MaybePromise<CrisisPlanRecord | undefined>;
  receipt(ownerId: string, mutationId: string): MaybePromise<CrisisPlanReceipt | undefined>;
  saveOwner(
    record: CrisisPlanRecord,
    mutationId: string,
    operation: string,
  ): MaybePromise<CrisisPlanRecord>;
  listShares(ownerId: string): MaybePromise<CrisisPlanShare[]>;
  readShare(ownerId: string, recipientId: string): MaybePromise<CrisisPlanShare | undefined>;
  readShareByPlan(planId: string, recipientId: string): MaybePromise<CrisisPlanShare | undefined>;
  saveShare(share: CrisisPlanShare): MaybePromise<CrisisPlanShare>;
  listSharedForRecipient(
    recipientId: string,
  ): MaybePromise<Array<{ share: CrisisPlanShare; plan: CrisisPlanRecord }>>;
  revoke(
    ownerId: string,
    recipientId: string,
    updatedAt: string,
  ): MaybePromise<CrisisPlanShare | undefined>;
  removeAccess(
    ownerId: string,
    recipientId: string,
    updatedAt: string,
  ): MaybePromise<CrisisPlanShare | undefined>;
  rotate(
    record: CrisisPlanRecord,
    remaining: CrisisPlanShare[],
    mutationId: string,
    revokedRecipientId?: string,
  ): MaybePromise<CrisisPlanRecord | undefined>;
}
export class InMemoryCrisisPlanRepository {
  private plans = new Map<string, CrisisPlanRecord>();
  private receipts = new Map<string, CrisisPlanReceipt>();
  private shares = new Map<string, CrisisPlanShare>();
  private key(ownerId: string, id: string) {
    return `${ownerId}:${id}`;
  }
  readOwner(ownerId: string) {
    return this.plans.get(ownerId);
  }
  readPlanForOwner(ownerId: string, planId: string) {
    const plan = this.plans.get(ownerId);
    return plan?.planId === planId ? plan : undefined;
  }
  receipt(ownerId: string, mutationId: string) {
    return this.receipts.get(this.key(ownerId, mutationId));
  }
  saveOwner(record: CrisisPlanRecord, mutationId: string, operation: string) {
    this.plans.set(record.ownerId, record);
    const receipt = { ownerId: record.ownerId, mutationId, version: record.version, operation };
    this.receipts.set(this.key(record.ownerId, mutationId), receipt);
    return record;
  }
  listShares(ownerId: string) {
    return [...this.shares.values()].filter((share) => share.ownerId === ownerId);
  }
  readShare(ownerId: string, recipientId: string) {
    return this.shares.get(this.key(ownerId, recipientId));
  }
  readShareByPlan(planId: string, recipientId: string) {
    return [...this.shares.values()].find(
      (share) => share.planId === planId && share.recipientId === recipientId,
    );
  }
  saveShare(share: CrisisPlanShare) {
    this.shares.set(this.key(share.ownerId, share.recipientId), share);
    return share;
  }
  listSharedForRecipient(recipientId: string) {
    return [...this.shares.values()]
      .filter((share) => share.recipientId === recipientId && share.state === 'active')
      .map((share) => ({ share, plan: this.plans.get(share.ownerId) }))
      .filter((value): value is { share: CrisisPlanShare; plan: CrisisPlanRecord } =>
        Boolean(value.plan),
      );
  }
  revoke(ownerId: string, recipientId: string, updatedAt: string) {
    const current = this.readShare(ownerId, recipientId);
    if (!current) return undefined;
    const next: CrisisPlanShare = {
      ...current,
      state: 'revoked',
      grant: undefined,
      version: current.version + 1,
      updatedAt,
    };
    this.shares.set(this.key(ownerId, recipientId), next);
    return next;
  }
  removeAccess(ownerId: string, recipientId: string, updatedAt: string) {
    const current = this.readShare(ownerId, recipientId);
    const plan = this.plans.get(ownerId);
    if (!current || !plan) return undefined;
    const share: CrisisPlanShare = {
      ...current,
      state: 'recipient_removed',
      grant: undefined,
      version: current.version + 1,
      updatedAt,
    };
    this.shares.set(this.key(ownerId, recipientId), share);
    this.plans.set(ownerId, { ...plan, rotationState: 'rotation_required', updatedAt });
    return share;
  }
  rotate(
    record: CrisisPlanRecord,
    remaining: CrisisPlanShare[],
    mutationId: string,
    revokedRecipientId?: string,
  ) {
    const nextShares = new Map(this.shares);
    if (revokedRecipientId) {
      const current = this.readShare(record.ownerId, revokedRecipientId);
      if (!current) return undefined;
      nextShares.set(this.key(record.ownerId, revokedRecipientId), {
        ...current,
        state: 'revoked',
        grant: undefined,
        version: current.version + 1,
        updatedAt: record.updatedAt,
      });
    }
    for (const share of remaining)
      nextShares.set(this.key(share.ownerId, share.recipientId), share);
    this.plans.set(record.ownerId, record);
    this.shares = nextShares;
    this.receipts.set(this.key(record.ownerId, mutationId), {
      ownerId: record.ownerId,
      mutationId,
      version: record.version,
      operation: 'rotate',
    });
    return record;
  }
}

const ownerPk = (ownerId: string) => `JOURNAL#OWNER#${ownerId}`;
const planPk = (planId: string) => `CRISIS_PLAN#${planId}`;
const shareSk = (recipientId: string) => `SHARE#${recipientId}`;
const receiptSk = (mutationId: string) => `MUTATION#${mutationId}`;
const feedPk = (ownerId: string) => `FEED#OWNER#${ownerId}`;
const feedSk = (sequence: number) => `CHANGE#${String(sequence).padStart(20, '0')}`;

/** DynamoDB implementation used by both the HTTP API and sync Lambda. */
export class DynamoCrisisPlanRepository implements CrisisPlanRepository {
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

  private async feedItems(record: CrisisPlanRecord) {
    const PK = feedPk(record.ownerId);
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key: { PK, SK: 'COUNTER' }, ConsistentRead: true }),
    );
    const expected = Number(result.Item?.value ?? 0);
    const sequence = expected + 1;
    const data = {
      audience: `OWNER#${record.ownerId}`,
      sequence,
      entityType: 'crisisPlan',
      entityId: record.planId,
      version: record.version,
      operation: 'upsert',
      payload: record,
      changedAt: this.now(),
    };
    return [
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
          Item: { PK, SK: feedSk(sequence), data },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ] satisfies NonNullable<TransactWriteCommandInput['TransactItems']>;
  }

  readOwner(ownerId: string) {
    return this.get<CrisisPlanRecord>(ownerPk(ownerId), 'CRISIS_PLAN');
  }
  async readPlanForOwner(ownerId: string, planId: string) {
    const plan = await this.readOwner(ownerId);
    return plan?.planId === planId ? plan : undefined;
  }
  receipt(ownerId: string, mutationId: string) {
    return this.get<CrisisPlanReceipt>(ownerPk(ownerId), receiptSk(mutationId));
  }

  async saveOwner(record: CrisisPlanRecord, mutationId: string, operation: string) {
    const feed = await this.feedItems(record);
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.table,
              Item: { PK: ownerPk(record.ownerId), SK: 'CRISIS_PLAN', data: record },
              ConditionExpression:
                operation === 'create'
                  ? 'attribute_not_exists(PK)'
                  : '#data.#version = :baseVersion',
              ...(operation === 'create'
                ? {}
                : {
                    ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
                    ExpressionAttributeValues: { ':baseVersion': record.version - 1 },
                  }),
            },
          },
          {
            Put: {
              TableName: this.table,
              Item: {
                PK: ownerPk(record.ownerId),
                SK: receiptSk(mutationId),
                data: { ownerId: record.ownerId, mutationId, version: record.version, operation },
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          ...feed,
        ],
      }),
    );
    return record;
  }

  async listShares(ownerId: string) {
    const plan = await this.readOwner(ownerId);
    if (!plan) return [];
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :share)',
        ExpressionAttributeValues: { ':pk': planPk(plan.planId), ':share': 'SHARE#' },
        ConsistentRead: true,
      }),
    );
    return ((result.Items ?? []) as Array<{ data: CrisisPlanShare }>).map((item) => item.data);
  }
  async readShare(ownerId: string, recipientId: string) {
    const plan = await this.readOwner(ownerId);
    return plan ? this.readShareByPlan(plan.planId, recipientId) : undefined;
  }
  readShareByPlan(planId: string, recipientId: string) {
    return this.get<CrisisPlanShare>(planPk(planId), shareSk(recipientId));
  }
  async saveShare(share: CrisisPlanShare) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: planPk(share.planId),
          SK: shareSk(share.recipientId),
          data: share,
          ...(share.state === 'active'
            ? {
                GSI1PK: `CRISIS_PLAN_RECIPIENT#${share.recipientId}`,
                GSI1SK: `ACTIVE#${share.updatedAt}#${share.planId}`,
              }
            : {}),
        },
        ConditionExpression: 'attribute_not_exists(PK) OR #data.#version = :baseVersion',
        ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
        ExpressionAttributeValues: { ':baseVersion': share.version - 1 },
      }),
    );
    return share;
  }
  async listSharedForRecipient(recipientId: string) {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :active)',
        ExpressionAttributeValues: {
          ':pk': `CRISIS_PLAN_RECIPIENT#${recipientId}`,
          ':active': 'ACTIVE#',
        },
      }),
    );
    const shares = ((result.Items ?? []) as Array<{ data: CrisisPlanShare }>).map(
      (item) => item.data,
    );
    const pairs = await Promise.all(
      shares.map(async (share) => ({ share, plan: await this.readOwner(share.ownerId) })),
    );
    return pairs.filter((pair): pair is { share: CrisisPlanShare; plan: CrisisPlanRecord } =>
      Boolean(pair.plan),
    );
  }

  async revoke(ownerId: string, recipientId: string, updatedAt: string) {
    const current = await this.readShare(ownerId, recipientId);
    if (!current) return undefined;
    const next: CrisisPlanShare = {
      ...current,
      state: 'revoked',
      grant: undefined,
      version: current.version + 1,
      updatedAt,
    };
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [this.sharePut(next, current.version)],
      }),
    );
    return next;
  }

  async removeAccess(ownerId: string, recipientId: string, updatedAt: string) {
    const [current, plan] = await Promise.all([
      this.readShare(ownerId, recipientId),
      this.readOwner(ownerId),
    ]);
    if (!current || !plan) return undefined;
    const share: CrisisPlanShare = {
      ...current,
      state: 'recipient_removed',
      grant: undefined,
      version: current.version + 1,
      updatedAt,
    };
    const nextPlan = { ...plan, rotationState: 'rotation_required' as const, updatedAt };
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.table,
              Item: { PK: ownerPk(ownerId), SK: 'CRISIS_PLAN', data: nextPlan },
              ConditionExpression: '#data.#version = :version',
              ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
              ExpressionAttributeValues: { ':version': plan.version },
            },
          },
          this.sharePut(share, current.version),
        ],
      }),
    );
    return share;
  }

  private sharePut(share: CrisisPlanShare, expectedVersion: number) {
    return {
      Put: {
        TableName: this.table,
        Item: {
          PK: planPk(share.planId),
          SK: shareSk(share.recipientId),
          data: share,
          ...(share.state === 'active'
            ? {
                GSI1PK: `CRISIS_PLAN_RECIPIENT#${share.recipientId}`,
                GSI1SK: `ACTIVE#${share.updatedAt}#${share.planId}`,
              }
            : {}),
        },
        ConditionExpression: '#data.#version = :expectedVersion',
        ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
        ExpressionAttributeValues: { ':expectedVersion': expectedVersion },
      },
    };
  }

  async rotate(
    record: CrisisPlanRecord,
    remaining: CrisisPlanShare[],
    mutationId: string,
    revokedRecipientId?: string,
  ) {
    const revoked = revokedRecipientId
      ? await this.readShare(record.ownerId, revokedRecipientId)
      : undefined;
    if (revokedRecipientId && !revoked) return undefined;
    const feed = await this.feedItems(record);
    const receipt: CrisisPlanReceipt = {
      ownerId: record.ownerId,
      mutationId,
      version: record.version,
      operation: 'rotate',
    };
    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Put: {
          TableName: this.table,
          Item: { PK: ownerPk(record.ownerId), SK: 'CRISIS_PLAN', data: record },
          ConditionExpression: '#data.#version = :baseVersion',
          ExpressionAttributeNames: { '#data': 'data', '#version': 'version' },
          ExpressionAttributeValues: { ':baseVersion': record.version - 1 },
        },
      },
      ...remaining.map((share) => this.sharePut(share, share.version - 1)),
      ...(revoked
        ? [
            this.sharePut(
              {
                ...revoked,
                state: 'revoked',
                grant: undefined,
                version: revoked.version + 1,
                updatedAt: record.updatedAt,
              },
              revoked.version,
            ),
          ]
        : []),
      {
        Put: {
          TableName: this.table,
          Item: { PK: ownerPk(record.ownerId), SK: receiptSk(mutationId), data: receipt },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...feed,
    ];
    if (items.length > 100)
      throw new Error('Crisis Plan rotation exceeds DynamoDB transaction limits.');
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    return record;
  }
}
