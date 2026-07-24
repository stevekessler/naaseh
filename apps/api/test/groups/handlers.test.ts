import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupMembership, GroupRecord } from '@naaseh/domain';

const repository = vi.hoisted(() => ({
  getGroup: vi.fn(),
  getMembership: vi.fn(),
  listActiveGroups: vi.fn(),
  listMemberships: vi.fn(),
  listUserMemberships: vi.fn(),
  putGroupWithOwner: vi.fn(),
  putMembership: vi.fn(),
  revokeMembership: vi.fn(),
  updateMembership: vi.fn(),
}));
const password = vi.hoisted(() => ({
  loadPepper: vi.fn(async () => ({ value: 'pepper' })),
  hashPassword: vi.fn(async () => '$argon2id$verifier'),
  verifyPassword: vi.fn(async () => false),
}));
const rateLimit = vi.hoisted(() => ({
  clearDurableFailures: vi.fn(),
  durableCanAttempt: vi.fn(async () => true),
  registerDurableFailure: vi.fn(async () => 1_000),
}));
const store = vi.hoisted(() => ({ putRecord: vi.fn() }));

vi.mock('../../src/groups/group-repository.js', () => repository);
vi.mock('../../src/auth/password.js', () => password);
vi.mock('../../src/auth/rate-limit.js', () => rateLimit);
vi.mock('../../src/shared/store.js', () => store);

import { handler } from '../../src/groups/handlers.js';

const at = '2026-07-22T12:00:00.000Z';
const group: GroupRecord = {
  id: 'group-1',
  name: 'Family',
  ownerId: 'owner',
  status: 'active',
  createdAt: at,
  version: 1,
};
const membership: GroupMembership = {
  groupId: group.id,
  userId: 'member',
  role: 'member',
  status: 'active',
  joinedAt: at,
  joinedBy: 'member',
  version: 1,
};

function event(
  method: string,
  rawPath: string,
  options: { body?: unknown; pathParameters?: Record<string, string> } = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${rawPath}`,
    rawPath,
    rawQueryString: '',
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'csrf-token',
    },
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      http: {
        method,
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'correlation-1',
      routeKey: `${method} ${rawPath}`,
      stage: '$default',
      time: at,
      timeEpoch: Date.parse(at),
      authorizer: { lambda: { userId: 'member', csrfToken: 'csrf-token' } },
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.pathParameters ? { pathParameters: options.pathParameters } : {}),
    isBase64Encoded: false,
  };
}

async function invoke(input: APIGatewayProxyEventV2) {
  return (await handler(input, {} as Context, () => undefined)) as {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.getGroup.mockResolvedValue(group);
  repository.getMembership.mockResolvedValue(membership);
  repository.listActiveGroups.mockResolvedValue([group]);
  repository.listMemberships.mockResolvedValue([membership]);
  repository.listUserMemberships.mockResolvedValue([membership]);
});

describe('group HTTP lifecycle', () => {
  it('creates a group with a safe 201 response', async () => {
    const response = await invoke(
      event('POST', '/api/v1/groups', { body: { name: 'Work', joinPin: '123456' } }),
    );
    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain('123456');
    expect(response.body).not.toContain('$argon2id$verifier');
    expect(repository.putGroupWithOwner).toHaveBeenCalledOnce();
  });

  it('returns the canonical membership for an idempotent active join', async () => {
    const response = await invoke(
      event('POST', '/api/v1/groups/group-1/join', {
        body: {},
        pathParameters: { groupId: group.id },
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      groupId: group.id,
      userId: membership.userId,
      role: 'member',
      status: 'active',
    });
    expect(repository.putMembership).not.toHaveBeenCalled();
  });

  it('uses one generic 403 response for a revoked self-join', async () => {
    repository.getMembership.mockResolvedValue({
      ...membership,
      status: 'revoked',
      revokedAt: at,
    });
    const response = await invoke(
      event('POST', '/api/v1/groups/group-1/join', {
        body: { pin: '999999' },
        pathParameters: { groupId: group.id },
      }),
    );
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      code: 'group_join_failed',
      message: 'Unable to join group.',
    });
    expect(response.body).not.toContain('revoked');
    expect(response.body).not.toContain('999999');
  });

  it('returns 204 only after both membership views are revoked', async () => {
    const ownerGroup = { ...group, ownerId: 'member' };
    repository.getGroup.mockResolvedValue(ownerGroup);
    repository.getMembership.mockResolvedValue({ ...membership, userId: 'other' });
    const response = await invoke(
      event('DELETE', '/api/v1/groups/group-1/members/other', {
        pathParameters: { groupId: group.id, userId: 'other' },
      }),
    );
    expect(response.statusCode).toBe(204);
    expect(repository.revokeMembership).toHaveBeenCalledOnce();
  });

  it('maps dependency failures to correlated, retryable problem details', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    repository.listActiveGroups.mockRejectedValue(
      Object.assign(new Error('internal table detail'), { $metadata: { httpStatusCode: 500 } }),
    );
    const response = await invoke(event('GET', '/api/v1/groups'));
    expect(response).toMatchObject({
      statusCode: 502,
      headers: { 'content-type': 'application/problem+json', 'retry-after': '1' },
    });
    expect(response.body).toContain('correlation-1');
    expect(response.body).not.toContain('internal table detail');
  });
});
