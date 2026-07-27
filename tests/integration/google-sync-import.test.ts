import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleConnection } from '@naaseh/domain';

const repository = vi.hoisted(() => ({
  findGoogleTaskLinkByRemote: vi.fn(),
  saveGoogleConflict: vi.fn(),
  saveGoogleTaskLink: vi.fn(),
}));
vi.mock('../../apps/api/src/google-sync/repository.js', () => repository);
const tasks = vi.hoisted(() => ({ findTask: vi.fn(), saveTaskMutation: vi.fn() }));
vi.mock('../../apps/api/src/tasks/task-repository.js', () => tasks);
const lifecycle = vi.hoisted(() => ({ changeTaskLifecycle: vi.fn() }));
vi.mock('../../apps/api/src/lifecycle/task-lifecycle-service.js', () => lifecycle);

import { importGoogleTask } from '../../apps/api/src/google-sync/import-service.js';

const now = new Date('2026-07-25T12:00:00.000Z');
const connection = {
  id: '01J00000000000000000000971',
  userId: 'owner',
  state: 'active',
  selectedTaskListId: 'list',
  selectedTaskListTitle: 'Naaseh',
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
} satisfies GoogleConnection;

const remote = {
  id: 'remote',
  title: 'Imported',
  due: '2026-07-25T00:00:00.000Z',
  status: 'needsAction' as const,
  deleted: false,
  hidden: false,
  updated: '2026-07-25T11:59:00.000Z',
};

describe('Google import reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findGoogleTaskLinkByRemote.mockResolvedValue(undefined);
    tasks.saveTaskMutation.mockImplementation(async (task) => ({ task }));
  });

  it('skips undated tasks without creating local work', async () => {
    const result = await importGoogleTask({
      connection,
      remote: { ...remote, due: undefined },
      client: {} as never,
      now,
    });
    expect(result.outcome).toBe('skippedUndated');
    expect(tasks.saveTaskMutation).not.toHaveBeenCalled();
  });

  it('imports one dated task with configured local time and source attribution', async () => {
    const result = await importGoogleTask({ connection, remote, client: {} as never, now });
    expect(result.outcome).toBe('imported');
    const task = tasks.saveTaskMutation.mock.calls[0]?.[0];
    expect(task).toMatchObject({
      ownerId: 'owner',
      label: 'Imported',
      dueAt: '2026-07-25T15:00:00.000Z',
      dueTimeZone: 'America/Denver',
    });
    expect(tasks.saveTaskMutation.mock.calls[0]?.[7]).toBe('google-tasks');
    expect(repository.saveGoogleTaskLink).toHaveBeenCalledOnce();
  });

  it('completes a provider-origin task once through the existing lifecycle service', async () => {
    lifecycle.changeTaskLifecycle.mockImplementation(async (input) => ({
      ...tasks.saveTaskMutation.mock.calls[0]?.[0],
      status: 'completed',
      lifecycle: 'archived',
      completionState: 'completed',
      completedAt: now.toISOString(),
      completedBy: input.actorId,
      version: 2,
    }));
    const result = await importGoogleTask({
      connection,
      remote: { ...remote, status: 'completed', completed: now.toISOString() },
      client: {} as never,
      now,
    });
    expect(result.outcome).toBe('imported');
    expect(lifecycle.changeTaskLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'complete',
        sourceClientId: 'google-tasks',
        mutationId: expect.stringContaining('google-complete:remote:'),
      }),
    );
  });

  it('archives rather than deletes local work after remote deletion', async () => {
    const link = {
      connectionId: connection.id,
      userId: 'owner',
      naasehTaskId: '01J00000000000000000000972',
      googleTaskId: 'remote',
      googleTaskListId: 'list',
      origin: 'google',
      base: { title: 'Imported', dueDate: '2026-07-25', status: 'open' },
      localVersion: 1,
      state: 'linked',
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } as const;
    repository.findGoogleTaskLinkByRemote.mockResolvedValue(link);
    tasks.findTask.mockResolvedValue({
      id: link.naasehTaskId,
      ownerId: 'owner',
      lifecycle: 'active',
      version: 1,
    });
    lifecycle.changeTaskLifecycle.mockResolvedValue({});
    const result = await importGoogleTask({
      connection,
      remote: { ...remote, deleted: true },
      client: {} as never,
      now,
    });
    expect(result.outcome).toBe('remoteDeleted');
    expect(lifecycle.changeTaskLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'archive' }),
    );
    expect(repository.saveGoogleTaskLink).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'remoteDeleted' }),
      1,
    );
  });
});
