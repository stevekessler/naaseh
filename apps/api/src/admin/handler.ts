import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { z } from 'zod';
import { errorResponse, json, problem } from '../shared/http.js';
import { requireMutationSecurity } from '../shared/security.js';
import { createProfilePictureUpload } from './profile-picture.js';
import { requireAdminMutation } from './admin-authorization.js';
import { provisionUserWithConfiguredPepper } from './provision-user.js';
import { userAdminService } from './user-admin-service.js';
import { putRecord } from '../shared/store.js';
import { createLogger } from '@naaseh/observability';

const statusSchema = z.object({ active: z.boolean() }).strict();
const uploadSchema = z
  .object({
    userId: z.string().min(1).max(200),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    contentLength: z.number().int().positive().max(5_000_000),
  })
  .strict();

function claims(event: APIGatewayProxyEventV2) {
  return (
    event.requestContext as typeof event.requestContext & {
      authorizer?: { lambda?: { userId?: string; role?: string; csrfToken?: string } };
    }
  ).authorizer?.lambda;
}

async function handle(event: APIGatewayProxyEventV2) {
  const correlationId = event.requestContext.requestId || randomUUID();
  const logger = createLogger(process.env);
  const auth = claims(event);
  try {
    requireAdminMutation(auth ?? {});
  } catch {
    return problem(403, 'forbidden', 'Administrator access required.', correlationId);
  }
  if (!auth?.userId)
    return problem(403, 'forbidden', 'Administrator access required.', correlationId);
  const method = event.requestContext.http.method;
  if (method === 'GET' && event.rawPath.endsWith('/admin/users'))
    return json(200, { items: await userAdminService.listUsers() });

  requireMutationSecurity(
    event.headers.origin,
    auth.csrfToken ?? '',
    event.headers['x-csrf-token'],
  );
  if (method === 'POST' && event.rawPath.endsWith('/admin/users')) {
    const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    const result = await provisionUserWithConfiguredPepper({
      ...body,
      version: 'naaseh.provision-user/v1',
    });
    await putRecord(
      {
        PK: `AUDIT#${randomUUID()}`,
        SK: 'EVENT',
        event: 'user.provisioned',
        actorId: auth.userId,
        userId: result.user.id,
        role: result.user.role,
        created: result.created,
        at: new Date().toISOString(),
      },
      'attribute_not_exists(PK)',
    );
    logger.admin('user.provisioned', {
      correlationId,
      actorId: auth.userId,
      resourceId: result.user.id,
      role: result.user.role,
      outcome: 'success',
    });
    logger.metric('UsersProvisioned', result.created ? 1 : 0);
    return json(result.created ? 201 : 200, result);
  }
  if (method === 'PATCH' && event.pathParameters?.userId) {
    const body = statusSchema.parse(JSON.parse(event.body ?? '{}'));
    const value = await userAdminService.setUserActive(
      auth.userId,
      event.pathParameters.userId,
      body.active,
    );
    await putRecord(
      {
        PK: `AUDIT#${randomUUID()}`,
        SK: 'EVENT',
        event: body.active ? 'user.reactivated' : 'user.disabled',
        actorId: auth.userId,
        userId: value.id,
        at: new Date().toISOString(),
      },
      'attribute_not_exists(PK)',
    );
    logger.admin(body.active ? 'user.reactivated' : 'user.disabled', {
      correlationId,
      actorId: auth.userId,
      resourceId: value.id,
      outcome: 'success',
    });
    logger.metric('UserStatusChanges', 1);
    return json(200, value);
  }
  if (method === 'POST' && event.rawPath.endsWith('/admin/profile-pictures/upload')) {
    const body = uploadSchema.parse(JSON.parse(event.body ?? '{}'));
    return json(201, await createProfilePictureUpload(body));
  }
  return problem(405, 'method_not_allowed', 'Method not allowed.', correlationId);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await handle(event);
  } catch (error) {
    return errorResponse(error, {
      correlationId: event.requestContext.requestId || randomUUID(),
      operation: 'admin.request',
      actorId: claims(event)?.userId,
      resourceId: event.pathParameters?.userId,
    });
  }
};
