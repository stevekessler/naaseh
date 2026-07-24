export type RecoveryAuthority = 'recovery';

export type RecoveryWrapFixture = {
  keyVersion: string;
  authority: RecoveryAuthority;
  kmsKeyId: string;
  wrappedDek: string;
};

export type RecoveryPackageFixture = {
  manifestId: string;
  requiredKeyVersions: string[];
  wraps: RecoveryWrapFixture[];
  entityCounts: Record<string, number>;
};

const wrap = (keyVersion: string): RecoveryWrapFixture => ({
  keyVersion,
  authority: 'recovery',
  kmsKeyId: `arn:aws:kms:us-west-2:111111111111:key/recovery-${keyVersion}`,
  wrappedDek: Buffer.from(`fixture-recovery-${keyVersion}`).toString('base64url'),
});

export const completeRecoveryPackage: RecoveryPackageFixture = {
  manifestId: '01J00000000000000000000000',
  requiredKeyVersions: ['memo-v1', 'memo-v2'],
  wraps: [wrap('memo-v1'), wrap('memo-v2')],
  entityCounts: { tasks: 2, revisions: 3, hiddenMemos: 2 },
};

export const missingRecoveryAccountWrapPackage: RecoveryPackageFixture = {
  ...completeRecoveryPackage,
  wraps: completeRecoveryPackage.wraps.filter((item) => item.keyVersion !== 'memo-v2'),
};

export const unknownKeyVersionPackage: RecoveryPackageFixture = {
  ...completeRecoveryPackage,
  wraps: [...completeRecoveryPackage.wraps, wrap('memo-retired-unknown')],
};

export const incompleteRecoveryPackage = missingRecoveryAccountWrapPackage;
