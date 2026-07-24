import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { hiddenMemoPackageSchema } from '@naaseh/domain';
import { loadPepper, verifyPassword } from '../auth/password.js';
import {
  clearDurableFailures,
  durableCanAttempt,
  registerDurableFailure,
} from '../auth/rate-limit.js';
import { userById } from '../auth/user-repository.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { findTask } from '../tasks/task-repository.js';
import {
  createPinRecoveryService,
  decryptWithRecoveryKms,
  defaultRecoveryAudit,
} from './pin-recovery.js';

const requestSchema = z.object({
  password: z.string().min(1).max(1024),
  reason: z.string().trim().min(1).max(200),
  ephemeralPublicKeySpki: z.string().min(1).max(8192),
});

function authorizer(event: APIGatewayProxyEventV2) {
  return (
    event.requestContext as typeof event.requestContext & {
      authorizer?: { lambda?: { userId?: string; csrfToken?: string } };
    }
  ).authorizer?.lambda;
}

async function handle(event: APIGatewayProxyEventV2) {
  const correlationId = event.requestContext.requestId || randomUUID();
  const auth = authorizer(event);
  const actorId = auth?.userId;
  if (!actorId) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
  if (event.requestContext.http.method !== 'POST')
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  requireMutationSecurity(
    event.headers.origin,
    auth?.csrfToken ?? '',
    event.headers['x-csrf-token'],
  );

  const taskId = event.pathParameters?.taskId ?? '';
  const task = await findTask(taskId);
  // Conceal whether another owner's task or hidden memo exists.
  if (!task || task.ownerId !== actorId || !task.memoHidden || !task.encryptedMemo)
    return problem(404, 'not_found', 'Hidden memo not found.', correlationId);

  const body = requestSchema.parse(JSON.parse(event.body ?? '{}'));
  const memoPackage = hiddenMemoPackageSchema.parse(JSON.parse(task.encryptedMemo));
  if (memoPackage.taskId !== task.id)
    return problem(404, 'not_found', 'Hidden memo not found.', correlationId);
  const recoveryWrap = memoPackage.recoveryWraps.find((wrap) => wrap.authority === 'recovery');
  const kmsKeyId = process.env.RECOVERY_KMS_KEY_ARN;
  if (!recoveryWrap || !kmsKeyId) throw new Error('Recovery dependency is unavailable.');

  const attemptKey = `pin-recovery:${actorId}`;
  const recover = createPinRecoveryService({
    consumeAttempt: () => durableCanAttempt(attemptKey),
    reverifyPassword: async (userId, password) => {
      const user = await userById(userId);
      if (!user?.active) return false;
      const pepper = await loadPepper(process.env.PASSWORD_PEPPER_SECRET_ID, user.pepperVersion);
      const valid = await verifyPassword(user.passwordHash, password, pepper.value);
      if (valid) await clearDurableFailures(attemptKey);
      else await registerDurableFailure(attemptKey);
      return valid;
    },
    decryptRecoveryWrap: decryptWithRecoveryKms,
    audit: defaultRecoveryAudit,
    now: Date.now,
  });
  const result = await recover({
    actorId,
    ownerId: task.ownerId,
    taskId: task.id,
    memoId: memoPackage.memoId,
    password: body.password,
    csrfValidated: true,
    reason: body.reason,
    wrappedDek: recoveryWrap.ciphertext,
    kmsKeyId,
    kmsKeyVersion: recoveryWrap.keyVersion,
    authority: 'recovery',
    ephemeralPublicKeySpki: body.ephemeralPublicKeySpki,
  });
  return json(200, result);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await handle(event);
  } catch (error) {
    return errorResponse(error, {
      correlationId: event.requestContext.requestId || randomUUID(),
      operation: 'pin-recovery.request',
      actorId: authorizer(event)?.userId,
      resourceId: event.pathParameters?.taskId,
    });
  }
};
