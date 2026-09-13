import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  listUserDirectory: vi.fn(),
  createProfilePictureUpload: vi.fn(),
  requireMutationSecurity: vi.fn(),
}));
vi.mock('../../src/admin/user-directory.js', () => mocks);
vi.mock('../../src/admin/profile-picture.js', () => mocks);
vi.mock('../../src/shared/security.js', () => mocks);
vi.mock('../../src/admin/provision-user.js', () => ({
  provisionUserWithConfiguredPepper: vi.fn(),
}));
vi.mock('../../src/admin/user-admin-service.js', () => ({ userAdminService: {} }));
vi.mock('../../src/shared/store.js', () => ({ putRecord: vi.fn() }));
const { handler } = await import('../../src/admin/handler.js');
const invoke = async (path: string, method = 'GET', body?: object, signedIn = true) =>
  (await handler(
    {
      rawPath: `/api/v1${path}`,
      headers: { origin: 'https://gsd.thepandas.link', 'x-csrf-token': 'csrf' },
      body: body ? JSON.stringify(body) : undefined,
      requestContext: {
        requestId: 'test',
        http: { method },
        ...(signedIn
          ? { authorizer: { lambda: { userId: 'alex', role: 'user', csrfToken: 'csrf' } } }
          : {}),
      },
    } as never,
    {} as never,
    vi.fn(),
  )) as { statusCode: number; body: string };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.listUserDirectory.mockResolvedValue({ items: [] });
  mocks.createProfilePictureUpload.mockResolvedValue({ uploadUrl: 'signed' });
});
it('allows ordinary signed-in users to read only the public directory route', async () => {
  expect((await invoke('/users/directory')).statusCode).toBe(200);
  expect((await invoke('/admin/users')).statusCode).toBe(403);
  expect((await invoke('/users/directory', 'GET', undefined, false)).statusCode).toBe(401);
});
it('binds profile upload ownership to the session and checks CSRF', async () => {
  const body = { contentType: 'image/png', contentLength: 1024 };
  expect((await invoke('/profile/picture/upload', 'POST', body)).statusCode).toBe(201);
  expect(mocks.createProfilePictureUpload).toHaveBeenCalledWith({ ...body, userId: 'alex' });
  expect(mocks.requireMutationSecurity).toHaveBeenCalledWith(
    'https://gsd.thepandas.link',
    'csrf',
    'csrf',
  );
});
it('rejects attempts to choose another user as the photo owner', async () => {
  expect(
    (
      await invoke('/profile/picture/upload', 'POST', {
        contentType: 'image/png',
        contentLength: 1024,
        userId: 'other',
      })
    ).statusCode,
  ).toBe(400);
  expect(mocks.createProfilePictureUpload).not.toHaveBeenCalled();
});
it('rejects upload writes when CSRF validation fails', async () => {
  mocks.requireMutationSecurity.mockImplementation(() => {
    throw Object.assign(new Error('CSRF invalid'), { statusCode: 403 });
  });
  expect(
    (
      await invoke('/profile/picture/upload', 'POST', {
        contentType: 'image/png',
        contentLength: 1024,
      })
    ).statusCode,
  ).toBe(403);
  expect(mocks.createProfilePictureUpload).not.toHaveBeenCalled();
});
