import type { StoredUser } from './user-repository.js';

export interface PasswordResetDependencies {
  findUser: (username: string) => Promise<StoredUser | undefined>;
  verifyOrDummyPin: (hash: string | undefined, pin: string) => Promise<boolean>;
  hashNewPassword: (password: string) => Promise<string>;
  commitPasswordReset: (change: {
    userId: string;
    passwordHash: string;
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
      const pinValid = await dependencies.verifyOrDummyPin(user?.pinHash, request.pin);
      if (!user?.active || !pinValid) return { accepted: true as const };
      const passwordHash = await dependencies.hashNewPassword(request.newPassword);
      await dependencies.commitPasswordReset({
        userId: user.id,
        passwordHash,
        expectedVersion: user.version,
        nextCredentialVersion: user.credentialVersion + 1,
        nextSessionEpoch: user.sessionEpoch + 1,
        retainedTfaStatus: user.tfaStatus,
      });
      return { accepted: true as const };
    },
  };
}
