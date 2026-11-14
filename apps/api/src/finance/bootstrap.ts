import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { financeSyncSourceCollections, type FinanceSyncSourceGuard } from './sync-source-guard.js';

// Cache proofs intentionally cap the complete dependency closure at 64 scopes.
const MAX_PARTITIONS = 64;
export const FINANCE_BOOTSTRAP_PAGE_SIZE = 100;
export const FINANCE_BOOTSTRAP_LIFETIME_MS = 15 * 60_000;

type Key = { PK: string; SK: string };
type BootstrapState = {
  userId: string;
  partitions: string[];
  revisions: number[];
  frontier: Record<string, number>;
  partitionIndex: number;
  cursor?: Key;
  expiresAt: number;
};
type BootstrapRow = Key & {
  collection?: unknown;
  entryKey?: unknown;
  data?: unknown;
};

export interface FinanceBootstrapRecord {
  entityType: string;
  entityId: string;
  version: number;
  scopeKey: string;
  updatedAt: string;
  value: Record<string, unknown>;
}

export interface FinanceBootstrapPage {
  records: FinanceBootstrapRecord[];
  frontier: Record<string, number>;
  complete: boolean;
  nextCursor?: string;
}

interface BootstrapDependencies {
  revision: (partition: string) => Promise<number>;
  frontier: (partitions: string[]) => Promise<Record<string, number>>;
  page: (partition: string, cursor?: Key) => Promise<{ rows: BootstrapRow[]; cursor?: Key }>;
  guard: Pick<FinanceSyncSourceGuard, 'readCanonicalSource' | 'assertCurrent'>;
  now?: () => number;
}

const entityTypes = new Map(
  Object.entries(financeSyncSourceCollections).map(([entityType, collection]) => [
    collection,
    entityType,
  ]),
);

const cursorKey = (secret: string) => {
  if (secret.length < 32) throw new Error('Finance bootstrap cursor secret is too short.');
  return createHash('sha256').update(`naaseh-finance-bootstrap-v1:${secret}`).digest();
};

function encodeCursor(state: BootstrapState, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cursorKey(secret), iv);
  cipher.setAAD(Buffer.from(state.userId));
  const body = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  return `fb1.${iv.toString('base64url')}.${body.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

function decodeCursor(value: string, userId: string, secret: string, now: number): BootstrapState {
  try {
    if (value.length > 100_000) throw new Error();
    const [version, nonce, body, tag, extra] = value.split('.');
    if (version !== 'fb1' || !nonce || !body || !tag || extra) throw new Error();
    const iv = Buffer.from(nonce, 'base64url');
    const signature = Buffer.from(tag, 'base64url');
    if (iv.length !== 12 || signature.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', cursorKey(secret), iv);
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(signature);
    const state = JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString(
        'utf8',
      ),
    ) as BootstrapState;
    if (
      state.userId !== userId ||
      !Array.isArray(state.partitions) ||
      !Array.isArray(state.revisions) ||
      state.partitions.length < 2 ||
      state.partitions.length > MAX_PARTITIONS ||
      state.partitions.length !== state.revisions.length ||
      new Set(state.partitions).size !== state.partitions.length ||
      state.partitions.some((partition) => !validPartition(partition, userId)) ||
      state.revisions.some((revision) => !Number.isSafeInteger(revision) || revision < 0) ||
      !Number.isSafeInteger(state.partitionIndex) ||
      state.partitionIndex < 0 ||
      state.partitionIndex >= state.partitions.length ||
      !Number.isFinite(state.expiresAt) ||
      state.expiresAt <= now ||
      !validFrontier(state.frontier) ||
      (state.cursor !== undefined &&
        (state.cursor.PK !== state.partitions[state.partitionIndex] ||
          typeof state.cursor.SK !== 'string' ||
          !state.cursor.SK.startsWith('ROW#')))
    )
      throw new Error();
    return state;
  } catch {
    throw new Error('Invalid or expired Finance bootstrap cursor.');
  }
}

const validPartition = (partition: string, userId: string) =>
  partition === 'FINANCE#CATALOG' ||
  partition === `FINANCE#SCOPE#OWNER#${userId}` ||
  /^FINANCE#SCOPE#GROUP#[^#]+$/u.test(partition);

const validFrontier = (value: unknown): value is Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_PARTITIONS &&
    entries.every(
      ([key, sequence]) =>
        Boolean(key) &&
        key.length <= 256 &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        Number.isSafeInteger(sequence) &&
        Number(sequence) >= 0,
    )
  );
};

function validatePartitions(partitions: string[], userId: string) {
  if (
    partitions.length < 2 ||
    partitions.length > MAX_PARTITIONS ||
    partitions[0] !== 'FINANCE#CATALOG' ||
    partitions[1] !== `FINANCE#SCOPE#OWNER#${userId}` ||
    new Set(partitions).size !== partitions.length ||
    partitions.some((partition) => !validPartition(partition, userId))
  )
    throw new Error('Finance bootstrap scope is invalid.');
}

