import { createHash } from 'node:crypto';
import { TransactGetCommand } from '@aws-sdk/lib-dynamodb';
import { sessionActive, sessionSchema } from '@naaseh/domain';
import { z } from 'zod';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { SafeApiError } from '../shared/http.js';

export interface FinanceGateContext {
  userId: string;
  sessionHash: string;
  grant?: string | undefined;
  tabNonce?: string | undefined;
}
type Key = { PK: string; SK: string };
type Projection = { expression: string; names: Record<string, string> };
const profileSchema = z.object({
  id: z.string(),
  active: z.boolean(),
  role: z.enum(['user', 'admin']),
  sessionEpoch: z.number().int().nonnegative().default(0),
  tfaStatus: z
    .enum(['disabled', 'enrollment_required', 'enabled', 'recovery_required'])
    .default('disabled'),
});
const preferenceSchema = z.object({
  userId: z.string(),
  requirePin: z.boolean(),
  revision: z.number().int().nonnegative(),
});
const unauthorized = () =>
  new SafeApiError(401, 'unauthorized', 'Authentication required.', 'authorization');
const locked = () =>
  new SafeApiError(403, 'finance_locked', 'Unlock Finance to continue.', 'authorization');
const unavailable = () =>
  new SafeApiError(
    503,
    'finance_security_unavailable',
    'Finance security is temporarily unavailable.',
    'dependency_failure',
  );

/** Canonical reads on every call; this module has no password-verifier or pepper dependency. */
export function createFinanceUnlockGuard(
  options: {
    now?: () => number;
    read?: (key: Key, projection?: Projection) => Promise<Record<string, unknown> | undefined>;
  } = {},
) {
  const snapshot = async (requests: Array<{ key: Key; projection?: Projection }>) => {
    // Injection is for deterministic fixtures. Production uses one serializable snapshot,
    // so a concurrent PIN/password reset cannot mix old and new authorization records.
    if (options.read)
      return Promise.all(requests.map(({ key, projection }) => options.read!(key, projection)));
    const result = await dynamodb
      .send(
        new TransactGetCommand({
          TransactItems: requests.map(({ key, projection }) => ({
            Get: {
              TableName: tableName,
              Key: key,
              ...(projection
                ? {
                    ProjectionExpression: projection.expression,
                    ExpressionAttributeNames: projection.names,
                  }
                : {}),
            },
          })),
        }),
      )
      .catch(() => {
        throw unavailable();
      });
    if (result.Responses?.length !== requests.length) throw unavailable();
    return result.Responses.map((response) => response?.Item);
  };
  const now = options.now ?? (() => Date.now());
  return async (context: FinanceGateContext) => {
    if (!context.userId || !/^[a-f0-9]{64}$/.test(context.sessionHash)) throw unauthorized();
    const digest =
      context.grant && /^[A-Za-z0-9_-]{43}$/.test(context.grant)
        ? createHash('sha256').update(context.grant).digest('hex')
        : undefined;
    const [profile, stored, row, grant] = await snapshot([
      {
        key: { PK: `USER#${context.userId}`, SK: 'PROFILE' },
        projection: {
          expression: '#d.id, #d.active, #d.#role, #d.sessionEpoch, #d.tfaStatus',
          names: { '#d': 'data', '#role': 'role' },
        },
      },
      { key: { PK: `SESSION#${context.sessionHash}`, SK: 'SESSION' } },
      {
        key: { PK: `USER#${context.userId}`, SK: 'FINANCE_SECURITY' },
        projection: {
          expression: '#userId, #requirePin, #revision',
          names: { '#userId': 'userId', '#requirePin': 'requirePin', '#revision': 'revision' },
        },
      },
      ...(digest ? [{ key: { PK: `FINANCE_GRANT#${digest}`, SK: 'CURRENT' } }] : []),
    ]);
    const user = profileSchema.safeParse(profile?.data);
    const session = sessionSchema.safeParse(stored?.data);
    if (
      !user.success ||
      !session.success ||
      user.data.id !== context.userId ||
      !user.data.active ||
      session.data.userId !== context.userId ||
      !sessionActive(session.data, user.data.sessionEpoch, new Date(now())) ||
      user.data.tfaStatus === 'recovery_required' ||
      (user.data.role === 'admin' && user.data.tfaStatus !== 'enabled')
    )
      throw unauthorized();
    const preference = row
      ? preferenceSchema.safeParse(row)
      : {
          success: true as const,
          data: { userId: context.userId, requirePin: false, revision: 0 },
        };
    if (!preference.success || preference.data.userId !== context.userId)
      throw new SafeApiError(
        503,
        'finance_security_unavailable',
        'Finance security is temporarily unavailable.',
        'dependency_failure',
      );
    const summary = {
      requirePin: preference.data.requirePin,
      securityRevision: preference.data.revision,
      sessionEpoch: user.data.sessionEpoch,
    };
    if (!preference.data.requirePin) return summary;
    if (
      !context.grant ||
      !/^[A-Za-z0-9_-]{43}$/.test(context.grant) ||
      !context.tabNonce ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(context.tabNonce)
    )
      throw locked();
    const currentTime = now();
    if (
      !grant ||
      grant.userId !== context.userId ||
      grant.sessionHash !== context.sessionHash ||
      grant.sessionId !== session.data.id ||
      grant.sessionEpoch !== user.data.sessionEpoch ||
      grant.securityRevision !== preference.data.revision ||
      grant.tabNonce !== context.tabNonce ||
      grant.revokedAt ||
      typeof grant.createdAt !== 'number' ||
      !Number.isSafeInteger(grant.createdAt) ||
      grant.createdAt > currentTime ||
      typeof grant.expiresAtMs !== 'number' ||
      !Number.isSafeInteger(grant.expiresAtMs) ||
      grant.expiresAtMs <= currentTime ||
      grant.expiresAtMs > grant.createdAt + 30 * 60_000 ||
      grant.expiresAtMs > Date.parse(session.data.idleExpiresAt) ||
      grant.expiresAtMs > Date.parse(session.data.absoluteExpiresAt)
    )
      throw locked();
    return summary;
  };
}
