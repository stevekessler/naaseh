import { GetCommand, QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import type { FinanceRecordKey } from './unit-of-work.js';
import { z } from 'zod';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { FinanceExperienceFailure } from './telemetry.js';
import {
  isFinanceScopePartition,
  financePublicationJournalRecords,
} from './publication-change-journal.js';

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identity = z.string().min(1).max(200);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// Field order reproduces the v1 writer's identity, independent of DynamoDB map order.
const change = z
  .object({
    scopePK: identity.refine(isFinanceScopePartition),
    keyHash: digest,
    collection: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9]*$/)
      .max(100),
    sourceId: identity.optional(),
    accountIds: z
      .array(identity)
      .max(100)
      .refine((ids) => ids.every((id, index) => index === 0 || ids[index - 1]! < id)),
    beforeVersion: revision.optional(),
    afterVersion: revision.optional(),
    removed: z.literal(true).optional(),
  })
  .strict();
const transition = z
  .object({
    PK: identity.refine(isFinanceScopePartition),
    beforeRevision: revision,
    afterRevision: revision,
  })
  .strict();
const manifestSchema = z
  .object({
    PK: z.literal('FINANCE#PUBLICATION_OUTBOX'),
    SK: z.string(),
    format: z.literal('finance-publication-change-v1'),
    id: digest,
    state: z.enum(['pending', 'complete']),
    createdAt: z.string().datetime(),
    changes: z.array(change).max(100),
    scopes: z.array(transition).min(1).max(100),
  })
  .strict();
export type FinancePublicationManifest = z.infer<typeof manifestSchema>;
export const financePublicationArchiveFormat = 'finance-publication-archive-v1';
export const financePublicationArchiveKey = (id: string) => ({
  PK: `FINANCE#PUBLICATION_MANIFEST#${id}`,
  SK: 'CURRENT',
});
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

export function parseFinancePublicationManifest(
  input: unknown,
  publicationId: string,
): FinancePublicationManifest {
  const parsed = manifestSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.id !== publicationId ||
    parsed.data.SK !== `PENDING#${publicationId}` ||
    new Set(parsed.data.changes.map((value) => value.keyHash)).size !== parsed.data.changes.length
  )
    return fail('Finance publication manifest identity or format is invalid.');
  let records;
  try {
    const changes = parsed.data.changes.map((value) => ({
      scopePK: value.scopePK,
      keyHash: value.keyHash,
      collection: value.collection,
      ...(value.sourceId === undefined ? {} : { sourceId: value.sourceId }),
      accountIds: value.accountIds,
      ...(value.beforeVersion === undefined ? {} : { beforeVersion: value.beforeVersion }),
      ...(value.afterVersion === undefined ? {} : { afterVersion: value.afterVersion }),
      ...(value.removed ? { removed: true as const } : {}),
    }));
    records = financePublicationJournalRecords(changes, parsed.data.scopes);
  } catch {
    return fail('Finance publication manifest revision transition is invalid.');
  }
  if (records[0]?.id !== publicationId)
    return fail('Finance publication manifest digest does not match.');
  return parsed.data;
}

export async function loadFinancePublicationManifest(
  id: string,
  get: (key: FinanceRecordKey) => Promise<Record<string, unknown> | undefined>,
) {
  if (!/^[a-f0-9]{64}$/.test(id)) return fail('Finance publication manifest identity is invalid.');
  const pending = await get({ PK: 'FINANCE#PUBLICATION_OUTBOX', SK: `PENDING#${id}` });
  if (pending) return { manifest: parseFinancePublicationManifest(pending, id), archived: false };
  const key = financePublicationArchiveKey(id),
    archive = await get(key);
  if (
    !archive ||
    archive.PK !== key.PK ||
    archive.SK !== key.SK ||
    archive.format !== financePublicationArchiveFormat ||
    archive.publicationId !== id
  )
    return fail('Finance publication manifest is unavailable.');
  return { manifest: parseFinancePublicationManifest(archive.data, id), archived: true };
}

/** Strong bounded replay. Gaps block progress; canonical snapshots are rechecked by the consumer. */
export class FinancePublicationJournalReader {
  constructor(
    private readonly options: {
      query?: (input: QueryCommandInput) => Promise<{ Items?: Record<string, unknown>[] }>;
      get?: (key: FinanceRecordKey) => Promise<Record<string, unknown> | undefined>;
    } = {},
  ) {}
  async range(
    scope: string,
    after: number,
    through: number,
  ): Promise<{ entries: FinancePublicationManifest[]; nextRevision?: number }> {
    if (
      !isFinanceScopePartition(scope) ||
      scope.length > 200 ||
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(through) ||
      through < after
    )
      return fail('Finance journal revision range is invalid.');
    if (after === through) return { entries: [] };
    const last = Math.min(through, after + 5);
    const key = (value: number) => `PUBLICATION_CHANGE#${String(value).padStart(16, '0')}`;
    const input: QueryCommandInput = {
      TableName: tableName,
      ConsistentRead: true,
      Limit: 5,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :first AND :last',
      ExpressionAttributeValues: { ':pk': scope, ':first': key(after + 1), ':last': key(last) },
    };
    const page = this.options.query
      ? await this.options.query(input)
      : await dynamodb.send(new QueryCommand(input));
    const rows = page.Items ?? [];
    if (rows.length !== last - after)
      return fail('Finance journal revision gap prevents contiguous replay.');
    const entries = new Map<string, FinancePublicationManifest>();
    for (const [index, row] of rows.entries()) {
      const expected = after + index + 1;
      if (
        row.PK !== scope ||
        row.SK !== key(expected) ||
        row.format !== 'finance-publication-change-v1' ||
        row.beforeRevision !== expected - 1 ||
        row.afterRevision !== expected ||
        !digest.safeParse(row.publicationId).success
      )
        return fail('Finance journal revision identity, order or format is invalid.');
      const id = row.publicationId as string;
      let manifest = entries.get(id);
      if (!manifest) {
        const loaded = await loadFinancePublicationManifest(
          id,
          this.options.get ??
            (async (key) =>
              (
                await dynamodb.send(
                  new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
                )
              ).Item),
        );
        manifest = loaded.manifest;
        entries.set(id, manifest);
      }
      if (
        !manifest.scopes.some(
          (value) =>
            value.PK === scope &&
            value.beforeRevision === expected - 1 &&
            value.afterRevision === expected,
        )
      )
        return fail('Finance journal transition is absent from its publication manifest.');
    }
    return { entries: [...entries.values()], ...(last < through ? { nextRevision: last } : {}) };
  }
}
