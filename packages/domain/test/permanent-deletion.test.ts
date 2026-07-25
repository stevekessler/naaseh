import { describe, expect, it } from 'vitest';
import {
  issueConfirmationToken,
  verifyConfirmationToken,
} from '../../../apps/api/src/deletion/confirmation-token.js';

const secret = 'a-secret-long-enough-for-tests';
const claims = {
  actorId: 'owner',
  resourceType: 'task' as const,
  resourceId: '01J00000000000000000000000',
  targetVersion: 3,
  dependencyDigest: 'a'.repeat(64),
  expiresAt: '2026-07-24T12:05:00.000Z',
};

describe('permanent deletion confirmation', () => {
  it('binds actor, resource, version, digest, and expiry', () => {
    const token = issueConfirmationToken(claims, secret);
    expect(
      verifyConfirmationToken(token, claims, secret, new Date('2026-07-24T12:04:00.000Z')),
    ).toMatchObject(claims);
    expect(() => verifyConfirmationToken(token, { ...claims, actorId: 'other' }, secret)).toThrow(
      'does not match',
    );
    expect(() =>
      verifyConfirmationToken(token, claims, secret, new Date('2026-07-24T12:06:00.000Z')),
    ).toThrow('expired');
  });
});
