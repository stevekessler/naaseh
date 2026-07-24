import { hash, verify, Algorithm } from '@node-rs/argon2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Lambda memory is deliberately traded for resistance to offline cracking. The deployed
// calibration test may increase timeCost while retaining the 100 MiB floor and p95 budget.
export const passwordParameters = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 102_400,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;
export async function hashPassword(password: string, pepper: string): Promise<string> {
  return hash(`${password}${pepper}`, passwordParameters);
}
export async function verifyPassword(
  hashValue: string,
  password: string,
  pepper: string,
): Promise<boolean> {
  try {
    return await verify(hashValue, `${password}${pepper}`, passwordParameters);
  } catch {
    return false;
  }
}
const secrets = new SecretsManagerClient({});
export async function loadPepper(
  secretId = process.env.PASSWORD_PEPPER_SECRET_ID,
  version?: string,
): Promise<{ value: string; version: string }> {
  if (!secretId) throw new Error('Password pepper is not configured.');
  const result = await secrets.send(
    new GetSecretValueCommand({ SecretId: secretId, ...(version ? { VersionId: version } : {}) }),
  );
  if (!result.SecretString) throw new Error('Password pepper is unavailable.');
  return { value: result.SecretString, version: result.VersionId ?? version ?? 'unknown' };
}
let dummyHash: Promise<string> | undefined;
export async function verifyOrDummy(
  storedHash: string | undefined,
  password: string,
  pepper: string,
): Promise<boolean> {
  dummyHash ??= hashPassword('unusable-dummy-password', pepper);
  return verifyPassword(storedHash ?? (await dummyHash), password, pepper);
}
