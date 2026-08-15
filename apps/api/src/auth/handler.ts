import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { log } from '@naaseh/observability';
import {
  loginRequestSchema,
  factorChangeProofSchema,
  passwordProofSchema,
  passwordChangeRequestSchema,
  passwordResetRequestSchema,
  tfaChallengeRequestSchema,
  tfaEnrollmentConfirmRequestSchema,
} from '@naaseh/contracts';
import { hashPassword, loadPepper, verifyOrDummy } from './password.js';
import {
  authenticateSession,
  issueSession,
  revokeSession,
  sessionTokenHash,
} from './session-service.js';
import { findSession } from './session-repository.js';
import { commitPasswordReset, userById, userByUsername } from './user-repository.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity, validOrigin } from '../shared/security.js';
import {
  clearDurableFailures,
  consumePasswordResetAttempt,
  durableCanAttempt,
  registerDurableFailure,
} from './rate-limit.js';
import {
  consumeLoginTransaction,
  getLoginTransaction,
  putLoginTransaction,
  registerLoginTransactionFailure,
  setPendingEnrollmentSecret,
} from './login-transaction-repository.js';
import { requiredTfaNextStep, createTfaService } from './tfa-service.js';
import {
  advanceAcceptedCounter,
  deleteTfaFactor,
  getTfaFactor,
  putTfaFactor,
} from './tfa-repository.js';
import { changeUserSecurity } from './user-repository.js';
import { decryptTfaSecret, encryptTfaSecret, generateTfaSecret, verifyTotp } from './tfa-crypto.js';
import { createPasswordResetService } from './password-reset-service.js';
import { recordAuthSecurityEvent } from './telemetry.js';

const authCachePolicy = 'no-store';

const authenticatedRequest = async (event: APIGatewayProxyEventV2) => {
  const token = sessionToken(event.headers.cookie);
  if (!token) return undefined;
  const candidate = await findSession(sessionTokenHash(token));
  const user = candidate ? await userById(candidate.userId) : undefined;
  const record = user?.active ? await authenticateSession(token, user.sessionEpoch) : undefined;
  if (!record || !user) return undefined;
  return { token, record, user };
};

const mutationAuthorized = (event: APIGatewayProxyEventV2, csrfToken: string) => {
  try {
    requireMutationSecurity(event.headers.origin, csrfToken, event.headers['x-csrf-token']);
    return true;
  } catch {
    return false;
  }
};

function sessionToken(cookieHeader: string | undefined) {
  return cookieHeader
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('__Host-naaseh='))
    ?.slice('__Host-naaseh='.length);
}

function preAuthToken(cookieHeader: string | undefined) {
  return cookieHeader
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('__Host-naaseh-preauth='))
    ?.slice('__Host-naaseh-preauth='.length);
}

const tfaService = createTfaService({
  getFactor: getTfaFactor,
  saveFactor: putTfaFactor,
  decryptSecret: decryptTfaSecret,
  encryptSecret: encryptTfaSecret,
  advanceCounter: advanceAcceptedCounter,
  changeUserSecurity,
  deleteFactor: deleteTfaFactor,
});

