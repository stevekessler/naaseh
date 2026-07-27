import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleConnection, GoogleTaskLink } from '@naaseh/domain';

const client = { deleteTask: vi.fn(), listTaskLists: vi.fn() };
const repository = vi.hoisted(() => ({
  findGoogleConnection: vi.fn(),
  findGoogleConflict: vi.fn(),
  findGoogleTaskLink: vi.fn(),
  listGoogleTaskLinks: vi.fn(),
  saveGoogleConnection: vi.fn(async (value) => value),
  saveGoogleTaskLink: vi.fn(async (value) => value),
  saveGoogleTaskSharing: vi.fn(),
  updateGoogleConflict: vi.fn(),
}));
vi.mock('../../apps/api/src/google-sync/repository.js', () => repository);
vi.mock('../../apps/api/src/google-sync/auth-service.js', () => ({
  googleClientForConnection: vi.fn(async () => client),
  revokeGoogleConnectionToken: vi.fn(async () => undefined),
}));

import {
  disconnectGoogle,
  updateGoogleSettings,
} from '../../apps/api/src/google-sync/control-service.js';

const now = new Date('2026-07-25T12:00:00.000Z');
const connection: GoogleConnection = {
  id: '01J00000000000000000000981',
  userId: 'owner',
  state: 'active',
  selectedTaskListId: 'old-list',
  selectedTaskListTitle: 'Old list',
  encryptedRefreshToken: 'cipher',
  tokenKeyVersion: 'key',
  scope: 'https://www.googleapis.com/auth/tasks',
  defaultLocalTime: '09:00',
  defaultTimeZone: 'America/Denver',
  privateTaskMode: 'exclude',
  syncIntervalMinutes: 5,
  overlapMinutes: 5,
  pendingCount: 0,
  conflictCount: 0,
  quarantineCount: 0,
  skippedUndatedCount: 0,
  version: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const link = (origin: 'naaseh' | 'google', index: number): GoogleTaskLink => ({
  connectionId: connection.id,
  userId: 'owner',
  naasehTaskId: index === 1 ? '01J00000000000000000000991' : '01J00000000000000000000992',
  googleTaskId: `remote-${index}`,
  googleTaskListId: 'old-list',
  origin,
  ...(origin === 'naaseh' ? { marker: 'naaseh:01J00000000000000000000991' } : {}),
  base: { title: 'Task', dueDate: '2026-07-25', status: 'open' },
  localVersion: 1,
  state: 'linked',
  version: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

describe('Google synchronization controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findGoogleConnection.mockResolvedValue(connection);
    repository.listGoogleTaskLinks.mockResolvedValue([link('naaseh', 1), link('google', 2)]);
    client.deleteTask.mockResolvedValue(undefined);
    client.listTaskLists.mockResolvedValue([{ id: 'new-list', title: 'New list' }]);
  });

  it('disconnect cleanup deletes only Naaseh-origin remote tasks and retains local mappings as retired', async () => {
    const result = await disconnectGoogle({
      userId: 'owner',
      expectedVersion: 1,
      cleanup: 'deleteNaasehOrigin',
      now,
    });
    expect(client.deleteTask).toHaveBeenCalledOnce();
    expect(client.deleteTask).toHaveBeenCalledWith('old-list', 'remote-1');
    expect(repository.saveGoogleTaskLink).toHaveBeenCalledTimes(2);
    expect(result.state).toBe('disconnected');
    expect(result.encryptedRefreshToken).toBeUndefined();
  });

  it('pauses without provider deletion and retires old mappings on a list move', async () => {
    const paused = await updateGoogleSettings({
      userId: 'owner',
      expectedVersion: 1,
      state: 'paused',
      now,
    });
    expect(paused.state).toBe('paused');
    expect(client.deleteTask).not.toHaveBeenCalled();

    await updateGoogleSettings({
      userId: 'owner',
      expectedVersion: 1,
      selectedTaskListId: 'new-list',
      selectedTaskListTitle: 'New list',
      listChangeMode: 'leavePrevious',
      now,
    });
    expect(client.deleteTask).not.toHaveBeenCalled();
    expect(repository.saveGoogleTaskLink).toHaveBeenCalledTimes(2);
  });
});
