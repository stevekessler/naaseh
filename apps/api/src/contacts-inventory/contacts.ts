import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  contactFieldsSchema,
  contactPayload,
  parseMutationHeaders,
} from '@naaseh/contacts-inventory-contracts';
import type { ContactCatalog } from './catalogs.js';
import type { WorkspaceRepository } from './repository.js';

export function bodyJson(event: APIGatewayProxyEventV2): unknown {
  if (event.isBase64Encoded || !event.body || event.body.length > 20_000) return null;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

export async function mutateContact(
  repository: WorkspaceRepository,
  catalog: ContactCatalog,
  actor: string,
  id: string,
  event: APIGatewayProxyEventV2,
) {
  const key = z.uuid().safeParse(id);
  const version = parseMutationHeaders(event.headers);
  const method = event.requestContext.http.method;
  if (!key.success || !version || (method === 'DELETE' && version.mode !== 'update')) return null;
  const common = {
    kind: 'contact' as const,
    id: key.data.toLowerCase(),
    actor,
    generation: version.generation,
    mutationId: version.mutationId,
  };
  if (method === 'DELETE' && version.mode === 'update') {
    return repository.mutate({ ...common, action: 'delete', revision: version.revision });
  }
  const parsed = contactFieldsSchema.safeParse(bodyJson(event));
  if (!parsed.success) return null;
  if (parsed.data.contactTypeId && !(await catalog.type(parsed.data.contactTypeId))) return null;
  return version.mode === 'create'
    ? repository.mutate({ ...common, action: 'create', fields: contactPayload(parsed.data) })
    : repository.mutate({
        ...common,
        action: 'update',
        revision: version.revision,
        fields: contactPayload(parsed.data),
      });
}
