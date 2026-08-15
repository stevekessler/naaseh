import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { Secret, TOTP } from 'otpauth';

const kms = new KMSClient({});
const algorithm = 'SHA1';
const digits = 6;
const period = 30;

const normalizeRecoveryCode = (value: string) =>
  value.normalize('NFKC').replaceAll('-', '').trim().toLocaleUpperCase('en-US');

export const digestRecoveryCode = (value: string) =>
  createHash('sha256').update(normalizeRecoveryCode(value)).digest('hex');

export function generateRecoveryCodes(entropy: () => Uint8Array = () => randomBytes(20)): string[] {
  const codes = new Set<string>();
  while (codes.size < 10) codes.add(Buffer.from(entropy()).toString('base64url').toUpperCase());
  return [...codes];
}

export function verifyRecoveryCode(value: string, expectedDigest: string) {
  const actual = Buffer.from(digestRecoveryCode(value), 'hex');
  const expected = Buffer.from(expectedDigest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateTfaSecret() {
  return new Secret({ size: 20 }).base32;
}

export function verifyTotp(options: {
  secretBase32: string;
  token: string;
  now?: Date;
  lastAcceptedCounter?: number;
}) {
  const timestamp = (options.now ?? new Date()).getTime();
  const totp = new TOTP({
    secret: Secret.fromBase32(options.secretBase32),
    algorithm,
    digits,
    period,
  });
  const delta = totp.validate({ token: options.token, timestamp, window: 1 });
  if (delta === null) return undefined;
  const counter = Math.floor(timestamp / (period * 1_000)) + delta;
  if (options.lastAcceptedCounter !== undefined && counter <= options.lastAcceptedCounter)
    return undefined;
  return { counter };
}

export async function encryptTfaSecret(userId: string, secretBase32: string) {
  const result = await kms.send(
    new EncryptCommand({
      KeyId: process.env.NAASEH_KMS_KEY_ARN,
      Plaintext: Buffer.from(secretBase32, 'utf8'),
      EncryptionContext: { purpose: 'naaseh-totp', userId },
    }),
  );
  if (!result.CiphertextBlob) throw new Error('Unable to protect TFA secret');
  return Buffer.from(result.CiphertextBlob).toString('base64');
}

export async function decryptTfaSecret(userId: string, ciphertext: string) {
  const result = await kms.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
      EncryptionContext: { purpose: 'naaseh-totp', userId },
    }),
  );
  if (!result.Plaintext) throw new Error('Unable to read TFA secret');
  return Buffer.from(result.Plaintext).toString('utf8');
}
