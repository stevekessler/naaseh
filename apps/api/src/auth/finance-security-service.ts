import { createHash, randomBytes } from 'node:crypto';
import {
  financePinUpdateSchema,
  financePinRequirementSchema,
  financeUnlockRequestSchema,
  financeSecurityResponseSchema,
  financeUnlockResponseSchema,
} from '@naaseh/contracts';
import { SafeApiError } from '../shared/http.js';
import { hashPassword, verifyOrDummy, loadPepper } from './password.js';
import {
  FinanceSecurityRepository,
  financeSecurityKey,
  type FinanceSecurityContext,
  type FinanceSecurityPreference,
  type FinanceVerificationLease,
} from './finance-security-repository.js';

const publicPreference = (preference: FinanceSecurityPreference) =>
  financeSecurityResponseSchema.parse({
    requirePin: preference.requirePin,
    enrolled: Boolean(preference.financePinHash),
    revision: preference.revision,
  });
const pinDomain = (pin: string) => `finance-pin-v1:${pin}`;
/** Auth-only primitives: password pepper permissions remain outside the Finance function. */
export function createFinanceSecurityService(
  options: {
    repository?: FinanceSecurityRepository;
    now?: () => number;
    loadPepper?: (version?: string) => Promise<{ value: string; version: string }>;
    verify?: typeof verifyOrDummy;
    hashPin?: typeof hashPassword;
  } = {},
) {
  const now = options.now ?? (() => Date.now());
  const repository = options.repository ?? new FinanceSecurityRepository(undefined, now);
  const pepperFor = options.loadPepper ?? ((version?: string) => loadPepper(undefined, version));
  const verify = options.verify ?? verifyOrDummy;
  const hashPin = options.hashPin ?? hashPassword;
  async function reject(lease: FinanceVerificationLease): Promise<never> {
    const delay = await repository.complete(lease, false);
    throw new SafeApiError(
      delay ? 429 : 403,
      delay ? 'finance_unlock_throttled' : 'finance_verification_failed',
      delay
        ? 'Wait before trying Finance security again.'
        : 'Finance security verification failed.',
      delay ? 'throttled' : 'authorization',
      Boolean(delay),
      delay ? Math.ceil(delay / 1000) : undefined,
    );
  }
  async function passwordProof(lease: FinanceVerificationLease, password: string) {
    const pepper = await pepperFor(lease.user.pepperVersion);
    if (!(await verify(lease.user.passwordHash, password, pepper.value))) return reject(lease);
    return pepper;
  }
  return {
    async get(context: FinanceSecurityContext) {
      return publicPreference((await repository.snapshot(context)).preference);
    },
    async update(context: FinanceSecurityContext, body: unknown) {
      const input = financePinUpdateSchema.parse(body);
      const lease = await repository.acquire(context, 'management', input.expectedRevision);
      const pepper = await passwordProof(lease, input.currentPassword);
      const financePinHash = await hashPin(pinDomain(input.newPin), pepper.value);
      const preference: FinanceSecurityPreference = {
        userId: context.userId,
        requirePin: input.requirePin,
        revision: lease.preference.revision + 1,
        financePinHash,
        financePepperVersion: pepper.version,
        updatedAt: new Date(now()).toISOString(),
        updatedBy: context.userId,
      };
      await repository.complete(lease, true, async ({ work }) => {
        await work.put({ ...financeSecurityKey(context.userId), ...preference });
      });
      return publicPreference(preference);
    },
    async setRequirement(context: FinanceSecurityContext, body: unknown) {
      const input = financePinRequirementSchema.parse(body);
      const lease = await repository.acquire(context, 'management', input.expectedRevision);
      await passwordProof(lease, input.currentPassword);
      if (input.requirePin && !lease.preference.financePinHash) {
        await repository.complete(lease, true);
        throw new SafeApiError(
          409,
          'finance_pin_required',
          'Set a Finance PIN before requiring it.',
          'conflict',
        );
      }
      const preference = {
        ...lease.preference,
        requirePin: input.requirePin,
        revision: lease.preference.revision + 1,
        updatedAt: new Date(now()).toISOString(),
        updatedBy: context.userId,
      };
      await repository.complete(lease, true, async ({ work }) => {
        await work.put({ ...financeSecurityKey(context.userId), ...preference });
      });
      return publicPreference(preference);
    },
    async unlock(context: FinanceSecurityContext, body: unknown) {
      const input = financeUnlockRequestSchema.parse(body);
      const lease = await repository.acquire(context, 'unlock');
      const pepper = await pepperFor(lease.preference.financePepperVersion);
      if (
        !lease.preference.financePinHash ||
        !(await verify(lease.preference.financePinHash, pinDomain(input.pin), pepper.value))
      )
        return reject(lease);
      const grant = randomBytes(32).toString('base64url');
      const digest = createHash('sha256').update(grant).digest('hex');
      const expiresAt = Math.min(
        now() + 30 * 60_000,
        Date.parse(lease.session.idleExpiresAt),
        Date.parse(lease.session.absoluteExpiresAt),
      );
      await repository.complete(lease, true, async ({ work, user, session, preference }) => {
        await work.put({
          PK: `FINANCE_GRANT#${digest}`,
          SK: 'CURRENT',
          userId: user.id,
          sessionHash: context.sessionHash,
          sessionId: session.id,
          sessionEpoch: user.sessionEpoch,
          securityRevision: preference.revision,
          tabNonce: input.tabNonce,
          createdAt: now(),
          expiresAt: Math.floor(expiresAt / 1000),
          expiresAtMs: expiresAt,
        });
      });
      return financeUnlockResponseSchema.parse({
        grant,
        expiresAt: new Date(expiresAt).toISOString(),
        securityRevision: lease.preference.revision,
        sessionEpoch: lease.user.sessionEpoch,
      });
    },
    async revoke(context: FinanceSecurityContext, grant: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(grant)) {
        await repository.snapshot(context);
        return;
      }
      await repository.revokeGrant(context, createHash('sha256').update(grant).digest('hex'));
    },
  };
}
