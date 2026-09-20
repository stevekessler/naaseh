import { beforeEach, describe, expect, it, vi } from 'vitest';

const logging = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock('@naaseh/observability', () => ({ log: logging.log }));

import {
  recordSyncMutationOutcome,
  syncMutationDiagnosticFields,
} from '../../src/sync/sync-telemetry.js';

beforeEach(() => logging.log.mockClear());

describe('sync mutation diagnostics', () => {
  it('logs only allowlisted metadata for a missing project', () => {
    const mutation = {
      id: 'private-mutation-id',
      entityId: 'private-project-id',
      entityType: 'project',
      operation: 'update',
      baseVersion: 2,
      payload: { name: 'Private project', memo: 'Do not log' },
    };
    recordSyncMutationOutcome({
      mutation,
      result: { status: 'conflict', reason: 'version_mismatch' },
      actorRole: 'admin',
      correlationId: 'request-123',
      serverRecordPresent: false,
    });

    expect(logging.log).toHaveBeenCalledWith('sync.mutation_outcome', {
      correlationId: 'request-123',
      entityType: 'project',
      mutationOperation: 'update',
      outcome: 'conflict',
      reason: 'version_mismatch',
      actorRole: 'admin',
      serverRecordPresent: false,
      baseVersion: 2,
    });
    const line = JSON.stringify(logging.log.mock.calls[0]);
    expect(line).not.toContain('Private project');
    expect(line).not.toContain('Do not log');
    expect(line).not.toContain('private-project-id');
    expect(line).not.toContain('private-mutation-id');
  });

  it('sanitizes untrusted mutation and result fields before logging', () => {
    expect(
      syncMutationDiagnosticFields({
        mutation: {
          entityType: 'secret project title',
          operation: 'secret action',
          baseVersion: -1,
        },
        result: {
          status: 'rejected',
          reason: 'secret failure detail',
          currentVersion: Number.NaN,
        },
        actorRole: 'user',
        correlationId: 'request-456',
      }),
    ).toEqual({
      correlationId: 'request-456',
      entityType: 'unknown',
      mutationOperation: 'unknown',
      outcome: 'rejected',
      reason: 'unknown',
      actorRole: 'user',
    });
  });

  it('includes a known server version without exposing the server record', () => {
    expect(
      syncMutationDiagnosticFields({
        mutation: { entityType: 'category', operation: 'update', baseVersion: 1 },
        result: { status: 'conflict', reason: 'version_mismatch', entityVersion: 3 },
        actorRole: 'admin',
        correlationId: 'request-789',
        serverRecordPresent: true,
      }),
    ).toMatchObject({ serverRecordPresent: true, baseVersion: 1, serverVersion: 3 });
  });
});
