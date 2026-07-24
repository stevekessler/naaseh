import { hiddenMemoPackageSchema } from '@naaseh/domain';
export function validateRecoveryWraps(value: unknown, requiredVersions: string[]) {
  const pkg = hiddenMemoPackageSchema.parse(value);
  const present = new Set(pkg.recoveryWraps.map((wrap) => `${wrap.keyVersion}:${wrap.authority}`));
  const missing = requiredVersions.flatMap((version) =>
    !present.has(`${version}:recovery`) ? [`${version}:recovery`] : [],
  );
  if (missing.length) throw new Error('Required recovery wraps are missing.');
  return pkg;
}
