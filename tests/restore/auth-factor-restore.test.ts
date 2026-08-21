import { describe, expect, it, vi } from 'vitest';
import { recoverAuthenticationAfterRestore } from '../../apps/api/src/crypto-recovery/auth-restore-handler.js';

describe('authentication recovery after restore', () => {
  it('advances every epoch and requires administrator factor recovery before access', async () => {
    const updateUser = vi.fn(async () => undefined);
    const invalidateLoginTransactions = vi.fn(async () => undefined);
    const result = await recoverAuthenticationAfterRestore({
      users: [
        { id: 'user', role: 'user', sessionEpoch: 2 },
        { id: 'admin', role: 'admin', sessionEpoch: 7 },
      ],
      updateUser,
      invalidateLoginTransactions,
    });
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin', sessionEpoch: 8, tfaStatus: 'recovery_required' }),
    );
    expect(invalidateLoginTransactions).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ usersUpdated: 2, administratorsRecoveryRequired: 1 });
  });
});
