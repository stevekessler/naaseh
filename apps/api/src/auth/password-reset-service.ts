import type { StoredUser } from './user-repository.js';

export interface PasswordResetDependencies {
  findUser: (username: string) => Promise<StoredUser | undefined>;
  verifyOrDummyPin: (
    hash: string | undefined,
    pin: string,
    pepperVersion?: string,
  ) => Promise<boolean>;
  hashNewPassword: (
    password: string,
    pepperVersion?: string,
  ) => Promise<{ passwordHash: string; pepperVersion: string }>;
  commitPasswordReset: (change: {
    userId: string;
    passwordHash: string;
    pepperVersion: string;
    expectedVersion: number;
    nextCredentialVersion: number;
    nextSessionEpoch: number;
    retainedTfaStatus: StoredUser['tfaStatus'];
  }) => Promise<void>;
  consumeAttempt: (accountKey: string, sourceKey: string) => Promise<boolean>;
}

export function createPasswordResetService(dependencies: PasswordResetDependencies) {
  return {
    async reset(request: {
      username: string;
      pin: string;
      newPassword: string;
      sourceKey: string;
    }) {
      const accountKey = request.username.trim().toLocaleLowerCase('en-US');
      if (!(await dependencies.consumeAttempt(accountKey, request.sourceKey)))
        return { accepted: true as const };
      const user = await dependencies.findUser(accountKey);
      const pinValid = await dependencies.verifyOrDummyPin(
        user?.pinHash,
        request.pin,
        user?.pinPepperVersion ?? user?.pepperVersion,
      );
      if (!user?.active || !pinValid) return { accepted: true as const };
      const credential = await dependencies.hashNewPassword(
        request.newPassword,
        user.pepperVersion,
      );
      if (!credential.passwordHash || !credential.pepperVersion)
        throw new Error('Password credentials are unavailable.');
      await dependencies.commitPasswordReset({
        userId: user.id,
        ...credential,
        expectedVersion: user.version,
        nextCredentialVersion: user.credentialVersion + 1,
        nextSessionEpoch: user.sessionEpoch + 1,
        retainedTfaStatus: user.tfaStatus,
      });
      return { accepted: true as const };
    },
  };
}
