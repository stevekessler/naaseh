import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
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

export function handler(event: APIGatewayProxyEventV2): APIGatewayProxyStructuredResultV2 {
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

  return error(503, 'feature_unavailable', 'Contacts and Inventory is temporarily unavailable.');
}
