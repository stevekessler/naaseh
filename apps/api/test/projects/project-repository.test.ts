import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../src/shared/dynamodb.js', () => ({
  dynamodb: { send: mocks.send },
  tableName: 'test-table',
}));

const { listProjects } = await import('../../src/projects/project-repository.js');

beforeEach(() => vi.clearAllMocks());

describe('project repository listing', () => {
  it('reads every scan page so bootstrap cannot omit later projects', async () => {
    mocks.send
      .mockResolvedValueOnce({
        Items: [{ data: { id: 'project-a', name: 'First' } }],
        LastEvaluatedKey: { PK: 'continue', SK: 'here' },
      })
      .mockResolvedValueOnce({ Items: [{ data: { id: 'project-b', name: 'Bills' } }] });

    await expect(listProjects()).resolves.toEqual([
      { id: 'project-a', name: 'First' },
      { id: 'project-b', name: 'Bills' },
    ]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({
      PK: 'continue',
      SK: 'here',
    });
  });

  it('reads every category query page', async () => {
    mocks.send
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { GSI1PK: 'next' } })
      .mockResolvedValueOnce({ Items: [{ data: { id: 'project-b', name: 'Bills' } }] });

    await expect(listProjects('category-a')).resolves.toEqual([{ id: 'project-b', name: 'Bills' }]);
    expect(mocks.send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({ GSI1PK: 'next' });
  });
});
