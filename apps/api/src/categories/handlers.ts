import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { categorySchema, createUlid } from '@naaseh/domain';
import {
  archiveCategory,
  createCategoryRecord,
  getCategory,
  listCategories,
  updateCategoryRecord,
} from './category-repository.js';
import { errorResponse, json, problem } from '../shared/http.js';
import { putRecord } from '../shared/store.js';
import { requireMutationSecurity } from '../shared/security.js';
import { requireAdminMutation } from '../admin/admin-authorization.js';
import { createLogger } from '@naaseh/observability';

export const createCategoryHandler: APIGatewayProxyHandlerV2 = async (event) => {
  const context = event.requestContext as typeof event.requestContext & {
    authorizer?: { lambda?: { role?: string; userId?: string; csrfToken?: string } };
  };
  const auth = context.authorizer?.lambda;
  const logger = createLogger(process.env);
  if (!auth?.userId)
    return problem(401, 'unauthorized', 'Authentication required.', event.requestContext.requestId);
  if (event.requestContext.http.method === 'GET') return json(200, await listCategories());
  try {
    requireAdminMutation(auth);
  } catch {
    return problem(
      403,
      'forbidden',
      'Administrator access required.',
      event.requestContext.requestId,
    );
  }
  try {
    requireMutationSecurity(
      event.headers.origin,
      auth.csrfToken ?? '',
      event.headers['x-csrf-token'],
    );
    const id = event.pathParameters?.categoryId;
    if (event.requestContext.http.method === 'DELETE' && id) {
      const value = await archiveCategory(id);
      await putRecord({
        PK: `AUDIT#${createUlid()}`,
        SK: 'EVENT',
        event: 'category.archived',
        actorId: auth.userId,
        categoryId: id,
        at: new Date().toISOString(),
      });
      logger.metric('CategoryAdminChanges', 1);
      return json(200, value);
    }
    const body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    if (id) {
      const current = await getCategory(id);
      if (!current)
        return problem(404, 'not_found', 'Category not found.', event.requestContext.requestId);
      const value = categorySchema.parse({ ...current, ...body, id, version: current.version + 1 });
      await updateCategoryRecord(current, value);
      await putRecord({
        PK: `AUDIT#${createUlid()}`,
        SK: 'EVENT',
        event: 'category.updated',
        actorId: auth.userId,
        categoryId: id,
        at: new Date().toISOString(),
      });
      logger.metric('CategoryAdminChanges', 1);
      return json(200, value);
    }
    const value = categorySchema.parse({ id: createUlid(), ...body });
    await createCategoryRecord(value);
    await putRecord({
      PK: `AUDIT#${createUlid()}`,
      SK: 'EVENT',
      event: 'category.created',
      actorId: auth.userId,
      categoryId: value.id,
      at: new Date().toISOString(),
    });
    logger.metric('CategoryAdminChanges', 1);
    return json(201, value);
  } catch (error) {
    return errorResponse(error, {
      correlationId: event.requestContext.requestId,
      operation: 'categories.request',
      actorId: auth.userId,
      resourceId: event.pathParameters?.categoryId,
    });
  }
};
export const handler = createCategoryHandler;
