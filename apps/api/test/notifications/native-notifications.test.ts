import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  send: vi.fn(),
  requireMutationSecurity: vi.fn(),
}));
vi.mock('../../src/shared/dynamodb.js', () => ({
  dynamodb: { send: dependencies.send },
  tableName: 'table',
}));
vi.mock('../../src/shared/security.js', () => ({
  requireMutationSecurity: dependencies.requireMutationSecurity,
}));
vi.mock('../../src/tasks/task-repository.js', () => ({ findTask: vi.fn() }));
vi.mock('@naaseh/observability', () => ({ metric: vi.fn(), log: vi.fn() }));
import {
  nativeInstallationKey,
  nativeInstallationSchema,
  nativeUnregisterSchema,
} from '../../src/notifications/native-installation.js';
import { handler } from '../../src/notifications/handler.js';

describe('native notification installations', () => {
  const valid = {
    kind: 'apple' as const,
    clientId: 'device-1',
    platform: 'ios' as const,
    environment: 'sandbox' as const,
    token: 'a'.repeat(64),
    topic: 'link.thepandas.naaseh',
    previewPolicy: 'generic' as const,
  };

  beforeEach(() => {
    dependencies.send.mockReset().mockResolvedValue({});
    dependencies.requireMutationSecurity.mockReset();
  });

  const invoke = async (
    method: 'POST' | 'DELETE',
    options: { signedIn?: boolean; body?: unknown; query?: Record<string, string> } = {},
  ) =>
    (await handler(
      {
        headers: { origin: 'https://gsd.thepandas.link', 'x-csrf-token': 'csrf' },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        ...(options.query ? { queryStringParameters: options.query } : {}),
        requestContext: {
          requestId: 'request-1',
          http: { method },
          ...(options.signedIn === false
            ? {}
            : { authorizer: { lambda: { userId: 'user-1', csrfToken: 'csrf' } } }),
        },
      } as never,
      {} as never,
      vi.fn(),
    )) as { statusCode: number };

  it('accepts device ownership, token rotation, and privacy-limited preview policy', () => {
    expect(nativeInstallationSchema.parse(valid).previewPolicy).toBe('generic');
    expect(nativeInstallationSchema.parse({ ...valid, token: 'b'.repeat(64) }).token).not.toBe(
      valid.token,
    );
    expect(nativeInstallationKey('user-1', 'device-1')).toEqual({
      PK: 'PUSH#USER#user-1',
      SK: 'APPLE#device-1',
    });
  });

  it('rejects unknown fields, bad topics/tokens, and unregistering another user implicitly', () => {
    expect(nativeInstallationSchema.safeParse({ ...valid, protectedText: 'secret' }).success).toBe(
      false,
    );
    expect(nativeInstallationSchema.safeParse({ ...valid, token: 'not-hex' }).success).toBe(false);
    expect(nativeInstallationSchema.safeParse({ ...valid, topic: 'evil.example' }).success).toBe(
      false,
    );
    expect(
      nativeUnregisterSchema.safeParse({ clientId: 'device-1', userId: 'other' }).success,
    ).toBe(false);
  });

  it('requires authentication and Origin/CSRF for registration and unregister', async () => {
    expect((await invoke('POST', { signedIn: false, body: valid })).statusCode).toBe(401);
    expect((await invoke('POST', { body: valid })).statusCode).toBe(204);
    expect(dependencies.requireMutationSecurity).toHaveBeenCalledWith(
      'https://gsd.thepandas.link',
      'csrf',
      'csrf',
    );
    dependencies.requireMutationSecurity.mockImplementationOnce(() => {
      throw Object.assign(new Error('Request rejected.'), { statusCode: 403 });
    });
    expect(
      (await invoke('DELETE', { query: { clientId: 'device-1', kind: 'apple' } })).statusCode,
    ).toBe(403);
  });

  it('rotates and unregisters only the signed-in user installation key', async () => {
    expect((await invoke('POST', { body: valid })).statusCode).toBe(204);
    expect((await invoke('POST', { body: { ...valid, token: 'b'.repeat(64) } })).statusCode).toBe(
      204,
    );
    expect(dependencies.send.mock.calls[0]?.[0].input.Item).toMatchObject({
      PK: 'PUSH#USER#user-1',
      SK: 'APPLE#device-1',
    });
    expect(dependencies.send.mock.calls[1]?.[0].input.Item).toMatchObject({
      PK: 'PUSH#USER#user-1',
      SK: 'APPLE#device-1',
    });
    expect(
      (await invoke('DELETE', { query: { clientId: 'device-1', kind: 'apple' } })).statusCode,
    ).toBe(204);
    expect(dependencies.send.mock.calls[2]?.[0].input.Key).toEqual({
      PK: 'PUSH#USER#user-1',
      SK: 'APPLE#device-1',
    });
  });
});
