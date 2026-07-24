import { describe, expect, it } from 'vitest';
import { requireAdminMutation } from '../../src/admin/admin-authorization.js';

describe('category authorization', () => {
  it('allows authenticated category reads but only admins may mutate', () => {
    expect(() => requireAdminMutation({ userId: 'admin', role: 'admin' })).not.toThrow();
    expect(() => requireAdminMutation({ userId: 'user', role: 'user' })).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
