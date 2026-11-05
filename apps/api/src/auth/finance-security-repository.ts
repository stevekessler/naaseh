import { randomBytes } from 'node:crypto';
import { createUlid, sessionActive, sessionSchema, type SessionRecord } from '@naaseh/domain';
import { z } from 'zod';
import { FinanceUnitOfWork } from '../finance/unit-of-work.js';
import { SafeApiError } from '../shared/http.js';
import { storedUserSchema, type StoredUser } from './user-repository.js';

export interface FinanceSecurityContext {
  userId: string;
  sessionHash: string;
}
const preferenceSchema = z.object({
  userId: z.string().min(1),
  requirePin: z.boolean(),
  revision: z.number().int().nonnegative(),
  financePinHash: z.string().min(1).optional(),
  financePepperVersion: z.string().min(1).optional(),
  updatedAt: z.string().datetime().optional(),
  updatedBy: z.string().optional(),
});
export type FinanceSecurityPreference = z.infer<typeof preferenceSchema>;
export const financeSecurityKey = (userId: string) => ({
  PK: `USER#${userId}`,
  SK: 'FINANCE_SECURITY',
});
const throttleKey = (userId: string, purpose: string) => ({
  PK: `USER#${userId}`,
  SK: `FINANCE_THROTTLE#${purpose}`,
});
const throttleSchema = z.object({
  count: z.number().int().min(0).max(32),
  retryAt: z.number().int().nonnegative(),
  leaseId: z.string().optional(),
  leaseUntil: z.number().int().nonnegative().optional(),
  expiresAt: z.number().int().positive(),
});
export const financePinFailureDelay = (count: number) =>
  count < 5 ? 0 : Math.min(1_800_000, 30_000 * 2 ** Math.min(26, count - 5));
export const financeSecurityDenied = () =>
  new SafeApiError(401, 'unauthorized', 'Authentication required.', 'authorization');
const conflict = () =>
  new SafeApiError(
    409,
    'finance_security_changed',
    'Finance security changed. Refresh and try again.',
    'conflict',
  );
const throttled = (seconds: number) =>
  new SafeApiError(
    429,
    'finance_unlock_throttled',
    'Wait before trying Finance security again.',
    'throttled',
    true,
    Math.max(1, seconds),
  );

interface Snapshot {
  work: FinanceUnitOfWork;
  user: StoredUser;
  session: SessionRecord;
  preference: FinanceSecurityPreference;
}
export interface FinanceVerificationLease {
  id: string;
  purpose: 'management' | 'unlock';
  context: FinanceSecurityContext;
  user: StoredUser;
  session: SessionRecord;
  preference: FinanceSecurityPreference;
}

