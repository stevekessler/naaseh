import { createHash } from 'node:crypto';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { expenseRefundRelationshipSchema } from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import { FINANCE_REFUND_RELATIONSHIP_COLLECTION } from './canonical-spend-source.js';
import { FinanceExperienceFailure } from './telemetry.js';

type IndexRow = FinanceRecordKey & { entryKey: string; collection: string; data: unknown };
type Checkpoint = { sourceRevision: number; examined: number; cursor?: FinanceRecordKey };
const invalid = (): never => {
  throw new FinanceExperienceFailure('invariant', 'Finance refund source/index invariant failed.');
};
const stale = (): never => {
  throw new FinanceExperienceFailure(
    'capacity',
    'Finance refund index revision changed; restart required.',
    'user',
  );
};

/** Trusted bounded migration. Only this proof allows a missing credit singleton to mean no link. */
export class FinanceRefundIndexVerifier {
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
      ) => Promise<{ rows: IndexRow[]; nextKey?: FinanceRecordKey }>;
    } = {},
  ) {
    this.work = options.work ?? (() => new FinanceUnitOfWork());
    this.pageSize = options.pageSize ?? 10;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 10)
      throw new Error('Refund index page must contain 1–10 relationships.');
  }
  async step(PK: string, options: { restart?: boolean } = {}) {
    if (!/^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(PK)) return invalid();
    const work = this.work();
    const metaKey = { PK, SK: 'META' };
    const meta = await work.get(metaKey);
    if (!meta || !Number.isSafeInteger(meta.revision) || Number(meta.revision) < 0)
      return invalid();
    if (
      meta.refundRelationshipIndexVersion !== undefined &&
      meta.refundRelationshipIndexVersion !== 0 &&
      meta.refundRelationshipIndexVersion !== 1
    )
      throw new FinanceExperienceFailure(
        'capacity',
        'Unsupported Finance refund index protocol version.',
        'user',
      );
    const checkpointKey = { PK, SK: 'REFUND_INDEX_BACKFILL' };
    const saved = (await work.get(checkpointKey))?.data as Checkpoint | undefined;
    if (meta.refundRelationshipIndexVersion === 1)
      return { complete: true, examined: saved?.examined ?? 0 };
    if (saved && (!Number.isSafeInteger(saved.examined) || saved.examined < 0)) return invalid();
    if (saved && saved.sourceRevision !== meta.revision && !options.restart) return stale();
    const checkpoint: Checkpoint =
      saved && !options.restart
        ? structuredClone(saved)
        : { sourceRevision: Number(meta.revision), examined: 0 };
    const page = this.options.readPage
      ? await this.options.readPage(PK, checkpoint.cursor, this.pageSize)
      : await this.readPage(PK, checkpoint.cursor);
    if (page.rows.length > this.pageSize) return invalid();
    if (
      page.nextKey &&
      (page.nextKey.PK !== PK ||
        !page.nextKey.SK.startsWith('ROW#refundRelationships#') ||
        (checkpoint.cursor && page.nextKey.SK <= checkpoint.cursor.SK))
    )
      return invalid();
    for (const row of page.rows) {
      const parsed = expenseRefundRelationshipSchema.safeParse(row.data);
      if (
        !parsed.success ||
        row.PK !== PK ||
        !row.SK.startsWith('ROW#refundRelationships#') ||
        row.collection !== FINANCE_REFUND_RELATIONSHIP_COLLECTION ||
        row.entryKey !== parsed.data.refundTransactionId
      )
        return invalid();
      const linked = await loadTargetedFinanceEntity(
        work,
        FINANCE_REFUND_RELATIONSHIP_COLLECTION,
        row.entryKey,
      );
      if (!linked || linked.storageKey.PK !== PK || linked.storageKey.SK !== row.SK)
        return invalid();
      const credit = await loadTargetedFinanceEntity<{ id: string }>(
        work,
        'transactions',
        row.entryKey,
      );
      if (!credit || credit.value.id !== row.entryKey || credit.storageKey.PK !== PK)
        return invalid();
    }
    checkpoint.examined += page.rows.length;
    if (checkpoint.examined > 1_000_000)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance refund index enumeration budget exceeded.',
        'user',
      );
    const complete = !page.nextKey;
    if (page.nextKey) checkpoint.cursor = page.nextKey;
    else {
      delete checkpoint.cursor;
      await work.put({
        ...meta,
        refundRelationshipIndexVersion: 1,
        revision: Number(meta.revision) + 1,
      });
    }
    await work.put({ ...checkpointKey, data: checkpoint });
    const fingerprint = createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex');
    return work.commit({
      key: { PK, SK: `REFUND_INDEX_RECEIPT#${fingerprint}` },
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
        ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#refundRelationships#' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    return {
      rows: (page.Items ?? []) as IndexRow[],
      ...(page.LastEvaluatedKey ? { nextKey: page.LastEvaluatedKey as FinanceRecordKey } : {}),
    };
  }
}
