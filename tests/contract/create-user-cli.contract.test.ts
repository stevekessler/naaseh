import { describe, expect, it } from 'vitest';
import {
  provisionUserRequestSchema,
  provisionUserResultSchema,
} from '../../apps/api/src/admin/provision-user.js';

describe('create-user command contract', () => {
  it('uses one schema and role vocabulary for IAM and session entry points', () => {
    const request = provisionUserRequestSchema.parse({
      version: 'naaseh.provision-user/v1',
      username: ' Steve ',
      displayName: 'Steve',
      password: 'correct horse battery staple',
      pin: '246810',
      role: 'admin',
      idempotencyToken: 'request-1',
    });
    expect(request.role).toBe('admin');
    expect(() => provisionUserRequestSchema.parse({ ...request, role: 'owner' })).toThrow();
    expect(
      provisionUserResultSchema.parse({
        version: 'naaseh.provision-user-result/v1',
        created: true,
        user: {
          id: '01J00000000000000000000000',
          username: 'steve',
          displayName: 'Steve',
          role: 'admin',
          active: true,
          sessionEpoch: 0,
        },
      }),
    ).not.toHaveProperty('passwordHash');
  });
});
