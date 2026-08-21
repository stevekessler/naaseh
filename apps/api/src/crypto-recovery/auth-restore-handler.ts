export async function recoverAuthenticationAfterRestore(options: {
  users: ReadonlyArray<{ id: string; role: 'admin' | 'user'; sessionEpoch: number }>;
  updateUser: (change: {
    id: string;
    sessionEpoch: number;
    tfaStatus?: 'recovery_required';
  }) => Promise<void>;
  invalidateLoginTransactions: (userId: string) => Promise<void>;
}) {
  let administratorsRecoveryRequired = 0;
  for (const user of options.users) {
    const administrator = user.role === 'admin';
    await options.updateUser({
      id: user.id,
      sessionEpoch: user.sessionEpoch + 1,
      ...(administrator ? { tfaStatus: 'recovery_required' as const } : {}),
    });
    await options.invalidateLoginTransactions(user.id);
    if (administrator) administratorsRecoveryRequired += 1;
  }
  return { usersUpdated: options.users.length, administratorsRecoveryRequired };
}
