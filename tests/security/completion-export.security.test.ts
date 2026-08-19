import { describe, expect, it } from 'vitest';
import { completionExportRequestSchema } from '@naaseh/contracts';
import {
  authorizeCompletionExportTask,
  completionExportReadAccess,
} from '../../apps/api/src/exports/completion-export-service.js';
import { transformCompletedTasksToCsv } from '../../apps/api/src/exports/csv-transformer.js';
import { publicCompletionExportJob } from '../../apps/api/src/exports/export-service.js';

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
    const job = {
      requestedByPrincipal: 'owner',
      exportKind: 'completed_tasks',
      scope: 'self',
      authorizedGroupIds: ['group-a'],
    } as any;
    expect(completionExportReadAccess(job, 'other', ['group-a'])).toBe('not_found');
    expect(completionExportReadAccess(job, 'owner', [])).toBe('authorization_changed');
    expect(completionExportReadAccess(job, 'owner', ['group-a'])).toBe('allowed');
  });

  it('excludes ciphertext, object paths, bytes, keys, and signed URLs from CSV fields', () => {
    const csv = transformCompletedTasksToCsv(
      [
        {
          id: 'task',
          ownerId: 'owner',
          label: 'Completed task',
          memo: '',
          memoHidden: true,
          encryptedMemo: 'ciphertext-secret',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          status: 'completed',
          visibility: 'public',
          urgency: 'normal',
          version: 1,
        } as any,
      ],
      new Map([
        [
          'task',
          [
            {
              id: 'attachment',
              originalFilename: 'safe.pdf',
              mediaType: 'application/pdf',
              sizeBytes: 10,
              status: 'available',
              blobId: 'private-object-key',
            } as any,
          ],
        ],
      ]),
      { asOf: '2026-01-02T00:00:00.000Z' },
    );
    expect(csv).not.toContain('ciphertext-secret');
    expect(csv).not.toContain('private-object-key');

    const publicJob = publicCompletionExportJob(
      {
        id: '01J00000000000000000000000',
        requestedByPrincipal: 'owner',
        exportKind: 'completed_tasks',
        status: 'ready',
        snapshotTime: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        resultKey: 'private/result.csv',
        stagingPrefix: 'private/staging/',
      } as any,
      'https://signed.example/download',
    );
    expect(publicJob).not.toHaveProperty('resultKey');
    expect(publicJob).not.toHaveProperty('stagingPrefix');
    expect(publicJob.downloadUrl).toBe('https://signed.example/download');
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
