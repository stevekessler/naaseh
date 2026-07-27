import { describe, expect, it } from 'vitest';
import {
  googleConnectionSchema,
  googleSyncConflictSchema,
  googleTaskLinkSchema,
} from '../src/index.js';

const now = '2026-07-25T12:00:00.000Z';
const connection = {
  id: '01J00000000000000000000991',
  userId: 'owner',
  state: 'active',
  selectedTaskListId: 'list',
  selectedTaskListTitle: 'Naaseh',
  encryptedRefreshToken: 'ciphertext',
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
  createdAt: now,
  updatedAt: now,
} as const;

describe('Google synchronization domain', () => {
  it('requires encrypted credentials and a list for active connections', () => {
    expect(googleConnectionSchema.parse(connection).state).toBe('active');
    expect(
      googleConnectionSchema.safeParse({
        ...connection,
        selectedTaskListId: undefined,
        encryptedRefreshToken: undefined,
      }).success,
    ).toBe(false);
  });

  it('allows preview before list selection but still requires encrypted offline access', () => {
    expect(
      googleConnectionSchema.safeParse({
        ...connection,
        state: 'preview',
        selectedTaskListId: undefined,
      }).success,
    ).toBe(true);
    expect(
      googleConnectionSchema.safeParse({
        ...connection,
        state: 'preview',
        selectedTaskListId: undefined,
        encryptedRefreshToken: undefined,
      }).success,
    ).toBe(false);
  });

  it('binds content-free markers only to Naaseh-origin links', () => {
    const link = {
      connectionId: connection.id,
      userId: 'owner',
      naasehTaskId: '01J00000000000000000000992',
      googleTaskId: 'remote',
      googleTaskListId: 'list',
      origin: 'naaseh',
      marker: 'naaseh:01J00000000000000000000992',
      base: { title: 'Task', dueDate: '2026-07-25', status: 'open' },
      localVersion: 1,
      state: 'linked',
      version: 1,
      createdAt: now,
      updatedAt: now,
    } as const;
    expect(googleTaskLinkSchema.parse(link).marker).toBe(link.marker);
    expect(googleTaskLinkSchema.safeParse({ ...link, marker: 'naaseh:wrong' }).success).toBe(false);
    expect(googleTaskLinkSchema.safeParse({ ...link, origin: 'google' }).success).toBe(false);
  });

  it('keeps conflict candidate values owner-scoped and versioned', () => {
    expect(
      googleSyncConflictSchema.parse({
        id: '01J00000000000000000000993',
        connectionId: connection.id,
        userId: 'owner',
        taskId: '01J00000000000000000000992',
        field: 'title',
        baseValue: 'A',
        localValue: 'B',
        remoteValue: 'C',
        detectedLocalVersion: 2,
        detectedLinkVersion: 1,
        state: 'open',
        version: 1,
        createdAt: now,
        updatedAt: now,
      }).state,
    ).toBe('open');
  });
});