async function handle(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const correlationId = event.requestContext.requestId || randomUUID();
  const path = event.rawPath;
  const token = sessionToken(event.headers.cookie);
  if (path.endsWith('/tfa/enrollment') && event.requestContext.http.method === 'GET') {
    const challengeToken = preAuthToken(event.headers.cookie);
    if (!challengeToken)
      return problem(401, 'authentication_failed', 'Unable to start enrollment.', correlationId);
    const tokenDigest = sessionTokenHash(challengeToken);
    const transaction = await getLoginTransaction(tokenDigest);
    const user = transaction ? await userById(transaction.userId) : undefined;
    if (!transaction || !user || transaction.purpose !== 'tfa_enrollment')
      return problem(401, 'authentication_failed', 'Unable to start enrollment.', correlationId);
    const secret = generateTfaSecret();
    await setPendingEnrollmentSecret(tokenDigest, await encryptTfaSecret(user.id, secret));
    const label = encodeURIComponent(`Naaseh:${user.username}`);
    const issuer = encodeURIComponent('Naaseh');
    return json(
      200,
      {
        secret,
        otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      },
      { 'cache-control': authCachePolicy },
    );
  }
  if (path.endsWith('/tfa/enrollment/confirm') && event.requestContext.http.method === 'POST') {
    if (!validOrigin(event.headers.origin))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const challengeToken = preAuthToken(event.headers.cookie);
    if (!challengeToken)
      return problem(401, 'authentication_failed', 'Unable to verify enrollment.', correlationId);
    const tokenDigest = sessionTokenHash(challengeToken);
    const transaction = await getLoginTransaction(tokenDigest);
    const user = transaction ? await userById(transaction.userId) : undefined;
    if (
      !transaction ||
      !user ||
      transaction.purpose !== 'tfa_enrollment' ||
      !transaction.pendingSecretCiphertext
    )
      return problem(401, 'authentication_failed', 'Unable to verify enrollment.', correlationId);
    const body = tfaEnrollmentConfirmRequestSchema.parse(JSON.parse(event.body ?? '{}'));
    const secret = await decryptTfaSecret(user.id, transaction.pendingSecretCiphertext);
    if (!verifyTotp({ secretBase32: secret, token: body.code })) {
      await registerLoginTransactionFailure(tokenDigest);
      return problem(401, 'authentication_failed', 'Unable to verify enrollment.', correlationId);
    }
    const recoveryCodes = await tfaService.enableFactor(user, secret);
    await consumeLoginTransaction(tokenDigest);
    const session = await issueSession(user.id, user.sessionEpoch + 1);
    return json(
      200,
      {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
        csrfToken: session.record.csrfToken,
        recoveryCodes,
      },
      {
        'cache-control': authCachePolicy,
        'set-cookie': session.cookie,
      },
    );
  }
  if (path.endsWith('/tfa/challenge') && event.requestContext.http.method === 'POST') {
    if (!validOrigin(event.headers.origin))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const challengeToken = preAuthToken(event.headers.cookie);
    if (!challengeToken)
      return problem(401, 'authentication_failed', 'Unable to verify the factor.', correlationId);
    const tokenDigest = sessionTokenHash(challengeToken);
    const transaction = await getLoginTransaction(tokenDigest);
    const user = transaction ? await userById(transaction.userId) : undefined;
    if (
      !transaction ||
      !user ||
      transaction.purpose !== 'tfa_challenge' ||
      transaction.sessionEpoch !== user.sessionEpoch ||
      transaction.credentialVersion !== user.credentialVersion
    )
      return problem(401, 'authentication_failed', 'Unable to verify the factor.', correlationId);
    const body = tfaChallengeRequestSchema.parse(JSON.parse(event.body ?? '{}'));
    const valid = await tfaService.verifyFactor(user, body.method, body.code);
    if (!valid) {
      await registerLoginTransactionFailure(tokenDigest);
      recordAuthSecurityEvent('tfa_challenge', 'denied', correlationId);
      return problem(401, 'authentication_failed', 'Unable to verify the factor.', correlationId);
    }
    await consumeLoginTransaction(tokenDigest);
    const session = await issueSession(user.id, user.sessionEpoch);
    recordAuthSecurityEvent('tfa_challenge', 'success', correlationId);
    return json(
      200,
      {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
        csrfToken: session.record.csrfToken,
      },
      {
        'cache-control': authCachePolicy,
        'set-cookie': `${session.cookie}, __Host-naaseh-preauth=; Path=/api/v1/auth/tfa; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
      },
    );
  }
  if (path.endsWith('/password-reset') && event.requestContext.http.method === 'POST') {
    if (!validOrigin(event.headers.origin))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const body = passwordResetRequestSchema.parse(JSON.parse(event.body ?? '{}'));
    const sourceKey = createHash('sha256')
      .update(event.requestContext.http.sourceIp ?? 'unknown')
      .digest('hex');
    const service = createPasswordResetService({
      findUser: userByUsername,
      verifyOrDummyPin: async (hash, pin) => {
        const pepper = await loadPepper(process.env.PASSWORD_PEPPER_SECRET_ID);
        return verifyOrDummy(hash, pin, pepper.value);
      },
      hashNewPassword: async (password) => {
        const pepper = await loadPepper(process.env.PASSWORD_PEPPER_SECRET_ID);
        return hashPassword(password, pepper.value);
      },
      commitPasswordReset,
      consumeAttempt: consumePasswordResetAttempt,
    });
    await service.reset({
      username: body.username,
      pin: body.pin,
      newPassword: body.newPassword,
      sourceKey,
    });
    recordAuthSecurityEvent('password_reset', 'success', correlationId);
    return json(
      200,
      { message: 'If the account information was valid, the password has been reset.' },
      { 'cache-control': authCachePolicy },
    );
  }
  if (path.endsWith('/session') && event.requestContext.http.method === 'GET') {
    if (!token) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    const candidate = await findSession(sessionTokenHash(token));
    const user = candidate ? await userById(candidate.userId) : undefined;
    const record = user?.active ? await authenticateSession(token, user.sessionEpoch) : undefined;
    if (!record || !user)
      return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    return json(200, {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      csrfToken: record.csrfToken,
    });
  }
  if (path.endsWith('/profile/security') && event.requestContext.http.method === 'GET') {
    const authenticated = await authenticatedRequest(event);
    if (!authenticated)
      return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    const factor = await getTfaFactor(authenticated.user.id);
    return json(
      200,
      {
        tfaStatus: authenticated.user.tfaStatus,
        enrolledAt: authenticated.user.tfaEnrolledAt ?? null,
        recoveryCodesRemaining:
          factor?.recoveryCodes.filter((candidate) => !candidate.usedAt).length ?? 0,
      },
      { 'cache-control': authCachePolicy },
    );
  }
  if (
    path.endsWith('/profile/security/recovery-codes') &&
    event.requestContext.http.method === 'POST'
  ) {
    const authenticated = await authenticatedRequest(event);
    if (!authenticated || !mutationAuthorized(event, authenticated.record.csrfToken))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const body = factorChangeProofSchema.parse(JSON.parse(event.body ?? '{}'));
    const pepper = await loadPepper(
      process.env.PASSWORD_PEPPER_SECRET_ID,
      authenticated.user.pepperVersion,
    );
    if (!(await verifyOrDummy(authenticated.user.passwordHash, body.password, pepper.value)))
      return problem(401, 'authentication_failed', 'Unable to verify credentials.', correlationId);
    const recoveryCodes = await tfaService.rotateRecoveryCodes(
      authenticated.user,
      body.method,
      body.code,
    );
    const session = await issueSession(authenticated.user.id, authenticated.user.sessionEpoch + 1);
    return json(
      200,
      { recoveryCodes, csrfToken: session.record.csrfToken },
      {
        'cache-control': authCachePolicy,
        'set-cookie': session.cookie,
      },
    );
  }
  if (
    path.endsWith('/profile/security/tfa/enrollment') &&
    event.requestContext.http.method === 'POST'
  ) {
    const authenticated = await authenticatedRequest(event);
    if (!authenticated || !mutationAuthorized(event, authenticated.record.csrfToken))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const body = passwordProofSchema.parse(JSON.parse(event.body ?? '{}'));
    const pepper = await loadPepper(
      process.env.PASSWORD_PEPPER_SECRET_ID,
      authenticated.user.pepperVersion,
    );
    if (!(await verifyOrDummy(authenticated.user.passwordHash, body.password, pepper.value)))
      return problem(401, 'authentication_failed', 'Unable to verify credentials.', correlationId);
    await changeUserSecurity(authenticated.user.id, {
      tfaStatus: 'enrollment_required',
      nextSessionEpoch: authenticated.user.sessionEpoch + 1,
    });
    return json(
      200,
      { next: 'sign_in_to_enroll' },
      {
        'cache-control': authCachePolicy,
        'set-cookie': '__Host-naaseh=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0',
      },
    );
  }
  if (path.endsWith('/profile/security/tfa') && event.requestContext.http.method === 'DELETE') {
    const authenticated = await authenticatedRequest(event);
    if (!authenticated || !mutationAuthorized(event, authenticated.record.csrfToken))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const body = factorChangeProofSchema.parse(JSON.parse(event.body ?? '{}'));
    const pepper = await loadPepper(
      process.env.PASSWORD_PEPPER_SECRET_ID,
      authenticated.user.pepperVersion,
    );
    if (!(await verifyOrDummy(authenticated.user.passwordHash, body.password, pepper.value)))
      return problem(401, 'authentication_failed', 'Unable to verify credentials.', correlationId);
    await tfaService.disableFactor(authenticated.user, body.method, body.code);
    const session = await issueSession(authenticated.user.id, authenticated.user.sessionEpoch + 1);
    return json(
      200,
      { csrfToken: session.record.csrfToken },
      {
        'cache-control': authCachePolicy,
        'set-cookie': session.cookie,
      },
    );
  }
  if (path.endsWith('/profile/security/password') && event.requestContext.http.method === 'POST') {
    const authenticated = await authenticatedRequest(event);
    if (!authenticated || !mutationAuthorized(event, authenticated.record.csrfToken))
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    const body = passwordChangeRequestSchema.parse(JSON.parse(event.body ?? '{}'));
    const pepper = await loadPepper(
      process.env.PASSWORD_PEPPER_SECRET_ID,
      authenticated.user.pepperVersion,
    );
    const validPassword = await verifyOrDummy(
      authenticated.user.passwordHash,
      body.password,
      pepper.value,
    );
    const validFactor = await tfaService.verifyFactor(authenticated.user, body.method, body.code);
    if (!validPassword || !validFactor)
      return problem(401, 'authentication_failed', 'Unable to verify credentials.', correlationId);
    await commitPasswordReset({
      userId: authenticated.user.id,
      passwordHash: await hashPassword(body.newPassword, pepper.value),
      expectedVersion: authenticated.user.version,
      nextCredentialVersion: authenticated.user.credentialVersion + 1,
      nextSessionEpoch: authenticated.user.sessionEpoch + 1,
      retainedTfaStatus: authenticated.user.tfaStatus,
    });
    const session = await issueSession(authenticated.user.id, authenticated.user.sessionEpoch + 1);
    return json(
      200,
      { csrfToken: session.record.csrfToken },
      {
        'cache-control': authCachePolicy,
        'set-cookie': session.cookie,
      },
    );
  }
  if (path.endsWith('/logout') && event.requestContext.http.method === 'POST') {
    if (!token) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    const record = await findSession(sessionTokenHash(token));
    if (!record) return problem(401, 'unauthorized', 'Authentication required.', correlationId);
    try {
      requireMutationSecurity(
        event.headers.origin,
        record.csrfToken,
        event.headers['x-csrf-token'],
      );
    } catch {
      return problem(403, 'forbidden', 'Request rejected.', correlationId);
    }
    await revokeSession(token);
    log('auth.logout', { correlationId, actorId: record.userId, outcome: 'success' });
    return json(204, undefined, {
      'set-cookie': '__Host-naaseh=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0',
    });
  }
  if (event.requestContext.http.method !== 'POST')
    return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
  if (!validOrigin(event.headers.origin))
    return problem(403, 'forbidden', 'Request rejected.', correlationId);
  let body: { username: string; password: string };
  try {
    body = loginRequestSchema.parse(JSON.parse(event.body ?? '{}'));
  } catch (error) {
    return errorResponse(error, { correlationId, operation: 'auth.login.validate' });
  }
  const username = body.username.toLocaleLowerCase('en-US');
  const accountKey = `account:${createHash('sha256').update(username).digest('hex')}`;
  const ipKey = `ip:${createHash('sha256')
    .update(event.requestContext.http.sourceIp ?? 'unknown')
    .digest('hex')}`;
  if (!(await durableCanAttempt(accountKey)) || !(await durableCanAttempt(ipKey))) {
    recordAuthSecurityEvent('login', 'rate_limited', correlationId);
    return problem(
      429,
      'rate_limited',
      'Sign-in is temporarily unavailable. Try again later.',
      correlationId,
    );
  }
  const user = await userByUsername(username);
  const pepper = await loadPepper(process.env.PASSWORD_PEPPER_SECRET_ID, user?.pepperVersion);
  const validPassword = await verifyOrDummy(user?.passwordHash, body.password, pepper.value);
  const valid = Boolean(user?.active && validPassword);
  if (!valid || !user) {
    await Promise.all([registerDurableFailure(accountKey), registerDurableFailure(ipKey)]);
    log('auth.login', { correlationId, outcome: 'denied' });
    recordAuthSecurityEvent('login', 'denied', correlationId);
    return problem(
      401,
      'authentication_failed',
      'Unable to sign in with those credentials.',
      correlationId,
    );
  }
  await Promise.all([clearDurableFailures(accountKey), clearDurableFailures(ipKey)]);
  const next = requiredTfaNextStep(user);
  if (next) {
    const challengeToken = randomBytes(32).toString('base64url');
    const tokenDigest = sessionTokenHash(challengeToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    await putLoginTransaction({
      tokenDigest,
      userId: user.id,
      purpose: next,
      sessionEpoch: user.sessionEpoch,
      credentialVersion: user.credentialVersion,
      attemptCount: 0,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ttl: Math.ceil(expiresAt.getTime() / 1_000),
    });
    return json(
      202,
      { next, expiresAt: expiresAt.toISOString() },
      {
        'cache-control': authCachePolicy,
        'set-cookie': `__Host-naaseh-preauth=${challengeToken}; Path=/api/v1/auth/tfa; Secure; HttpOnly; SameSite=Strict; Max-Age=300`,
      },
    );
  }
  const session = await issueSession(user.id, user.sessionEpoch);
  log('auth.login', { correlationId, actorId: user.id, outcome: 'success' });
  recordAuthSecurityEvent('login', 'success', correlationId);
  return json(
    200,
    {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      csrfToken: session.record.csrfToken,
    },
    { 'set-cookie': session.cookie },
  );
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await handle(event);
  } catch (error) {
    return errorResponse(error, {
      correlationId: event.requestContext.requestId || randomUUID(),
      operation: 'auth.request',
    });
  }
};
