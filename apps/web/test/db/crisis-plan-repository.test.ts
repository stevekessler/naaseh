import { describe, expect, it } from 'vitest';
import { assertCiphertextOnlyCrisisPlan } from '../../src/db/crisis-plan-repository.js';

describe('local Crisis Plan repository boundary', () => {
  it('allows opaque owner records while rejecting plan plaintext and recipient display data', () => {
    expect(() =>
      assertCiphertextOnlyCrisisPlan({
        body: { ciphertext: 'opaque', iv: 'opaque' },
        ownerWrap: { ciphertext: 'opaque' },
      }),
    ).not.toThrow();
    expect(() => assertCiphertextOnlyCrisisPlan({ html: '<p>private</p>' })).toThrow('plaintext');
    expect(() =>
      assertCiphertextOnlyCrisisPlan({ recipientDisplayName: 'Trusted Person' }),
    ).toThrow('plaintext');
  });
});
