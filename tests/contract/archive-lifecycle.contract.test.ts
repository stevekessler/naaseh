import { describe, expect, it } from 'vitest';
import { validateLifecyclePreconditions } from '../../apps/api/src/lifecycle/handlers.js';

describe('archive lifecycle contract', () => {
  it('requires an optimistic version and idempotency key', () => {
    expect(() => validateLifecyclePreconditions({})).toThrow('If-Match');
    expect(() => validateLifecyclePreconditions({ 'if-match': '4' })).toThrow('Idempotency-Key');
    expect(
      validateLifecyclePreconditions({
        'if-match': '4',
        'idempotency-key': '01J00000000000000000000000',
      }),
    ).toEqual({ expectedVersion: 4, mutationId: '01J00000000000000000000000' });
  });
});
