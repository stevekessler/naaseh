import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  decodePaginationCursor,
  decodeStoredPaginationCursorState,
  encodePaginationCursor,
  encodeStoredPaginationCursorState,
  PaginationCursorError,
  type PaginationCursorPayload,
} from './pagination-cursor.js';
import { dynamodb, tableName } from './dynamodb.js';
import { keys } from './keys.js';

export interface PersistedCursorRecord {
  actorId: string;
  cursorId: string;
  encryptedState: string;
  expiresAt: number;
}

export interface PersistedCursorRepository {
  put(record: PersistedCursorRecord): Promise<void>;
  get(actorId: string, cursorId: string): Promise<PersistedCursorRecord | undefined>;
  delete(actorId: string, cursorId: string): Promise<void>;
}

export interface PaginationCursorCodec {
  encode(payload: PaginationCursorPayload): Promise<string>;
  decode(token: string, actorId: string, now: number): Promise<PaginationCursorPayload>;
}

const invalid = () =>
  new PaginationCursorError(
    400,
    'invalid_cursor',
    'Cursor is malformed or invalid; restart pagination.',
  );

const signatureKey = (secret: string) =>
  createHash('sha256').update(`cursor-reference:${secret}`).digest();

function referenceToken(cursorId: string, expiresAt: number, secret: string) {
  const unsigned = `r1.${cursorId}.${expiresAt}`;
  const signature = createHmac('sha256', signatureKey(secret)).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function parseReference(token: string, secret: string) {
  const [version, cursorId, expires, signature, extra] = token.split('.');
  const expiresAt = Number(expires);
  if (
    version !== 'r1' ||
    !cursorId ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    !signature ||
    extra !== undefined
  )
    throw invalid();
  const unsigned = `${version}.${cursorId}.${expiresAt}`;
  const expected = createHmac('sha256', signatureKey(secret)).update(unsigned).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (
    actual.toString('base64url') !== signature ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw invalid();
  return { cursorId, expiresAt };
}

export function createPaginationCursorCodec(
  secret: string,
  repository: PersistedCursorRepository,
): PaginationCursorCodec {
  return {
    async encode(payload) {
      if (Object.keys(payload.sourceEpochs).length <= 1)
        return encodePaginationCursor(payload, secret);
      const cursorId = randomUUID();
      await repository.put({
        actorId: payload.actorId,
        cursorId,
        encryptedState: encodeStoredPaginationCursorState(payload, secret),
        expiresAt: payload.expiresAt,
      });
      return referenceToken(cursorId, payload.expiresAt, secret);
    },
    async decode(token, actorId, now) {
      if (!token.startsWith('r1.')) return decodePaginationCursor(token, secret);
      const reference = parseReference(token, secret);
      if (reference.expiresAt <= now)
        throw new PaginationCursorError(
          410,
          'cursor_expired',
          'Cursor expired; restart pagination.',
        );
      const stored = await repository.get(actorId, reference.cursorId);
      if (!stored || stored.actorId !== actorId || stored.expiresAt !== reference.expiresAt)
        throw invalid();
      const payload = decodeStoredPaginationCursorState(stored.encryptedState, secret);
      if (payload.actorId !== actorId || payload.expiresAt !== stored.expiresAt) throw invalid();
      return payload;
    },
  };
}

export const dynamoPersistedCursorRepository: PersistedCursorRepository = {
  async put(record) {
    await dynamodb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...keys.paginationCursor(record.actorId, record.cursorId),
          encryptedState: record.encryptedState,
          expiresAt: Math.ceil(record.expiresAt / 1_000),
          expiresAtMs: record.expiresAt,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  },
  async get(actorId, cursorId) {
    const response = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.paginationCursor(actorId, cursorId),
        ConsistentRead: true,
      }),
    );
    if (!response.Item) return undefined;
    return {
      actorId,
      cursorId,
      encryptedState: String(response.Item.encryptedState),
      expiresAt: Number(response.Item.expiresAtMs),
    };
  },
  async delete(actorId, cursorId) {
    await dynamodb.send(
      new DeleteCommand({ TableName: tableName, Key: keys.paginationCursor(actorId, cursorId) }),
    );
  },
};
