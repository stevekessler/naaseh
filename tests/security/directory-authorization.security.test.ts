import { describe, expect, it } from 'vitest';
import { hasAuthorizedDirectorySession } from '../../apps/api/src/directory/handlers.js';

describe('global directory authorization', () => {
  it('preserves access for every currently authorized active-user session', () => {
    expect(hasAuthorizedDirectorySession({ userId: 'ordinary-user', sessionEpoch: 0 })).toBe(true);
    expect(hasAuthorizedDirectorySession({ userId: 'admin-user', sessionEpoch: 8 })).toBe(true);
  });

  it('denies missing, stale legacy, and revoked authorizer contexts', () => {
    expect(hasAuthorizedDirectorySession(undefined)).toBe(false);
    expect(hasAuthorizedDirectorySession({ userId: 'user' })).toBe(false);
    expect(hasAuthorizedDirectorySession({ userId: '', sessionEpoch: 3 })).toBe(false);
    expect(hasAuthorizedDirectorySession({ isAuthorized: false })).toBe(false);
  });
});
