import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  itemFieldsSchema,
  itemPayload,
  parseMutationHeaders,
} from '@naaseh/contacts-inventory-contracts';
import { bodyJson } from './contacts.js';
import type { ContactCatalog } from './catalogs.js';
import type { WorkspaceRepository } from './repository.js';

export async function mutateItem(
  repository: WorkspaceRepository,
  catalog: Pick<ContactCatalog, 'location' | 'strengthUnit'>,
  actor: string,
  id: string,
  event: APIGatewayProxyEventV2,
) {
  const key = z.uuid().safeParse(id);
  const version = parseMutationHeaders(event.headers);
  const method = event.requestContext.http.method;
  if (!key.success || !version || (method === 'DELETE' && version.mode !== 'update')) return null;
  const common = {
    kind: 'item' as const,
    id: key.data.toLowerCase(),
    actor,
    generation: version.generation,
    mutationId: version.mutationId,
  };
  if (method === 'DELETE' && version.mode === 'update') {
    return repository.mutate({ ...common, action: 'delete', revision: version.revision });
  }
  const parsed = itemFieldsSchema.safeParse(bodyJson(event));
  if (!parsed.success || !(await catalog.location(parsed.data.locationId))) return null;
  if (
    parsed.data.type === 'medicine' &&
    parsed.data.strengthUnitId &&
    !(await catalog.strengthUnit(parsed.data.strengthUnitId))
  )
    return null;
  return version.mode === 'create'
    ? repository.mutate({ ...common, action: 'create', fields: itemPayload(parsed.data) })
    : repository.mutate({
        ...common,
        action: 'update',
        revision: version.revision,
        fields: itemPayload(parsed.data),
      });
}