async function assertRevisions(state: BootstrapState, deps: BootstrapDependencies) {
  const current = await Promise.all(state.partitions.map((partition) => deps.revision(partition)));
  if (current.some((revision, index) => revision !== state.revisions[index]))
    throw new Error('Finance changed during bootstrap. Restart synchronization.');
}

/**
 * Read one strongly fenced current-state page. Every continuation is bound to the user,
 * authorized partition set, initial feed frontier and all canonical scope revisions.
 */
export async function readFinanceBootstrapPage(input: {
  userId: string;
  partitions: string[];
  cursor?: string;
  secret: string;
  dependencies: BootstrapDependencies;
}): Promise<FinanceBootstrapPage> {
  validatePartitions(input.partitions, input.userId);
  const deps = input.dependencies;
  const now = deps.now?.() ?? Date.now();
  const state = input.cursor
    ? decodeCursor(input.cursor, input.userId, input.secret, now)
    : {
        userId: input.userId,
        partitions: input.partitions,
        revisions: await Promise.all(input.partitions.map((partition) => deps.revision(partition))),
        frontier: await deps.frontier(input.partitions),
        partitionIndex: 0,
        expiresAt: now + FINANCE_BOOTSTRAP_LIFETIME_MS,
      };
  if (JSON.stringify(state.partitions) !== JSON.stringify(input.partitions))
    throw new Error('Finance access changed during bootstrap. Restart synchronization.');
  await assertRevisions(state, deps);
  const partition = state.partitions[state.partitionIndex]!;
  const page = await deps.page(partition, state.cursor);
  const records: FinanceBootstrapRecord[] = [];
  const asOf = new Date(now).toISOString();
  for (const row of page.rows) {
    const collection = typeof row.collection === 'string' ? row.collection : '';
    const entityType = entityTypes.get(collection);
    if (!entityType || typeof row.entryKey !== 'string') continue;
    const value = await deps.guard.readCanonicalSource(entityType, row.entryKey);
    if (!value) continue;
    const version =
      value.version ??
      (['financeBalanceSnapshot', 'financeReconciliation'].includes(entityType) ? 1 : undefined);
    if (!Number.isSafeInteger(version) || Number(version) < 1 || value.id !== row.entryKey)
      throw new Error('Finance bootstrap source identity is invalid.');
    const updatedAt =
      typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
        ? value.updatedAt
        : asOf;
    records.push({
      entityType,
      entityId: row.entryKey,
      version: Number(version),
      scopeKey: partition === 'FINANCE#CATALOG' ? 'CATALOG' : partition.slice(14),
      updatedAt,
      value,
    });
  }
  await deps.guard.assertCurrent();
  await assertRevisions(state, deps);
  const next = { ...state };
  if (page.cursor) next.cursor = page.cursor;
  else {
    next.partitionIndex++;
    delete next.cursor;
  }
  const complete = next.partitionIndex >= next.partitions.length;
  return {
    records,
    frontier: state.frontier,
    complete,
    ...(complete ? {} : { nextCursor: encodeCursor(next, input.secret) }),
  };
}

function feedForPartition(partition: string): [string, string] {
  if (partition === 'FINANCE#CATALOG') return ['public', 'PUBLIC'];
  if (partition.startsWith('FINANCE#SCOPE#OWNER#'))
    return ['owner', `OWNER#${partition.slice(20)}`];
  const groupId = partition.slice('FINANCE#SCOPE#GROUP#'.length);
  return [`group:${groupId}`, `GROUP#${groupId}`];
}

/** DynamoDB readers are exported separately so tests never need a live table. */
export function financeBootstrapDynamoDependencies(
  guard: BootstrapDependencies['guard'],
): BootstrapDependencies {
  return {
    guard,
    revision: async (partition) => {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: partition, SK: 'META' },
          ConsistentRead: true,
          ProjectionExpression: '#revision',
          ExpressionAttributeNames: { '#revision': 'revision' },
        }),
      );
      const revision = Number(result.Item?.revision ?? 0);
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw new Error('Finance bootstrap revision is invalid.');
      return revision;
    },
    frontier: async (partitions) =>
      Object.fromEntries(
        await Promise.all(
          partitions.map(async (partition) => {
            const [name, audience] = feedForPartition(partition);
            const result = await dynamodb.send(
              new GetCommand({
                TableName: tableName,
                Key: { PK: `FEED#${audience}`, SK: 'COUNTER' },
                ConsistentRead: true,
                ProjectionExpression: '#value',
                ExpressionAttributeNames: { '#value': 'value' },
              }),
            );
            const sequence = Number(result.Item?.value ?? 0);
            if (!Number.isSafeInteger(sequence) || sequence < 0)
              throw new Error('Finance bootstrap frontier is invalid.');
            return [name, sequence] as const;
          }),
        ),
      ),
    page: async (partition, cursor) => {
      const result = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          ConsistentRead: true,
          Limit: FINANCE_BOOTSTRAP_PAGE_SIZE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :row)',
          ExpressionAttributeValues: { ':pk': partition, ':row': 'ROW#' },
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      return {
        rows: (result.Items ?? []) as BootstrapRow[],
        ...(result.LastEvaluatedKey ? { cursor: result.LastEvaluatedKey as Key } : {}),
      };
    },
  };
}
