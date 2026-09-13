import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  createProfilePictureReadUrl: vi.fn(),
  createProfilePictureUpload: vi.fn(),
  listUserDirectory: vi.fn(),
  requireMutationSecurity: vi.fn(),
}));
vi.mock('../../src/shared/dynamodb.js', () => ({
  dynamodb: { send: mocks.send },
  tableName: 'test',
}));
vi.mock('../../src/admin/profile-picture.js', () => mocks);
const { listUserDirectory } = await import('../../src/admin/user-directory.js');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createProfilePictureReadUrl.mockResolvedValue('https://media.test/signed');
});
it('paginates safe directory identities, excludes inactive/smoke users, and exposes no credentials', async () => {
  mocks.send
    .mockResolvedValueOnce({
      Items: [
        {
          data: {
            id: 'a',
            displayName: 'Alex',
            username: 'alex',
            active: true,
            passwordHash: 'secret',
            pictureKey: 'processed',
          },
        },
        { data: { id: 'b', active: false } },
        { data: { active: true, username: 'naaseh-smoke' } },
      ],
      LastEvaluatedKey: { PK: 'next' },
    })
    .mockResolvedValueOnce({
      Items: [{ data: { id: 'c', displayName: 'Chris', username: 'chris', active: true } }],
    });
  expect(await listUserDirectory()).toEqual({
    items: [
      { id: 'a', displayName: 'Alex', username: 'alex', pictureUrl: 'https://media.test/signed' },
      { id: 'c', displayName: 'Chris', username: 'chris' },
    ],
  });
  expect(mocks.send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({ PK: 'next' });
  expect(mocks.send.mock.calls[0]![0].input.ProjectionExpression).not.toContain('password');
});
