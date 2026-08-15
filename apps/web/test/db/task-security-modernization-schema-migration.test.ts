import { describe, expect, it, vi } from 'vitest';
import {
  currentSchemaVersion,
  planEnhancedSchemaMigration,
  preservedEncryptedStores,
  runResumableSchemaMigrations,
  type SchemaMigrationCheckpoint,
} from '../../src/db/schema.js';
import { runTaskSecurityBrowserMigrations } from '../../src/db/feature-migration-registry.js';

describe('Dexie schema version 11 migration scaffold', () => {
  it('keeps the foundation scaffold separate while story migrations preserve protected state', () => {
    expect(currentSchemaVersion).toBe(11);
    expect(planEnhancedSchemaMigration(10)).toMatchObject({
      from: 10,
      to: 11,
      preserveOutbox: true,
      storesToAdd: ['secureTaskTimers', 'secureTimerCheckpoints'],
    });
    expect(preservedEncryptedStores).toEqual(
      expect.arrayContaining(['settings', 'cryptoKeys', 'outbox', 'secureConflicts']),
    );
    expect(planEnhancedSchemaMigration(11).storesToAdd).toEqual([]);
  });

  it('checkpoints completed steps and resumes after interruption without replay', async () => {
    let checkpoint: SchemaMigrationCheckpoint = { version: 10, completedStepIds: [] };
    const preserve = vi.fn(async () => undefined);
    const interrupted = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('interrupted'))
      .mockResolvedValue(undefined);
    const saveCheckpoint = vi.fn(async (next: SchemaMigrationCheckpoint) => {
      checkpoint = next;
    });
    const steps = [
      { id: 'preserve-existing-state', from: 10, to: 10, run: preserve },
      { id: 'finish-v11-upgrade', from: 10, to: 11, run: interrupted },
    ];

    await expect(
      runResumableSchemaMigrations({ checkpoint, steps, saveCheckpoint }),
    ).rejects.toThrow('interrupted');
    expect(checkpoint.completedStepIds).toEqual(['preserve-existing-state']);

    await runResumableSchemaMigrations({ checkpoint, steps, saveCheckpoint });
    expect(preserve).toHaveBeenCalledTimes(1);
    expect(interrupted).toHaveBeenCalledTimes(2);
    expect(checkpoint).toEqual({
      version: 11,
      completedStepIds: ['preserve-existing-state', 'finish-v11-upgrade'],
    });
  });

  it('registers the v11 browser scaffold without a story-owned migration', async () => {
    const initializeScaffold = vi.fn(async () => undefined);
    const checkpoints: SchemaMigrationCheckpoint[] = [];
    const result = await runTaskSecurityBrowserMigrations({
      checkpoint: { version: 10, completedStepIds: [] },
      initializeScaffold,
      saveCheckpoint: async (checkpoint) => checkpoints.push(checkpoint),
    });
    expect(initializeScaffold).toHaveBeenCalledOnce();
    expect(result.version).toBe(11);
    expect(checkpoints.at(-1)?.version).toBe(11);
  });
});
