import { describe, expect, it, vi } from 'vitest';
import { createAdminTfaRecoveryHandler } from '../../apps/api/src/admin/admin-tfa-recovery-handler.js';

describe('administrator TFA recovery operator', () => {
  it('is idempotent, auditable, session revoking, and needs no decrypt capability', async () => {
    const recover = vi.fn(async () => ({
      auditId: 'audit-1',
      status: 'recovery_required' as const,
    }));
    const handler = createAdminTfaRecoveryHandler({
      authorizeOperator: vi.fn(async () => true),
      recover,
      findPriorResult: vi.fn(async () => undefined),
    });
    const request = {
      principalArn: 'arn:aws:iam::111122223333:role/recovery',
      username: 'admin',
      reason: 'lost device',
      idempotencyToken: 'idempotency-token-0001',
    };
    await expect(handler(request)).resolves.toMatchObject({ status: 'recovery_required' });
    expect(recover).toHaveBeenCalledWith(
      expect.objectContaining({ revokeSessions: true, removeFactorMaterial: true }),
    );
  });

  it('denies an unauthorized operator without revealing factor state', async () => {
    const handler = createAdminTfaRecoveryHandler({
      authorizeOperator: vi.fn(async () => false),
      recover: vi.fn(),
      findPriorResult: vi.fn(),
    });
    await expect(
      handler({
        principalArn: 'unauthorized',
        username: 'admin',
        reason: 'test',
        idempotencyToken: 'idempotency-token-0002',
      }),
    ).rejects.toThrow(/not authorized/i);
  });
});
