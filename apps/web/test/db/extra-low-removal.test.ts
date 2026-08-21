import { describe, expect, it, vi } from 'vitest';
import { assertNoExtraLowActiveValues } from '../../src/db/extra-low-removal.js';
import { runResumableSchemaMigrations } from '../../src/db/schema.js';

describe('Extra Low zero-data local upgrade', () => {
  it('aborts before mutation when current, decrypted, or pending state contains Extra Low', async () => {
    const state = Object.freeze({
      secureTasks: Object.freeze([{ id: 'task-1', value: { urgency: 'extra_low' } }]),
      ranks: Object.freeze([{ workId: 'task-1', position: 1 }]),
      outbox: Object.freeze([{ id: 'mutation-1', payload: { urgency: 'low' } }]),
      keys: Object.freeze([{ id: 'device' }]),
      settings: Object.freeze([{ key: 'theme', value: 'system' }]),
      conflicts: Object.freeze([{ id: 'conflict-1' }]),
    });
    const snapshot = structuredClone(state);
    const run = vi.fn(async () => undefined);

    await expect(
      runResumableSchemaMigrations({
        checkpoint: { version: 11, completedStepIds: [] },
        steps: [{ id: 'remove-obsolete-branch', from: 11, to: 11, run }],
        saveCheckpoint: async () => undefined,
        validateBeforeMigration: () => assertNoExtraLowActiveValues(Object.values(state)),
      }),
    ).rejects.toThrow(/blocked/iu);

    expect(run).not.toHaveBeenCalled();
    expect(state).toEqual(snapshot);
  });

  it('preserves every protected store when the inventory is zero', async () => {
    const state = {
      records: [{ urgency: 'low' }],
      ranks: [{ position: 1 }],
      outbox: [{ payload: { urgency: 'critical' } }],
      keys: [{ id: 'device' }],
      settings: [{ key: 'theme' }],
      conflicts: [{ id: 'conflict-1' }],
    };
    const snapshot = structuredClone(state);
    await runResumableSchemaMigrations({
      checkpoint: { version: 11, completedStepIds: [] },
      steps: [{ id: 'remove-obsolete-branch', from: 11, to: 11, run: async () => undefined }],
      saveCheckpoint: async () => undefined,
      validateBeforeMigration: () => assertNoExtraLowActiveValues(Object.values(state)),
    });
    expect(state).toEqual(snapshot);
  });
});
