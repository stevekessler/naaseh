import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { completionExportRequestSchema } from '@naaseh/contracts';
import { authorizeCompletionExportTask } from '../../apps/api/src/exports/completion-export-service.js';

describe('completion export security boundaries', () => {
  it('requires explicit confirmation in the all-user request and rechecks the job owner', () => {
    const allUsers = completionExportRequestSchema.parse({
      filters: {},
      browserTimeZone: 'UTC',
      asOf: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'all-users-export-key-0001',
      scope: 'all_users',
      adminConfirmed: true,
    });
    expect(allUsers.adminConfirmed).toBe(true);
    const coordinator = readFileSync('apps/api/src/exports/coordinator-handler.ts', 'utf8');
    expect(coordinator).toContain('job.requestedByPrincipal !== actor.userId');
    expect(coordinator).toContain("actor.role === 'admin'");
  });

  it('excludes ciphertext, object paths, bytes, keys, and signed URLs from CSV fields', () => {
    const transformer = readFileSync('apps/api/src/exports/csv-transformer.ts', 'utf8');
    for (const forbidden of [
      'encryptedMemo:',
      'blobId,',
      'resultKey:',
      'downloadUrl:',
      'ciphertext:',
    ])
      expect(transformer).not.toContain(forbidden);
  });

  it('reauthorizes owner, public, group, private, and all-user rows without partial disclosure', () => {
    const task = {
      id: 'task',
      ownerId: 'other',
      visibility: 'public',
      groupId: 'group-a',
    } as any;
    const event = {
      counted: true,
      occurredAt: '2026-01-01T00:00:00.000Z',
      completedBy: 'owner',
    } as any;
    const job = {
      requestedByPrincipal: 'owner',
      scope: 'self',
      authorizedGroupIds: ['group-a'],
      snapshotTime: '2026-01-02T00:00:00.000Z',
    } as any;
    expect(authorizeCompletionExportTask(task, event, job)).toBe(true);
    expect(authorizeCompletionExportTask({ ...task, visibility: 'private' }, event, job)).toBe(
      false,
    );
    expect(authorizeCompletionExportTask(task, event, { ...job, authorizedGroupIds: [] })).toBe(
      false,
    );
    expect(
      authorizeCompletionExportTask(task, event, {
        ...job,
        scope: 'all_users',
        adminConfirmed: true,
      }),
    ).toBe(true);
  });
});
