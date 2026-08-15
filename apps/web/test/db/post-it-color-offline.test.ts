import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import { resolveEntityConflict } from '../../src/sync/conflict-resolution.js';

describe('offline post-it color conflict preservation', () => {
  it('keeps the complete local task color when a version conflict is reapplied', () => {
    const local = { ...createTask({ label: 'Note', postItColor: 'orange' }, 'owner'), version: 2 };
    const remote = { ...local, postItColor: 'blue' as const, version: 3 };
    const reapplied = resolveEntityConflict(
      {
        id: 'conflict',
        entityType: 'task',
        entityId: local.id,
        local,
        remote,
        reason: 'version_mismatch',
        quarantined: false,
        createdAt: new Date().toISOString(),
      },
      'keep-local',
    );
    expect(reapplied.postItColor).toBe('orange');
    expect(reapplied.version).toBe(4);
  });
});
