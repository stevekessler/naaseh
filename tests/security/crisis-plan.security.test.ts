import { describe, expect, it } from 'vitest';
import { sanitizeCrisisPlanEvent } from '@naaseh/observability';
import { assertCiphertextOnlyCrisisPlan } from '../../apps/web/src/db/crisis-plan-repository.js';

describe('Crisis Plan protected-data boundaries', () => {
  it('excludes plaintext, grants, identities, queries, and trigger answers from persistence and telemetry', () => {
    expect(() => assertCiphertextOnlyCrisisPlan({ body: { ciphertext: 'opaque' } })).not.toThrow();
    expect(() => assertCiphertextOnlyCrisisPlan({ document: { blocks: [] } })).toThrow();
    expect(
      sanitizeCrisisPlanEvent({
        operation: 'broker',
        outcome: 'denied',
        html: '<p>private</p>',
        cpk: 'key',
        grant: 'wrap',
        recipientId: 'person',
        query: 'name',
        selfHarmBehaviors: true,
      }),
    ).toEqual({ operation: 'broker', outcome: 'denied' });
  });
});
