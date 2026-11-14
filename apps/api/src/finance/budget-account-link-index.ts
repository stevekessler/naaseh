import { createHash } from 'node:crypto';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ulidSchema, type BudgetAccountLink } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { FinanceUnitOfWork, type FinanceRecordKey } from './unit-of-work.js';
import { FinanceExperienceFailure } from './telemetry.js';

export const FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION = 1;

const digestPair = (budgetId: string, accountId: string) =>
  createHash('sha256')
    .update(JSON.stringify([budgetId, accountId]))
    .digest('hex');

/** Server-only singleton proving the active link chosen for one budget/account pair. */
export const financeBudgetAccountPairKey = (
  budgetId: string,
  accountId: string,
): FinanceRecordKey => ({
  PK: `FINANCE#RELATION#BUDGET_ACCOUNT#${digestPair(budgetId, accountId)}`,
  SK: 'ACTIVE',
});

export interface FinanceBudgetAccountPairLocator extends FinanceRecordKey {
  linkId: string;
  storageKey: FinanceRecordKey;
}

type LinkRow = FinanceRecordKey & {
  collection: 'budgetAccountLinks';
  entryKey: string;
  data: BudgetAccountLink;
};
type Checkpoint = { sourceRevision: number; examined: number; cursor?: FinanceRecordKey };

const invariant = (message = 'Finance budget/account link index invariant failed.'): never => {
  throw new FinanceExperienceFailure('invariant', message);
};
const stale = (): never => {
  throw new FinanceExperienceFailure(
    'capacity',
    'Finance budget/account link index revision changed; restart required.',
    'user',
  );
};

const validLink = (row: LinkRow) => {
  const link = row.data;
  return (
    row.collection === 'budgetAccountLinks' &&
    row.entryKey === link?.id &&
    ulidSchema.safeParse(link?.id).success &&
    ulidSchema.safeParse(link?.budgetId).success &&
    ulidSchema.safeParse(link?.accountId).success &&
    (link?.status === 'active' || link?.status === 'removed') &&
    Number.isSafeInteger(link?.version) &&
    link.version > 0
  );
};

/** Trusted bounded migration. User writes never enumerate a scope to infer pair uniqueness. */
export class FinanceBudgetAccountLinkIndexVerifier {
  private readonly work: () => FinanceUnitOfWork;
  private readonly pageSize: number;

  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      pageSize?: number;
      readPage?: (
        partition: string,
        cursor: FinanceRecordKey | undefined,
        limit: number,
      ) => Promise<{ rows: LinkRow[]; nextKey?: FinanceRecordKey }>;
    } = {},
  ) {
    this.work = options.work ?? (() => new FinanceUnitOfWork());
    this.pageSize = options.pageSize ?? 10;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 20)
      throw new Error('Budget/account link index page must contain 1–20 links.');
  }

  async step(PK: string, options: { restart?: boolean } = {}) {
    if (!/^FINANCE#SCOPE#GROUP#[^#]+$/u.test(PK)) return invariant();
    const work = this.work();
    const metaKey = { PK, SK: 'META' };
    const meta = await work.get(metaKey);
    if (!meta || !Number.isSafeInteger(meta.revision) || Number(meta.revision) < 0)
      return invariant();
    if (
      meta.budgetAccountLinkIndexVersion !== undefined &&
      meta.budgetAccountLinkIndexVersion !== 0 &&
      meta.budgetAccountLinkIndexVersion !== FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION
    )
      throw new FinanceExperienceFailure(
        'capacity',
        'Unsupported Finance budget/account link index protocol version.',
        'user',
      );
    const checkpointKey = { PK, SK: 'BUDGET_ACCOUNT_LINK_INDEX_BACKFILL' };
    const saved = (await work.get(checkpointKey))?.data as Checkpoint | undefined;
    if (meta.budgetAccountLinkIndexVersion === FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION)
      return { complete: true, examined: saved?.examined ?? 0 };
    if (saved && (!Number.isSafeInteger(saved.examined) || saved.examined < 0)) return invariant();
    if (saved && saved.sourceRevision !== meta.revision && !options.restart) return stale();
    const checkpoint: Checkpoint =
      saved && !options.restart
        ? structuredClone(saved)
        : { sourceRevision: Number(meta.revision), examined: 0 };
    const page = this.options.readPage
      ? await this.options.readPage(PK, checkpoint.cursor, this.pageSize)
      : await this.readPage(PK, checkpoint.cursor);
    if (page.rows.length > this.pageSize) return invariant();
    if (
      page.nextKey &&
      (page.nextKey.PK !== PK ||
        !page.nextKey.SK.startsWith('ROW#budgetAccountLinks#') ||
        (checkpoint.cursor && page.nextKey.SK <= checkpoint.cursor.SK))
    )
      return invariant();
    for (const candidate of page.rows) {
      const row = (await work.get({ PK, SK: candidate.SK })) as LinkRow | undefined;
      if (
        !row ||
        row.PK !== PK ||
        row.SK !== candidate.SK ||
        !row.SK.startsWith('ROW#budgetAccountLinks#') ||
        !validLink(row)
      )
        return invariant();
      const key = financeBudgetAccountPairKey(row.data.budgetId, row.data.accountId);
      const present = (await work.get(key)) as FinanceBudgetAccountPairLocator | undefined;
      const expected = { PK, SK: row.SK };
      if (row.data.status !== 'active') {
        if (
          present?.linkId === row.data.id &&
          present.storageKey?.PK === expected.PK &&
          present.storageKey?.SK === expected.SK
        )
          await work.delete(key);
        continue;
      }
      if (
        present &&
        (present.linkId !== row.data.id ||
          present.storageKey?.PK !== expected.PK ||
          present.storageKey?.SK !== expected.SK)
      )
        return invariant(
          'Duplicate active Finance budget/account links require operator review before backfill.',
        );
      await work.put({ ...key, linkId: row.data.id, storageKey: expected });
    }
    checkpoint.examined += page.rows.length;
    if (checkpoint.examined > 1_000_000)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance budget/account link enumeration budget exceeded.',
        'user',
      );
    const complete = !page.nextKey;
    if (page.nextKey) checkpoint.cursor = page.nextKey;
    else {
      delete checkpoint.cursor;
      await work.put({
        ...meta,
        budgetAccountLinkIndexVersion: FINANCE_BUDGET_ACCOUNT_LINK_INDEX_VERSION,
        revision: Number(meta.revision) + 1,
      });
    }
    await work.put({ ...checkpointKey, data: checkpoint });
    const fingerprint = createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex');
    return work.commit({
      key: { PK, SK: `BUDGET_ACCOUNT_LINK_INDEX_RECEIPT#${fingerprint}` },
      fingerprint,
      result: { complete, examined: checkpoint.examined },
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
  }

  private async readPage(PK: string, cursor?: FinanceRecordKey) {
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        ConsistentRead: true,
        Limit: this.pageSize,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#budgetAccountLinks#' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    return {
      rows: (page.Items ?? []) as LinkRow[],
      ...(page.LastEvaluatedKey ? { nextKey: page.LastEvaluatedKey as FinanceRecordKey } : {}),
    };
  }
}
