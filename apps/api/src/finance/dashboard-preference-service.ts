import { createHash } from 'node:crypto';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  financeDashboardFlagUpdateSchema,
  financeDashboardSettingsUpdateSchema,
} from '@naaseh/contracts';
import {
  defaultFinanceDashboardSettings,
  financeDashboardFlagSchema,
  financeDashboardSettingsSchema,
  financeDashboardTargetSchema,
  type FinanceDashboardTarget,
} from '@naaseh/domain';
import type { FinanceActor } from './authorization.js';

type TransactionItems = NonNullable<TransactWriteCommandInput['TransactItems']>;
type SourceConditions = ReadonlyArray<{
  ConditionCheck: NonNullable<TransactionItems[number]['ConditionCheck']>;
}>;

const prefix = 'FINANCE_DASHBOARD#';
const settingsKey = `${prefix}SETTINGS`;
const flagKey = ({ targetKind, targetId }: FinanceDashboardTarget) =>
  `${prefix}${targetKind}#${targetId}`;

interface DashboardPreferenceOptions {
  client: Pick<DynamoDBDocumentClient, 'send'>;
  tableName: string;
  /** The same current-source evidence used to filter reads must fence a flag write. */
  authorizeTarget: (
    actor: FinanceActor,
    target: FinanceDashboardTarget,
  ) => Promise<readonly [SourceConditions[number], ...SourceConditions] | undefined>;
  authorizeWrite?: () => Promise<unknown>;
  now?: () => Date;
}

export class FinanceDashboardPreferenceDenied extends Error {
  constructor() {
    super('Finance record not found.');
    this.name = 'FinanceDashboardPreferenceDenied';
  }
}

function ownerPartition(actor: FinanceActor) {
  if (!actor.active) throw new FinanceDashboardPreferenceDenied();
  return `USER#${actor.id}`;
}

export class FinanceDashboardPreferenceService {
  constructor(private readonly options: DashboardPreferenceOptions) {}

  async read(actor: FinanceActor) {
    const PK = ownerPartition(actor);
    const flags: Array<ReturnType<typeof financeDashboardFlagSchema.parse>> = [];
    let settings: ReturnType<typeof financeDashboardSettingsSchema.parse> =
      defaultFinanceDashboardSettings;
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.options.client.send(
        new QueryCommand({
          TableName: this.options.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
          ConsistentRead: true,
          Limit: 25,
          ExclusiveStartKey: cursor,
        }),
      );
      for (const row of page.Items ?? []) {
        if (row.PK !== PK) throw new Error('Invalid Finance dashboard preference owner.');
        const { data, version } = row;
        if (row.SK === settingsKey) {
          settings = financeDashboardSettingsSchema.parse(data);
          if (settings.version !== version)
            throw new Error('Invalid Finance dashboard settings version.');
          continue;
        }
        const flag = financeDashboardFlagSchema.parse(data);
        if (row.SK !== flagKey(flag) || flag.version !== version)
          throw new Error('Invalid Finance dashboard flag identity.');
        const target = { targetKind: flag.targetKind, targetId: flag.targetId };
        if (await this.options.authorizeTarget(actor, target)) flags.push(flag);
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return { flags, settings };
  }

  async setFlag(actor: FinanceActor, rawTarget: unknown, rawInput: unknown, mutationId?: string) {
    const PK = ownerPartition(actor);
    const target = financeDashboardTargetSchema.parse(rawTarget);
    const input = financeDashboardFlagUpdateSchema.parse(rawInput);
    const conditions = await this.options.authorizeTarget(actor, target);
    if (!conditions?.length) throw new FinanceDashboardPreferenceDenied();
    const expected = input.expectedVersion ?? 0;
    const flag = financeDashboardFlagSchema.parse({
      ...target,
      included: input.included,
      version: expected + 1,
    });
    return this.save(PK, flagKey(target), flag, expected, conditions, mutationId);
  }

  async setUpcomingCount(actor: FinanceActor, rawInput: unknown, mutationId?: string) {
    const PK = ownerPartition(actor);
    const { upcomingCount, expectedVersion } = financeDashboardSettingsUpdateSchema.parse(rawInput);
    const settings = financeDashboardSettingsSchema.parse({
      upcomingCount,
      version: expectedVersion + 1,
    });
    return this.save(PK, settingsKey, settings, expectedVersion, [], mutationId);
  }

  private async save<T extends { version: number }>(
    PK: string,
    SK: string,
    data: T,
    expected: number,
    conditions: SourceConditions,
    mutationId?: string,
  ) {
    const TableName = this.options.tableName;
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const existing =
      expected === 0
        ? undefined
        : (
            await this.options.client.send(
              new GetCommand({
                TableName,
                Key: { PK, SK },
                ConsistentRead: true,
              }),
            )
          ).Item;
    const fingerprint = JSON.stringify([SK, data]);
    const receiptKey = mutationId
      ? {
          PK,
          SK: `FINANCE_DASHBOARD_MUTATION#${createHash('sha256').update(mutationId).digest('hex')}`,
        }
      : undefined;
    const replay = async () => {
      if (!receiptKey) return false;
      const { Item } = await this.options.client.send(
        new GetCommand({
          TableName,
          Key: receiptKey,
          ConsistentRead: true,
        }),
      );
      if (!Item) return false;
      if (Item.fingerprint !== fingerprint) throw new Error('Finance preference version conflict.');
      return true;
    };
    await this.options.authorizeWrite?.();
    if (await replay()) return data;
    try {
      await this.options.client.send(
        new TransactWriteCommand({
          TransactItems: [
            ...conditions,
            {
              Put: {
                TableName,
                Item: {
                  PK,
                  SK: `FINANCE_DASHBOARD_REV#${SK}#${data.version}`,
                  data,
                  createdAt: now,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            ...(receiptKey
              ? [
                  {
                    Put: {
                      TableName,
                      Item: {
                        ...receiptKey,
                        fingerprint,
                        expiresAt: Math.floor(Date.parse(now) / 1_000) + 86_400,
                      },
                      ConditionExpression: 'attribute_not_exists(PK)',
                    },
                  },
                ]
              : []),
            {
              Put: {
                TableName,
                Item: {
                  PK,
                  SK,
                  data,
                  version: data.version,
                  createdAt: existing?.createdAt ?? now,
                  updatedAt: now,
                },
                ...(expected === 0
                  ? { ConditionExpression: 'attribute_not_exists(PK)' }
                  : {
                      ConditionExpression: '#version = :expected',
                      ExpressionAttributeNames: { '#version': 'version' },
                      ExpressionAttributeValues: { ':expected': expected },
                    }),
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') throw error;
      if (await replay()) return data;
      throw new Error('Finance preference version conflict.');
    }
    return data;
  }
}
