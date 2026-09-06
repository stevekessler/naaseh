import { describe, expect, it } from 'vitest';
import { sanitizeCrisisPlanEvent } from '@naaseh/observability';

describe('Crisis Plan telemetry boundary', () => {
  it('allows bounded operational fields and drops protected values', () => {
    expect(
      sanitizeCrisisPlanEvent({
        correlationId: 'safe',
        operation: 'share',
        outcome: 'denied',
        count: 1,
        html: '<p>plan</p>',
        ciphertext: 'secret',
        wrappedKey: 'secret',
        query: 'alice',
        recipientId: 'user',
        suicidalBehaviors: 'yes',
      }),
    ).toEqual({ correlationId: 'safe', operation: 'share', outcome: 'denied', count: 1 });
  });
});
