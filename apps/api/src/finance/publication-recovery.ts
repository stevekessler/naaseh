import { FinanceUnitOfWork, type FinanceRecordKey } from './unit-of-work.js';
import {
  emitFinanceExperienceEvent,
  FinanceExperienceFailure,
  type FinanceExperienceEventInput,
} from './telemetry.js';
import { parseFinancePublicationManifest } from './publication-journal-reader.js';
import { dispatchFinancePublicationWorker } from './publication-worker.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createUlid } from '@naaseh/domain';

const key = { PK: 'FINANCE#PUBLICATION_RECOVERY', SK: 'CURRENT' };
const cursorSchema = z
  .object({
    PK: z.literal('FINANCE#PUBLICATION_OUTBOX'),
    SK: z.string().regex(/^PENDING#[a-f0-9]{64}$/),
  })
  .strict();
const stateSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    cursor: cursorSchema.optional(),
  })
  .strict();
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** Fair bounded redispatch only; no rebuild, transaction mutation or pending-record expiry. */
export class FinancePublicationRecovery {
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      dispatch?: (id: string) => Promise<void>;
      emit?: (event: FinanceExperienceEventInput) => void;
      readPage?: (
        cursor?: FinanceRecordKey,
      ) => Promise<{ rows: Record<string, unknown>[]; nextKey?: FinanceRecordKey }>;
    } = {},
  ) {}
  async step(): Promise<{ selected: number; dispatched: number; failed: number }> {
    const work = (this.options.work ?? (() => new FinanceUnitOfWork()))();
    const saved = await work.get(key);
    const parsed = stateSchema.safeParse(saved ? saved.data : { version: 1, revision: 0 });
    if (!parsed.success) return fail('Finance publication recovery checkpoint format is invalid.');
    const state = parsed.data;
    const page = this.options.readPage
      ? await this.options.readPage(state.cursor)
      : await (async () => {
          const result = await dynamodb.send(
            new QueryCommand({
              TableName: tableName,
              ConsistentRead: true,
              Limit: 5,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
              ExpressionAttributeValues: {
                ':pk': 'FINANCE#PUBLICATION_OUTBOX',
                ':prefix': 'PENDING#',
              },
              ...(state.cursor ? { ExclusiveStartKey: state.cursor } : {}),
            }),
          );
          return {
            rows: result.Items ?? [],
            ...(result.LastEvaluatedKey
              ? { nextKey: result.LastEvaluatedKey as FinanceRecordKey }
              : {}),
          };
        })();
    if (page.rows.length > 5) return fail('Finance publication recovery page bound exceeded.');
    let previous = state.cursor?.SK;
    for (const row of page.rows) {
      if (
        !cursorSchema.safeParse({ PK: row.PK, SK: row.SK }).success ||
        (previous !== undefined && String(row.SK) <= previous)
      )
        return fail('Finance publication recovery page order is invalid.');
      previous = String(row.SK);
    }
    if (
      page.nextKey &&
      (!cursorSchema.safeParse(page.nextKey).success ||
        !page.rows.length ||
        page.nextKey.SK !== previous)
    )
      return fail('Finance publication recovery page cursor is invalid.');
    const emit = this.options.emit ?? emitFinanceExperienceEvent;
    const dispatch = this.options.dispatch ?? dispatchFinancePublicationWorker;
    const result = { selected: page.rows.length, dispatched: 0, failed: 0 };
    for (const row of page.rows) {
      const started = performance.now(),
        correlationId = createUlid();
      let manifest;
      try {
        manifest = parseFinancePublicationManifest(row, String(row.SK).slice('PENDING#'.length));
        if (manifest.state !== 'pending') throw new Error('Unexpected pending state.');
      } catch {
        result.failed++;
        emit({
          operation: 'projection',
          outcome: 'failed',
          correlationId,
          durationMs: performance.now() - started,
          errorCategory: 'invariant',
          retryKind: 'none',
        });
        continue;
      }
      const age = Math.max(0, Date.now() - Date.parse(manifest.createdAt));
      if (age >= 15 * 60_000)
        emit({
          operation: 'projection',
          outcome: 'failed',
          correlationId,
          durationMs: performance.now() - started,
          projectionLagMs: age,
          errorCategory: 'stalled',
          retryKind: 'automatic',
        });
      try {
        await dispatch(manifest.id);
        result.dispatched++;
      } catch {
        result.failed++;
        emit({
          operation: 'projection',
          outcome: 'failed',
          correlationId,
          durationMs: performance.now() - started,
          errorCategory: 'storage',
          retryKind: 'automatic',
        });
      }
    }
    // Empty/head-only polls need no checkpoint write. Keep a monotone revision
    // across wraps so old receipts can never swallow a later recovery cycle.
    if ((state.cursor?.SK ?? null) === (page.nextKey?.SK ?? null)) return result;
    const next = {
      version: 1 as const,
      revision: state.revision + 1,
      ...(page.nextKey ? { cursor: page.nextKey } : {}),
    };
    if (!stateSchema.safeParse(next).success)
      return fail('Finance recovery checkpoint revision budget exceeded.');
    await work.put({ ...key, data: next });
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([state.revision, next]))
      .digest('hex');
    return work.commit({
      key: { ...key, SK: `RECOVERY_RECEIPT#${fingerprint}` },
      fingerprint,
      result,
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
    });
  }
}

export async function executeFinancePublicationRecovery() {
  try {
    await new FinancePublicationRecovery().step();
  } catch (error) {
    const category = error instanceof FinanceExperienceFailure ? error.errorCategory : 'storage';
    emitFinanceExperienceEvent({
      operation: 'projection',
      outcome: 'failed',
      correlationId: createUlid(),
      durationMs: 0,
      errorCategory: category,
      retryKind: error instanceof FinanceExperienceFailure ? error.retryKind : 'automatic',
    });
    throw new FinanceExperienceFailure(category, 'Finance publication recovery failed.');
  }
}
