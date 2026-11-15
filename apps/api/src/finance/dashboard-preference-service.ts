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
          KeyConditionExpression: 'PK = :owner AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':owner': PK, ':prefix': prefix },
          ConsistentRead: true,
          Limit: 25,
          ExclusiveStartKey: cursor,
        }),
      );
      const pageFlags = await Promise.all(
        (page.Items ?? []).map(async (row) => {
          if (row.PK !== PK) throw new Error('Invalid Finance dashboard preference owner.');
          const { data, version } = row;
          if (row.SK === settingsKey) {
            settings = financeDashboardSettingsSchema.parse(data);
            if (settings.version !== version)
              throw new Error('Invalid Finance dashboard settings version.');
            return undefined;
          }
          const flag = financeDashboardFlagSchema.parse(data);
          if (row.SK !== flagKey(flag) || flag.version !== version)
            throw new Error('Invalid Finance dashboard flag identity.');
          const target = { targetKind: flag.targetKind, targetId: flag.targetId };
          return (await this.options.authorizeTarget(actor, target)) ? flag : undefined;
        }),
      );
      flags.push(...pageFlags.filter((flag) => flag !== undefined));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return { flags, settings };
  }

  async setFlag(actor: FinanceActor, rawTarget: unknown, rawInput: unknown) {
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
    await this.save(PK, flagKey(target), flag, expected, conditions);
    return flag;
  }

  async setUpcomingCount(actor: FinanceActor, rawInput: unknown) {
    const PK = ownerPartition(actor);
    const { upcomingCount, expectedVersion } = financeDashboardSettingsUpdateSchema.parse(rawInput);
    const settings = financeDashboardSettingsSchema.parse({
      upcomingCount,
      version: expectedVersion + 1,
    });
    await this.save(PK, settingsKey, settings, expectedVersion, []);
    return settings;
  }

  private async save(
    PK: string,
    SK: string,
    data: { version: number },
    expected: number,
    conditions: SourceConditions,
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
    await this.options.client.send(
      new TransactWriteCommand({
        TransactItems: [
          ...conditions,
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
  }
}
