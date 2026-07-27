import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, type GoogleConnection } from '@naaseh/domain';

const repository = vi.hoisted(() => ({
  findGoogleTaskSharing: vi.fn(),
  findGoogleTaskLink: vi.fn(),
  saveGoogleTaskLink: vi.fn(),
}));
vi.mock('../../apps/api/src/google-sync/repository.js', () => repository);

const store = vi.hoisted(() => ({ listOwnerTasks: vi.fn() }));
vi.mock('../../apps/api/src/shared/store.js', () => store);

import {
  isGoogleTaskEligible,
  publishGoogleTask,
} from '../../apps/api/src/google-sync/publish-service.js';
import {
  localDateForTask,
  replaceTaskDueDate,
} from '../../apps/api/src/google-sync/merge-service.js';

const now = new Date('2026-07-25T12:00:00.000Z');
const connection = {
  id: '01J00000000000000000000981',
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

describe('Google publication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes only owner, dated, unassigned, unshared, consented work', async () => {
    const publicTask = createTask(
      { label: 'Public', dueAt: '2026-07-25T15:00:00.000Z', dueTimeZone: 'America/Denver' },
      'owner',
      now,
    );
    await expect(isGoogleTaskEligible(publicTask, connection)).resolves.toBe(true);
    await expect(
      isGoogleTaskEligible({ ...publicTask, groupId: 'group' }, connection),
    ).resolves.toBe(false);
    await expect(
      isGoogleTaskEligible({ ...publicTask, ownerId: 'other' }, connection),
    ).resolves.toBe(false);
    repository.findGoogleTaskSharing.mockResolvedValue(undefined);
    await expect(
      isGoogleTaskEligible({ ...publicTask, visibility: 'private' }, connection),
    ).resolves.toBe(false);
    repository.findGoogleTaskSharing.mockResolvedValue({ approved: true });
    await expect(
      isGoogleTaskEligible({ ...publicTask, visibility: 'private' }, connection),
    ).resolves.toBe(true);
  });

  it('preserves a local wall-clock time when Google changes only the date', () => {
    const changed = replaceTaskDueDate(
      { dueAt: '2026-07-25T15:30:00.000Z', dueTimeZone: 'America/Denver' },
      '2026-07-27',
      '09:00',
      'America/Denver',
    );
    expect(localDateForTask(changed)).toBe('2026-07-27');
    expect(changed.dueAt).toBe('2026-07-27T15:30:00.000Z');
  });

  it('recovers a lost insert response by exact marker without creating a duplicate', async () => {
    const task = createTask(
      { label: 'Once', dueAt: '2026-07-25T15:00:00.000Z', dueTimeZone: 'America/Denver' },
      'owner',
      now,
    );
    repository.findGoogleTaskLink.mockResolvedValue(undefined);
    const remote = {
      id: 'remote',
      title: 'Once',
      due: '2026-07-25T00:00:00.000Z',
      status: 'needsAction' as const,
      deleted: false,
      hidden: false,
      notes: `naaseh:${task.id}`,
    };
    const client = {
      findMarker: vi.fn().mockResolvedValue(remote),
      createTask: vi.fn(),
    };
    const result = await publishGoogleTask({ connection, task, client: client as never, now });
    expect(result.outcome).toBe('recovered');
    expect(client.createTask).not.toHaveBeenCalled();
    expect(repository.saveGoogleTaskLink).toHaveBeenCalledOnce();
  });
});
