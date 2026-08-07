import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const MAX_PAGINATION_CURSOR_BYTES = 4096;
export const PAGINATION_CURSOR_TTL_MS = 15 * 60 * 1_000;

const defaultSecret =
  process.env.CURSOR_SIGNING_SECRET ?? 'local-pagination-cursor-secret-not-for-production';

export type PaginationCursorCode =
  | 'invalid_cursor'
  | 'pagination_context_changed'
  | 'cursor_expired';

export class PaginationCursorError extends Error {
  constructor(
    readonly status: 400 | 409 | 410,
    readonly code: PaginationCursorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaginationCursorError';
  }
}

export interface PaginationCursorContext {
  actorId: string;
  accessEpoch: number;
  endpoint: string;
  scope: string;
  orderBy: string;
  filters: unknown;
  sourceEpochs: Record<string, number>;
  sourcePositions?: Record<string, unknown> | undefined;
  stackVersion?: number | undefined;
  snapshotGeneration?: number | undefined;
  tailWatermark?: string | undefined;
  now: number;
}

export interface PaginationCursorPayload {
  version: 1;
  actorId: string;
  accessEpoch: number;
  endpoint: string;
  scope: string;
  orderBy: string;
  filterHash: string;
  sourceEpochs: Record<string, number>;
  sourcePositions?: Record<string, unknown> | undefined;
  stackVersion?: number | undefined;
  snapshotGeneration?: number | undefined;
  tailWatermark?: string | undefined;
  nextIndex: number;
  issuedAt: number;
  expiresAt: number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

export function paginationContextFingerprint(context: PaginationCursorContext) {
  return {
    immutable: digest({
      actorId: context.actorId,
      endpoint: context.endpoint,
      scope: context.scope,
      orderBy: context.orderBy,
      filters: context.filters,
    }),
    mutable: digest({
      accessEpoch: context.accessEpoch,
      sourceEpochs: context.sourceEpochs,
      stackVersion: context.stackVersion,
      snapshotGeneration: context.snapshotGeneration,
      tailWatermark: context.tailWatermark,
    }),
  };
}

export function createPaginationCursorPayload(
  context: PaginationCursorContext,
  nextIndex: number,
  ttlMs = PAGINATION_CURSOR_TTL_MS,
  sourcePositions?: Record<string, unknown>,
): PaginationCursorPayload {
  if (!Number.isSafeInteger(nextIndex) || nextIndex < 0)
    throw new Error('Pagination cursor position is invalid.');
  return {
    version: 1,
    actorId: context.actorId,
    accessEpoch: context.accessEpoch,
    endpoint: context.endpoint,
    scope: context.scope,
    orderBy: context.orderBy,
    filterHash: digest(context.filters),
    sourceEpochs: context.sourceEpochs,
    ...(sourcePositions ? { sourcePositions } : {}),
    ...(context.stackVersion === undefined ? {} : { stackVersion: context.stackVersion }),
    ...(context.snapshotGeneration === undefined
      ? {}
      : { snapshotGeneration: context.snapshotGeneration }),
    ...(context.tailWatermark === undefined ? {} : { tailWatermark: context.tailWatermark }),
    nextIndex,
    issuedAt: context.now,
    expiresAt: context.now + ttlMs,
  };
}

function keys(secret: string) {
  const material = createHash('sha512').update(secret).digest();
  return { encryption: material.subarray(0, 32), signing: material.subarray(32) };
}

function encodeCursor(
  payload: PaginationCursorPayload,
  secret: string,
  enforceInlineLimit: boolean,
): string {
  const { encryption, signing } = keys(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryption, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const unsigned = [
    'v1',
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
  const signature = createHmac('sha256', signing).update(unsigned).digest('base64url');
  const token = `${unsigned}.${signature}`;
  if (enforceInlineLimit && Buffer.byteLength(token, 'utf8') > MAX_PAGINATION_CURSOR_BYTES)
    throw new Error('Pagination cursor exceeds its inline size limit.');
  return token;
}

export function encodePaginationCursor(
  payload: PaginationCursorPayload,
  secret = defaultSecret,
): string {
  return encodeCursor(payload, secret, true);
}

export function encodeStoredPaginationCursorState(
  payload: PaginationCursorPayload,
  secret = defaultSecret,
): string {
  return encodeCursor(payload, secret, false);
}

function invalidCursor(): PaginationCursorError {
  return new PaginationCursorError(
    400,
    'invalid_cursor',
    'Cursor is malformed or invalid; restart pagination.',
  );
}

function decodeCanonicalBase64Url(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64url');
  if (!decoded.length || decoded.toString('base64url') !== value) throw invalidCursor();
  return decoded;
}

function decodeCursor(
  token: string,
  secret: string,
  enforceInlineLimit: boolean,
): PaginationCursorPayload {
  try {
    if (
      !token ||
      (enforceInlineLimit && Buffer.byteLength(token, 'utf8') > MAX_PAGINATION_CURSOR_BYTES)
    )
      throw invalidCursor();
    const [version, encodedIv, encodedCiphertext, encodedTag, encodedSignature, extra] =
      token.split('.');
    if (
      version !== 'v1' ||
      !encodedIv ||
      !encodedCiphertext ||
      !encodedTag ||
      !encodedSignature ||
      extra !== undefined
    )
      throw invalidCursor();

    const { encryption, signing } = keys(secret);
    const unsigned = [version, encodedIv, encodedCiphertext, encodedTag].join('.');
    const iv = decodeCanonicalBase64Url(encodedIv);
    const ciphertext = decodeCanonicalBase64Url(encodedCiphertext);
    const tag = decodeCanonicalBase64Url(encodedTag);
    const actualSignature = decodeCanonicalBase64Url(encodedSignature);
    const expectedSignature = createHmac('sha256', signing).update(unsigned).digest();
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    )
      throw invalidCursor();

    const decipher = createDecipheriv('aes-256-gcm', encryption, iv);
    decipher.setAuthTag(tag);
    const decoded = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'),
    ) as Partial<PaginationCursorPayload>;
    if (
      decoded.version !== 1 ||
      typeof decoded.actorId !== 'string' ||
      typeof decoded.accessEpoch !== 'number' ||
      typeof decoded.endpoint !== 'string' ||
      typeof decoded.scope !== 'string' ||
      typeof decoded.orderBy !== 'string' ||
      typeof decoded.filterHash !== 'string' ||
      !decoded.sourceEpochs ||
      typeof decoded.sourceEpochs !== 'object' ||
      (decoded.sourcePositions !== undefined &&
        (!decoded.sourcePositions || typeof decoded.sourcePositions !== 'object')) ||
      !Number.isSafeInteger(decoded.nextIndex) ||
      decoded.nextIndex! < 0 ||
      typeof decoded.issuedAt !== 'number' ||
      typeof decoded.expiresAt !== 'number'
    )
      throw invalidCursor();
    return decoded as PaginationCursorPayload;
  } catch (error) {
    if (error instanceof PaginationCursorError) throw error;
    throw invalidCursor();
  }
}

export function decodePaginationCursor(
  token: string,
  secret = defaultSecret,
): PaginationCursorPayload {
  return decodeCursor(token, secret, true);
}

export function decodeStoredPaginationCursorState(
  token: string,
  secret = defaultSecret,
): PaginationCursorPayload {
  return decodeCursor(token, secret, false);
}

export function validatePaginationCursorContext(
  cursor: PaginationCursorPayload,
  context: PaginationCursorContext,
): void {
  if (cursor.expiresAt <= context.now)
    throw new PaginationCursorError(410, 'cursor_expired', 'Cursor expired; restart pagination.');
  if (
    cursor.actorId !== context.actorId ||
    cursor.endpoint !== context.endpoint ||
    cursor.scope !== context.scope ||
    cursor.orderBy !== context.orderBy ||
    cursor.filterHash !== digest(context.filters)
  )
    throw invalidCursor();
  if (
    cursor.accessEpoch !== context.accessEpoch ||
    canonical(cursor.sourceEpochs) !== canonical(context.sourceEpochs) ||
    cursor.stackVersion !== context.stackVersion ||
    cursor.snapshotGeneration !== context.snapshotGeneration ||
    cursor.tailWatermark !== context.tailWatermark
  )
    throw new PaginationCursorError(
      409,
      'pagination_context_changed',
      'Access or source context changed; restart pagination.',
    );
}
