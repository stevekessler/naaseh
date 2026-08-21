import { describe, expect, it } from 'vitest';
import {
  featureMigrationStatusSchema,
  pushRequestSchema,
  syncCompatibilityProblemSchema,
  syncVersionNegotiationRequestSchema,
  syncVersionNegotiationResultSchema,
} from '../../packages/contracts/src/openapi.js';
import {
  currentSyncContractVersion,
  supportedSyncContractVersionSchema,
} from '../../packages/domain/src/sync.js';

describe('feature 009 version negotiation contract', () => {
  it('accepts sync v5 while retaining compatibility reads', () => {
    expect(currentSyncContractVersion).toBe(5);
    expect(supportedSyncContractVersionSchema.parse(5)).toBe(5);
    expect(
      pushRequestSchema.safeParse({
        contractVersion: 5,
        mutations: [
          {
            id: '01J00000000000000000000000',
            entityId: '01J00000000000000000000001',
            entityType: 'task',
            operation: 'update',
            baseVersion: 1,
            payload: {},
            createdAt: '2026-08-14T18:00:00.000Z',
            attempts: 0,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('reports bounded supported versions and migration progress', () => {
    expect(syncVersionNegotiationRequestSchema.parse({ contractVersion: 5 })).toEqual({
      contractVersion: 5,
    });
    expect(
      syncVersionNegotiationResultSchema.parse({
        accepted: true,
        requestedVersion: 5,
        minimumSupportedVersion: 4,
        currentVersion: 5,
        migration: { version: 11, status: 'ready' },
      }),
    ).toMatchObject({ accepted: true, migration: { version: 11, status: 'ready' } });
    expect(
      featureMigrationStatusSchema.safeParse({ version: 11, status: 'ready', secret: 'no' })
        .success,
    ).toBe(false);
  });

  it('returns a stable compatibility problem without story payloads', () => {
    expect(
      syncCompatibilityProblemSchema.parse({
        type: 'https://naaseh.example/problems/sync-version',
        reason: 'client_version_newer',
        requestedVersion: 99,
        minimumSupportedVersion: 4,
        currentVersion: 5,
        retryable: false,
      }),
    ).toEqual(expect.objectContaining({ reason: 'client_version_newer', requestedVersion: 99 }));
  });
});
