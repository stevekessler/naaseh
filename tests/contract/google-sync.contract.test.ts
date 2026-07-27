import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  googleConflictResolutionSchema,
  googleDisconnectRequestSchema,
  googleSyncSettingsPatchSchema,
} from '@naaseh/contracts';

describe('Google synchronization HTTP contract', () => {
  const contract = readFileSync(
    new URL(
      '../../specs/004-google-tasks-sync/contracts/google-tasks-sync.openapi.yaml',
      import.meta.url,
    ),
    'utf8',
  );

  it('defines the complete owner connection, run, conflict, sharing, and disconnect surface', () => {
    for (const path of [
      '/api/v1/integrations/google/status:',
      '/api/v1/integrations/google/connect:',
      '/api/v1/integrations/google/callback:',
      '/api/v1/integrations/google/task-lists:',
      '/api/v1/integrations/google/preview:',
      '/api/v1/integrations/google/settings:',
      '/api/v1/integrations/google/sync:',
      '/api/v1/integrations/google/conflicts:',
      '/api/v1/integrations/google/conflicts/{conflictId}:',
      '/api/v1/tasks/{taskId}/google-sharing:',
      '/api/v1/integrations/google/disconnect-preview:',
      '/api/v1/integrations/google/disconnect:',
    ])
      expect(contract).toContain(path);
    expect(contract).toContain('csrf-header: X-CSRF-Token');
    expect(contract).toContain('optimistic-concurrency: expectedVersion');
  });

  it('rejects unsafe settings, ambiguous edited conflicts, and destructive disconnect inputs', () => {
    expect(
      googleSyncSettingsPatchSchema.safeParse({
        selectedTaskListId: 'list',
        expectedVersion: 1,
        mutationId: 'm',
        ownerId: 'attacker',
      }).success,
    ).toBe(false);
    expect(
      googleConflictResolutionSchema.safeParse({
        source: 'edited',
        expectedVersion: 1,
        mutationId: 'm',
      }).success,
    ).toBe(false);
    expect(
      googleDisconnectRequestSchema.safeParse({
        cleanup: 'deleteEverything',
        expectedVersion: 1,
        mutationId: 'm',
      }).success,
    ).toBe(false);
  });
});
