import { visibleContacts } from '../../apps/contacts-inventory/src/contacts/contact-filters.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ContactCatalog } from '../../apps/api/src/contacts-inventory/catalogs.js';
import { mutateContact } from '../../apps/api/src/contacts-inventory/contacts.js';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import { describe, expect, it, vi } from 'vitest';
import {
  contactFieldsSchema,
  contactMatches,
  prescriberContactTypeId,
} from '../../packages/contacts-inventory-contracts/src/contacts.js';

describe('Contacts and Inventory contact fields', () => {
  it('requires a name and preserves leading zip zeroes', () => {
    expect(contactFieldsSchema.safeParse({ firstName: ' ', lastName: '' }).success).toBe(false);
    expect(contactFieldsSchema.parse({ firstName: ' Ada ', zip: '00123' })).toEqual({
      firstName: 'Ada',
      zip: '00123',
    });
  });

  it('retains the preferred field only when its number is populated', () => {
    expect(
      contactFieldsSchema.parse({
        lastName: 'Example',
        phone: '303-555-0199',
        defaultNumber: 'phone',
      }),
    ).toMatchObject({ defaultNumber: 'phone' });
    expect(
      contactFieldsSchema.parse({ lastName: 'Example', cell: ' ', defaultNumber: 'cell' }),
    ).not.toHaveProperty('defaultNumber');
  });

  it('combines type filters with case-insensitive names and normalized phone digits', () => {
    const contact = contactFieldsSchema.parse({
      firstName: 'Ada',
      lastName: 'Example',
      phone: '(303) 555-0199',
      contactTypeId: prescriberContactTypeId,
    });
    expect(contactMatches(contact, 'ADA ex', prescriberContactTypeId)).toBe(true);
    expect(contactMatches(contact, '555-0199')).toBe(true);
    expect(contactMatches(contact, 'ADA', 'another-type')).toBe(false);
    expect(contactMatches(contact, 'Ada 0199')).toBe(false);
  });
});

describe('Contacts and Inventory contact API boundaries', () => {
  const contactId = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
  const makeMutation = (method: 'PUT' | 'DELETE', revision?: number, body?: unknown) =>
    ({
      requestContext: { http: { method } },
      headers: {
        'idempotency-key': revision
          ? 'b4d02419-80af-4a8f-b710-1a49e7ca3002'
          : 'b4d02419-80af-4a8f-b710-1a49e7ca3001',
        'x-workspace-generation': '1',
        ...(revision ? { 'if-match': `"${revision}"` } : { 'if-none-match': '*' }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }) as APIGatewayProxyEventV2;

  it('validates references, writes one canonical contact and revokes reads on member deletion', async () => {
    const repo = new WorkspaceRepository(new MemoryWorkspaceStore());
    const catalog = new ContactCatalog('records', 'workspace');
    const type = vi
      .spyOn(catalog, 'type')
      .mockImplementation(async (id) =>
        id === prescriberContactTypeId ? { id, name: 'Prescriber', revision: 1 } : undefined,
      );
    await expect(
      mutateContact(
        repo,
        catalog,
        'member-a',
        contactId,
        makeMutation('PUT', undefined, { firstName: 'Example', contactTypeId: 'invalid' }),
      ),
    ).resolves.toBeNull();
    await expect(
      mutateContact(
        repo,
        catalog,
        'member-a',
        contactId,
        makeMutation('PUT', undefined, {
          firstName: 'Example',
          contactTypeId: prescriberContactTypeId,
        }),
      ),
    ).resolves.toMatchObject({ id: contactId, revision: 1, action: 'create' });
    expect(type).toHaveBeenCalledWith(prescriberContactTypeId);
    await expect(
      mutateContact(repo, catalog, 'member-b', contactId, makeMutation('DELETE', 1)),
    ).resolves.toMatchObject({ deleted: true, revision: 2 });
    await expect(repo.read({ kind: 'contact', id: contactId })).resolves.toBeNull();
  });

  it('keeps the Prescriber identity when an admin renames the seeded catalog entry', async () => {
    const catalog = new ContactCatalog('records', 'workspace');
    const send = vi
      .spyOn(dynamodb, 'send')
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never);
    try {
      await expect(catalog.type(prescriberContactTypeId)).resolves.toMatchObject({
        name: 'Prescriber',
        revision: 1,
      });
      await expect(
        catalog.write(prescriberContactTypeId, 'Prescriber label', 'catalog-admin', {
          mode: 'update',
          mutationId: contactId,
          generation: 1,
          revision: 1,
        }),
      ).resolves.toMatchObject({
        id: prescriberContactTypeId,
        name: 'Prescriber label',
        revision: 2,
      });
      const write = send.mock.calls[2]?.[0] as unknown as TransactWriteCommand;
      expect(write.input.TransactItems?.[1]?.Put?.Item).toMatchObject({
        sk: 'contact-types#prescriber',
        value: { id: prescriberContactTypeId, revision: 2 },
      });
    } finally {
      send.mockRestore();
    }
  });
});

it('keeps duplicate display names as separate visible contacts', () => {
  const fields = contactFieldsSchema.parse({ firstName: 'Synthetic' });
  const entries = [
    { id: 'contact-b', revision: 1, fields },
    { id: 'contact-a', revision: 1, fields },
  ];
  expect(visibleContacts(entries, 'synthetic', '').map(({ id }) => id)).toEqual([
    'contact-a',
    'contact-b',
  ]);
  expect(visibleContacts(entries, '', prescriberContactTypeId)).toEqual([]);
});