/** Auth-only repository: password verifiers never leave this Lambda boundary or ordinary sync. */
export class FinanceSecurityRepository {
  constructor(
    private readonly work: () => FinanceUnitOfWork = () => new FinanceUnitOfWork(),
    private readonly now: () => number = () => Date.now(),
  ) {}
  async snapshot(context: FinanceSecurityContext): Promise<Snapshot> {
    if (!context.userId || !/^[a-f0-9]{64}$/.test(context.sessionHash))
      throw financeSecurityDenied();
    const work = this.work();
    const profile = await work.get({ PK: `USER#${context.userId}`, SK: 'PROFILE' });
    const stored = await work.get({ PK: `SESSION#${context.sessionHash}`, SK: 'SESSION' });
    const userResult = storedUserSchema.safeParse(profile?.data);
    const sessionResult = sessionSchema.safeParse(stored?.data);
    if (!userResult.success || !sessionResult.success) throw financeSecurityDenied();
    const user = userResult.data as StoredUser;
    const session = sessionResult.data;
    if (
      user.id !== context.userId ||
      !user.active ||
      session.userId !== user.id ||
      !sessionActive(session, user.sessionEpoch, new Date(this.now())) ||
      user.tfaStatus === 'recovery_required' ||
      (user.role === 'admin' && user.tfaStatus !== 'enabled')
    )
      throw financeSecurityDenied();
    const row = await work.get(financeSecurityKey(user.id));
    const preference = row
      ? preferenceSchema.parse(row)
      : { userId: user.id, requirePin: false, revision: 0 };
    if (
      preference.userId !== user.id ||
      (preference.requirePin && (!preference.financePinHash || !preference.financePepperVersion))
    )
      throw new SafeApiError(
        503,
        'finance_security_unavailable',
        'Finance security is temporarily unavailable.',
        'dependency_failure',
      );
    return { work, user, session, preference };
  }
  private async commit(work: FinanceUnitOfWork, userId: string) {
    const id = createUlid();
    await work.commit({
      key: { PK: `USER#${userId}`, SK: `FINANCE_AUTH_RECEIPT#${id}` },
      fingerprint: id,
      result: true,
      expiresAt: Math.floor(this.now() / 1000) + 3600,
    });
  }
  async acquire(
    context: FinanceSecurityContext,
    purpose: FinanceVerificationLease['purpose'],
    expectedRevision?: number,
  ): Promise<FinanceVerificationLease> {
    const current = await this.snapshot(context);
    if (expectedRevision !== undefined && current.preference.revision !== expectedRevision)
      throw conflict();
    const key = throttleKey(context.userId, purpose);
    const raw = await current.work.get(key);
    const stored = raw ? throttleSchema.parse(raw) : undefined;
    const now = this.now();
    const counter: z.infer<typeof throttleSchema> =
      stored && stored.expiresAt * 1000 > now
        ? stored
        : { count: 0, retryAt: 0, expiresAt: Math.floor(now / 1000) + 86_400 };
    const retryAt = Math.max(counter.retryAt, counter.leaseUntil ?? 0);
    if (retryAt > now) throw throttled(Math.ceil((retryAt - now) / 1000));
    const id = randomBytes(24).toString('base64url');
    await current.work.put({
      ...key,
      count: counter.count,
      retryAt: counter.retryAt,
      leaseId: id,
      leaseUntil: now + 60_000,
      expiresAt: Math.floor(now / 1000) + 86_400,
    });
    try {
      await this.commit(current.work, context.userId);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TransactionCanceledException' ||
          error.name === 'ConditionalCheckFailedException')
      )
        throw conflict();
      throw error;
    }
    return {
      id,
      purpose,
      context,
      user: current.user,
      session: current.session,
      preference: current.preference,
    };
  }
  async complete(
    lease: FinanceVerificationLease,
    valid: boolean,
    apply?: (current: Snapshot) => Promise<void>,
  ): Promise<number> {
    const current = await this.snapshot(lease.context);
    if (
      current.user.version !== lease.user.version ||
      current.user.credentialVersion !== lease.user.credentialVersion ||
      current.preference.revision !== lease.preference.revision
    )
      throw conflict();
    const key = throttleKey(current.user.id, lease.purpose);
    const raw = await current.work.get(key);
    const counter = throttleSchema.parse(raw);
    const now = this.now();
    if (counter.leaseId !== lease.id || (counter.leaseUntil ?? 0) <= now) throw throttled(1);
    const count = valid ? 0 : Math.min(32, counter.count + 1);
    const delay = valid ? 0 : financePinFailureDelay(count);
    if (valid) await apply?.(current);
    await current.work.put({
      ...key,
      count,
      retryAt: now + delay,
      expiresAt: Math.floor(now / 1000) + 86_400,
    });
    try {
      await this.commit(current.work, current.user.id);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TransactionCanceledException' ||
          error.name === 'ConditionalCheckFailedException')
      )
        throw conflict();
      throw error;
    }
    return delay;
  }

  async revokeGrant(context: FinanceSecurityContext, digest: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw financeSecurityDenied();
    const current = await this.snapshot(context);
    const key = { PK: `FINANCE_GRANT#${digest}`, SK: 'CURRENT' };
    const grant = await current.work.get(key);
    // Idempotent and non-disclosing even if the supplied grant belongs elsewhere.
    if (grant?.userId !== current.user.id || grant.sessionHash !== context.sessionHash) return;
    await current.work.delete(key);
    await this.commit(current.work, context.userId);
  }
}
