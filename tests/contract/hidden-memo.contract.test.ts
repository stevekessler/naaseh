import { hiddenMemoAad, hiddenMemoPackageSchema } from '@naaseh/domain';
import { expect, it } from 'vitest';

const at = '2026-07-23T12:00:00.000Z';
const base = {
  version: 1 as const,
  taskId: 'task-1',
  memoId: 'memo-1',
  ciphertext: 'ciphertext',
  iv: 'iv',
  aad: hiddenMemoAad('task-1', 'memo-1'),
  pinSalt: 'salt',
  pinWrap: { version: 'pin-v1', algorithm: 'AES-256-GCM', ciphertext: 'wrapped' },
  createdAt: at,
  updatedAt: at,
};

it('requires one regional recovery wrap for every recovery key version', () => {
  expect(
    hiddenMemoPackageSchema.safeParse({
      ...base,
      recoveryWraps: [
        {
          keyVersion: 'memo-v1',
          authority: 'recovery',
          kmsKeyId: 'arn:aws:kms:us-west-2:111111111111:key/recovery',
          algorithm: 'RSA-OAEP-256',
          ciphertext: 'wrapped',
        },
      ],
    }).success,
  ).toBe(true);
  expect(hiddenMemoPackageSchema.safeParse({ ...base, recoveryWraps: [] }).success).toBe(false);
});
