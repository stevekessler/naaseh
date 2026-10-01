import { describe, expect, it } from 'vitest';
import { nextRetryDelay } from '@naaseh/domain';
import {
  classifyMutationResults,
  syncHttpError,
  syncHttpResponseError,
} from '../../apps/web/src/sync/sync-engine.js';
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
  it('shows safe server detail and a support reference for failed requests', async () => {
    const error = await syncHttpResponseError(
      'Synchronization push',
      new Response(
        JSON.stringify({
          message: 'A required service could not complete the request.',
          correlationId: 'request-123',
        }),
        { status: 502, headers: { 'content-type': 'application/problem+json' } },
      ),
    );

    expect(error.message).toContain('A required service could not complete the request.');
    expect(error.message).toContain('Reference: request-123.');
    expect(error.message).toContain('Pending changes remain safely stored.');
  });
});
