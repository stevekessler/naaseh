import { describe, expect, it } from 'vitest';
import { nextRetryDelay } from '@naaseh/domain';
import { classifyMutationResults, syncHttpError } from '../../apps/web/src/sync/sync-engine.js';
describe('interrupted synchronization outcomes', () => {
  it('removes duplicate/applied results while preserving retries and surfacing conflicts', () => {
    expect(
      classifyMutationResults([
        { mutationId: 'a', status: 'applied' },
        { mutationId: 'b', status: 'alreadyApplied' },
        { mutationId: 'c', status: 'conflict' },
        { mutationId: 'd', status: 'retry' },
      ]),
    ).toEqual({ completed: ['a', 'b'], conflicts: ['c'], remaining: ['d'] });
  });
  it('keeps pending work on partial/409 failure with bounded retry', () => {
    expect(syncHttpError('Synchronization push', 409).message).toContain('remain safely stored');
    expect(nextRetryDelay(100, () => 1)).toBe(30000);
  });
});
