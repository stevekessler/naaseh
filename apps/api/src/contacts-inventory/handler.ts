import { mutateItem } from './items.js';
import { z } from 'zod';
import { ContactCatalog } from './catalogs.js';
import { bodyJson, mutateContact } from './contacts.js';
import { isActiveRelease } from './active-release.js';
import { DynamoWorkspaceStore } from './dynamo-store.js';
import { isWorkspaceReadPath, readWorkspace } from './read-routes.js';
import { WorkspaceError, WorkspaceRepository } from './repository.js';
import { createFeatureTelemetry, featureOperation } from './telemetry.js';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  catalogIdSchema,
  locationFieldsSchema,
  parseMutationHeaders,
  featureApiPrefix,
  featureCatalogs,
  releaseIdSchema,
} from '@naaseh/contacts-inventory-contracts';
import { sessionAuthorizerContext } from '../shared/authorizer-context.js';
import { validCsrf, validOrigin } from '../shared/security.js';

function error(
  statusCode: number,
  code: string,
  message: string,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, message }),
  };
}

async function handleRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const session = sessionAuthorizerContext(event);
  if (!session?.userId || (session.role !== 'user' && session.role !== 'admin')) {
    return error(401, 'session_required', 'Sign in and try again.');
  }

  const release = releaseIdSchema.safeParse(process.env.CONTACTS_INVENTORY_RELEASE);
  const workspace = process.env.CONTACTS_INVENTORY_WORKSPACE;
  const members = [
    process.env.CONTACTS_INVENTORY_MEMBER_ONE,
    process.env.CONTACTS_INVENTORY_MEMBER_TWO,
  ];
  if (
    !release.success ||
    !workspace ||
    members.some((member) => !member) ||
    members[0] === members[1]
  ) {
    return error(503, 'feature_unavailable', 'Contacts and Inventory is temporarily unavailable.');
  }

  const prefix = featureApiPrefix(release.data);
  if (!event.rawPath.startsWith(prefix)) {
    return error(410, 'release_withdrawn', 'Reload to check for an available release.');
  }
  const path = event.rawPath.slice(prefix.length);
  const method = event.requestContext.http.method;
  const catalogWrite =
    method === 'PUT' &&
    featureCatalogs.some((catalog) => new RegExp(`^catalogs/${catalog}/[\\w-]+$`, 'u').test(path));
  const member = members.includes(session.userId);
  const authorized = catalogWrite
    ? session.role === 'admin'
    : member || (path === 'catalogs' && method === 'GET' && session.role === 'admin');
  if (!authorized) return error(403, 'forbidden', 'You do not have access to this action.');

  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    (!session.csrfToken ||
      !validOrigin(event.headers.origin) ||
      !validCsrf(session.csrfToken, event.headers['x-csrf-token']))
  ) {
    return error(403, 'forbidden', 'Refresh your session and retry the action.');
  }

  const bucket = process.env.CONTACTS_INVENTORY_ARTIFACT_BUCKET;
  const readiness = method === 'GET' && path === 'release/readiness';
  if (process.env.NODE_ENV === 'production' && !bucket)
    return error(503, 'feature_unavailable', 'The release configuration is unavailable.');
  if (bucket && !readiness) {
    try {
      if (!(await isActiveRelease(bucket, release.data)))
        return error(410, 'release_withdrawn', 'Reload to check for an available release.');
    } catch {
      return error(503, 'retry_required', 'The release configuration is temporarily unavailable.');
    }
  }

  const table = process.env.CONTACTS_INVENTORY_RECORDS_TABLE;
  const ledger = process.env.CONTACTS_INVENTORY_LEDGER_TABLE;
  if (table && ledger) {
    const repo = new WorkspaceRepository(new DynamoWorkspaceStore(workspace, table, ledger));
    const catalog = new ContactCatalog(table, workspace);
    try {
      let body: unknown;
      let statusCode = 200;
      const item = path.match(/^items\/([^/]+)$/u);
      const location = path.match(/^catalogs\/locations\/([^/]+)$/u);
      const contact = path.match(/^contacts\/([^/]+)$/u);
      const contactType = path.match(/^catalogs\/contact-types\/([^/]+)$/u);
      if (method === 'GET' && (readiness || isWorkspaceReadPath(path))) {
        body = await readWorkspace(
          repo,
          session.userId,
          workspace,
          readiness ? 'sync/checkpoint' : path,
          event.queryStringParameters ?? {},
          event.headers,
        );
        if (!body) return error(404, 'record_unavailable', 'This record is unavailable.');
        if (readiness) body = { releaseId: release.data, ready: true };
      } else if (method === 'GET' && path === 'catalogs') {
        body = {
          contactTypes: await catalog.list(),
          locations: await catalog.locations(),
          strengthUnits: [],
          generation: (await repo.store.checkpoint()).generation,
        };
      } else if (method === 'PUT' && contactType) {
        const id = catalogIdSchema.safeParse(contactType[1]);
        const input = z
          .strictObject({ name: z.string().trim().min(1).max(80) })
          .safeParse(bodyJson(event));
        const precondition = parseMutationHeaders(event.headers);
        if (!id.success || !input.success || !precondition)
          return error(400, 'invalid_catalog', 'Enter a valid contact type and retry.');
        if ((await repo.store.checkpoint()).generation !== precondition.generation)
          throw new WorkspaceError('reset_required');
        body = await catalog.write(id.data, input.data.name, session.userId, precondition);
        statusCode = precondition.mode === 'create' ? 201 : 200;
      } else if (method === 'PUT' && location) {
        const id = catalogIdSchema.safeParse(location[1]);
        const input = locationFieldsSchema.safeParse(bodyJson(event));
        const precondition = parseMutationHeaders(event.headers);
        if (!id.success || !input.success || !precondition)
          return error(400, 'invalid_catalog', 'Enter a valid inventory location and retry.');
        if ((await repo.store.checkpoint()).generation !== precondition.generation)
          throw new WorkspaceError('reset_required');
        body = await catalog.writeLocation(id.data, input.data, session.userId, precondition);
        statusCode = precondition.mode === 'create' ? 201 : 200;
      } else if (item?.[1] && (method === 'PUT' || method === 'DELETE')) {
        const result = await mutateItem(repo, catalog, session.userId, item[1], event);
        if (!result)
          return error(400, 'invalid_item', 'Check the item name and location and try again.');
        body = result;
        statusCode = result.action === 'create' ? 201 : 200;
      } else if (contact?.[1] && (method === 'PUT' || method === 'DELETE')) {
        const result = await mutateContact(repo, catalog, session.userId, contact[1], event);
        if (!result)
          return error(400, 'invalid_contact', 'Check the contact details and try again.');
        body = result;
        statusCode = result.action === 'create' ? 201 : 200;
      }
      if (body !== undefined)
        return {
          statusCode,
          headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
    } catch (failure) {
      if (failure instanceof WorkspaceError) {
        if (failure.code === 'invalid_cursor')
          return error(400, failure.code, 'Refresh the current page and try again.');
        if (failure.code === 'reset_required')
          return error(409, failure.code, 'Refresh the local workspace before continuing.');
        if (failure.code === 'revision_conflict' || failure.code === 'idempotency_conflict')
          return error(409, failure.code, 'The record has changed. Refresh it before retrying.');
      }
      return error(503, 'retry_required', 'The workspace is temporarily unavailable. Try again.');
    }
  }

  return error(503, 'feature_unavailable', 'Contacts and Inventory is temporarily unavailable.');
}

const telemetry = createFeatureTelemetry();

export async function handler(event: APIGatewayProxyEventV2) {
  const start = performance.now();
  const response = await handleRequest(event);
  const release = process.env.CONTACTS_INVENTORY_RELEASE;
  const prefix = release ? featureApiPrefix(release) : '';
  const path = event.rawPath.startsWith(prefix) ? event.rawPath.slice(prefix.length) : '';
  telemetry(
    featureOperation(path),
    event.requestContext.requestId,
    response.statusCode ?? 500,
    Math.round(performance.now() - start),
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.requestContext.http.method),
  );
  return response;
}
