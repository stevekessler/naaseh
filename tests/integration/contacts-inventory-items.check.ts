import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import {
  itemFieldsSchema,
  locationFieldsSchema,
} from '../../packages/contacts-inventory-contracts/src/items.js';
import { mutateItem } from '../../apps/api/src/contacts-inventory/items.js';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';

const itemId = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
const base = { name: 'Travel bag', locationId: 'linen-closet', type: 'base' };
const catalog = {
  async strengthUnit() {
    return undefined;
  },
  async location(id: string) {
    return id === base.locationId ? { id, name: 'Linen closet', revision: 1 } : undefined;
  },
};
function mutation(
  method: 'PUT' | 'DELETE',
  generation: number,
  revision?: number,
  fields?: unknown,
) {
  return {
    requestContext: { http: { method } },
    headers: {
      'idempotency-key': revision
        ? 'b4d02419-80af-4a8f-b710-1a49e7ca3002'
        : 'b4d02419-80af-4a8f-b710-1a49e7ca3001',
      'x-workspace-generation': String(generation),
      ...(revision ? { 'if-match': `"${revision}"` } : { 'if-none-match': '*' }),
    },
    ...(fields ? { body: JSON.stringify(fields) } : {}),
  } as APIGatewayProxyEventV2;
}

describe('shared inventory items and locations', () => {
  it('preserves multiline location details and requires a valid location ID and nonblank item name', () => {
    expect(
      locationFieldsSchema.parse({ name: ' Linen closet ', details: 'Top shelf\nBlue basket' }),
    ).toEqual({ name: 'Linen closet', details: 'Top shelf\nBlue basket' });
    expect(itemFieldsSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
    expect(itemFieldsSchema.safeParse({ ...base, locationId: '' }).success).toBe(false);
    expect(itemFieldsSchema.safeParse({ ...base, activeImageId: 'unverified' }).success).toBe(
      false,
    );
  });

  it('validates references and lets the other member delete the same record', async () => {
    const repository = new WorkspaceRepository(new MemoryWorkspaceStore());
    await expect(
      mutateItem(
        repository,
        catalog,
        'member-one',
        itemId,
        mutation('PUT', 1, undefined, { ...base, locationId: 'unknown' }),
      ),
    ).resolves.toBeNull();
    await expect(
      mutateItem(repository, catalog, 'member-one', itemId, mutation('PUT', 1, undefined, base)),
    ).resolves.toMatchObject({ id: itemId, revision: 1 });
    await expect(repository.read({ kind: 'item', id: itemId })).resolves.toMatchObject({
      fields: base,
    });
    await expect(
      mutateItem(repository, catalog, 'member-two', itemId, mutation('DELETE', 1, 1)),
    ).resolves.toMatchObject({ deleted: true });
    await expect(repository.read({ kind: 'item', id: itemId })).resolves.toBeNull();
  });
});
