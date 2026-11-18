import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../apps/api/src/contacts-inventory/handler.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';

const base = `/api/v1/contacts-inventory/releases/${fixture.releases[0]}`;

function request(
  method: string,
  path: string,
  actor?: { userId: string; role: 'user' | 'admin' },
  csrf = 'fixture-csrf',
): APIGatewayProxyEventV2 {
  return {
    rawPath: `${base}${path}`,
    headers: { origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf },
    requestContext: {
      http: { method },
      ...(actor ? { authorizer: { lambda: { ...actor, csrfToken: 'fixture-csrf' } } } : {}),
    },
  } as APIGatewayProxyEventV2;
}

describe('Contacts and Inventory API access boundary', () => {
  beforeEach(() => {
    vi.stubEnv('CONTACTS_INVENTORY_RELEASE', fixture.releases[0]);
    vi.stubEnv('CONTACTS_INVENTORY_WORKSPACE', fixture.workspace);
    vi.stubEnv('CONTACTS_INVENTORY_MEMBER_ONE', fixture.members[0]);
    vi.stubEnv('CONTACTS_INVENTORY_MEMBER_TWO', fixture.members[1]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires a session and keeps the same workspace access for both members', () => {
    expect(handler(request('GET', '/contacts')).statusCode).toBe(401);
    for (const userId of fixture.members) {
      const response = handler(request('GET', '/contacts', { userId, role: 'user' }));
      expect(response.statusCode).toBe(503);
      expect(response.headers?.['Cache-Control']).toBe('no-store');
    }
  });

  it('denies nonmembers and limits separate catalog admins to catalog writes', () => {
    const admin = { userId: fixture.catalogAdmin, role: 'admin' as const };
    const outsider = { userId: fixture.outsider, role: 'user' as const };
    expect(handler(request('GET', '/contacts', admin)).statusCode).toBe(403);
    expect(handler(request('GET', '/items/known/image', outsider)).statusCode).toBe(403);
    expect(handler(request('PUT', '/catalogs/locations/home', admin)).statusCode).toBe(503);
    expect(
      handler(
        request('PUT', '/catalogs/locations/home', { userId: fixture.members[0], role: 'user' }),
      ).statusCode,
    ).toBe(403);
  });

  it('requires a matching CSRF token for mutations', () => {
    const member = { userId: fixture.members[0], role: 'user' as const };
    expect(handler(request('DELETE', '/items/known', member, 'invalid')).statusCode).toBe(403);
    expect(handler(request('DELETE', '/items/known', member)).statusCode).toBe(503);
  });
});
