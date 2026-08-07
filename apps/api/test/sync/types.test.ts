import { describe, expect, it } from 'vitest';
import { parseSyncMutationResultsEnvelope } from '../../src/sync/types.js';

describe('API synchronization result envelope compatibility', () => {
  it('reads mixed supported result envelopes and returns the v4 shared shape', () => {
    expect(
      parseSyncMutationResultsEnvelope({
        results: [
          { mutationId: 'new', status: 'applied', version: 3, operationId: 'operation' },
          { mutationId: 'old', status: 'duplicate', entityVersion: 2, entity: { id: 'task' } },
        ],
      }),
    ).toEqual({
      results: [
        { mutationId: 'new', status: 'applied', version: 3, operationId: 'operation' },
        { mutationId: 'old', status: 'duplicate', version: 2 },
      ],
    });
  });

  it('rejects unsupported statuses and malformed envelopes', () => {
    expect(() =>
      parseSyncMutationResultsEnvelope({
        results: [{ mutationId: 'bad', status: 'silentlyDiscarded' }],
      }),
    ).toThrow();
    expect(() => parseSyncMutationResultsEnvelope({ mutations: [] })).toThrow();
  });
});
