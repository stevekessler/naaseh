import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { createHash, randomUUID } from 'node:crypto';
import { log } from '@naaseh/observability';
import { loginRequestSchema } from '@naaseh/contracts';
import { loadPepper, verifyOrDummy } from './password.js';
import {
  authenticateSession,
  issueSession,
  revokeSession,
  sessionTokenHash,
} from './session-service.js';
import { findSession } from './session-repository.js';
import { userById, userByUsername } from './user-repository.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity, validOrigin } from '../shared/security.js';
import { clearDurableFailures, durableCanAttempt, registerDurableFailure } from './rate-limit.js';

function sessionToken(cookieHeader: string | undefined) {
  return cookieHeader
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('__Host-naaseh='))
    ?.slice('__Host-naaseh='.length);
}

async function handle(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const correlationId = event.requestContext.requestId || randomUUID();
  const path = event.rawPath;
  const token = sessionToken(event.headers.cookie);
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
  if (!(await durableCanAttempt(accountKey)) || !(await durableCanAttempt(ipKey)))
    return problem(
      429,
      'rate_limited',
      'Sign-in is temporarily unavailable. Try again later.',
      correlationId,
    );
  const user = await userByUsername(username);
  const pepper = await loadPepper(process.env.PASSWORD_PEPPER_SECRET_ID, user?.pepperVersion);
  const validPassword = await verifyOrDummy(user?.passwordHash, body.password, pepper.value);
  const valid = Boolean(user?.active && validPassword);
  if (!valid || !user) {
    await Promise.all([registerDurableFailure(accountKey), registerDurableFailure(ipKey)]);
    log('auth.login', { correlationId, outcome: 'denied' });
    return problem(
      401,
      'authentication_failed',
      'Unable to sign in with those credentials.',
      correlationId,
    );
  }
  await Promise.all([clearDurableFailures(accountKey), clearDurableFailures(ipKey)]);
  const session = await issueSession(user.id, user.sessionEpoch);
  log('auth.login', { correlationId, actorId: user.id, outcome: 'success' });
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
