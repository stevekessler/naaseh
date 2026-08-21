import { describe, expect, it, vi } from 'vitest';
import {
  defineFeatureVersion,
  negotiateFeatureVersion,
  planFeatureMigrations,
  runFeatureMigrations,
  type FeatureMigrationCheckpoint,
} from './feature-version.js';

const feature = () =>
  defineFeatureVersion({
    feature: 'task-security-modernization',
    minimumVersion: 1,
    currentVersion: 3,
    migrations: [
      { id: 'add-version-envelope', from: 1, to: 2 },
      { id: 'add-resume-checkpoint', from: 2, to: 3 },
    ],
  });

describe('feature version registry', () => {
  it('negotiates supported versions and fails closed for unknown versions', () => {
    expect(negotiateFeatureVersion(feature(), 2)).toEqual({
      accepted: true,
      requestedVersion: 2,
      currentVersion: 3,
      migrationRequired: true,
    });
    expect(negotiateFeatureVersion(feature(), 4)).toEqual({
      accepted: false,
      requestedVersion: 4,
      currentVersion: 3,
      reason: 'client_version_newer',
    });
    expect(negotiateFeatureVersion(feature(), 0).accepted).toBe(false);
  });

  it('requires a contiguous, strictly ordered migration path', () => {
    expect(planFeatureMigrations(feature(), 1).map(({ id }) => id)).toEqual([
      'add-version-envelope',
      'add-resume-checkpoint',
    ]);
    expect(() =>
      defineFeatureVersion({
        feature: 'broken',
        minimumVersion: 1,
        currentVersion: 3,
        migrations: [{ id: 'gap', from: 1, to: 3 }],
      }),
    ).toThrow(/contiguous/i);
  });

  it('persists checkpoints after each step and resumes idempotently', async () => {
    let checkpoint: FeatureMigrationCheckpoint = { version: 1, completedStepIds: [] };
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    const saveCheckpoint = vi.fn(async (next: FeatureMigrationCheckpoint) => {
      checkpoint = next;
    });

    await runFeatureMigrations({
      registration: feature(),
      checkpoint,
      handlers: {
        'add-version-envelope': first,
        'add-resume-checkpoint': second,
      },
      saveCheckpoint,
    });
    await runFeatureMigrations({
      registration: feature(),
      checkpoint,
      handlers: {
        'add-version-envelope': first,
        'add-resume-checkpoint': second,
      },
      saveCheckpoint,
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(checkpoint).toEqual({
      version: 3,
      completedStepIds: ['add-version-envelope', 'add-resume-checkpoint'],
    });
  });
});
