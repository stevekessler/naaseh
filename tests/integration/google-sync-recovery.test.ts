import { describe, expect, it } from 'vitest';
import { googleSyncOperationSchema } from '@naaseh/domain';
import {
  googleCheckpointStalled,
  googleRetryDelayMs,
} from '../../apps/api/src/google-sync/run-service.js';

describe('Google synchronization recovery', () => {
  it('uses capped exponential delay with bounded jitter', () => {
    expect(googleRetryDelayMs(1, 0)).toBe(2_000);
    expect(googleRetryDelayMs(20, 0.999)).toBe(900_999);
  });

  it('detects checkpoint stalls without exposing provider content', () => {
    const now = new Date('2026-07-25T12:15:01.000Z');
    expect(googleCheckpointStalled('2026-07-25T12:00:00.000Z', now)).toBe(true);
    expect(googleCheckpointStalled('2026-07-25T12:10:00.000Z', now)).toBe(false);
  });

  it('requires durable provider identity before accepting an inbound quarantine record', () => {
    const base = {
      id: 'remote:operation',
      connectionId: '01J00000000000000000000981',
      userId: 'owner',
      direction: 'fromGoogle' as const,
      type: 'update' as const,
      state: 'quarantined' as const,
      attemptCount: 1,
      correlationId: 'safe',
      createdAt: '2026-07-25T12:00:00.000Z',
      updatedAt: '2026-07-25T12:00:00.000Z',
    };
    expect(googleSyncOperationSchema.safeParse(base).success).toBe(false);
    expect(googleSyncOperationSchema.safeParse({ ...base, googleTaskId: 'remote' }).success).toBe(
      true,
    );
  });
});
