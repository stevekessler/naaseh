import { describe, expect, it } from 'vitest';
import {
  assertFeatureMigrationReady,
  handler,
  taskSecurityServerMigration,
} from '../../src/migrations/feature-migration-registry.js';

describe('server feature migration deployment gate', () => {
  const ready = {
    feature: 'task-security-modernization-server',
    version: 1,
    status: 'ready',
    completedStepIds: [],
  } as const;

  it('accepts only the registered current version in ready state', async () => {
    expect(taskSecurityServerMigration.currentVersion).toBe(1);
    expect(assertFeatureMigrationReady(ready)).toEqual(ready);
    await expect(handler(ready)).resolves.toEqual({
      feature: ready.feature,
      version: 1,
      status: 'ready',
      completedStepCount: 0,
    });
  });

  it.each([
    { ...ready, status: 'running' },
    { ...ready, version: 2 },
    { ...ready, feature: 'unknown' },
    { ...ready, completedStepIds: ['safe'], extra: 'protected-data' },
  ])('fails closed for an invalid or unbounded status', (status) => {
    expect(() => assertFeatureMigrationReady(status)).toThrow();
  });
});
