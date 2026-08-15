import { describe, expect, it } from 'vitest';
import { hiddenMemoPackageSchema } from './hidden-memo-package.js';

describe('hidden memo package compatibility', () => {
  const base = {
    taskId: 'task',
    memoId: 'memo',
    ciphertext: 'cipher',
    iv: 'iv',
    aad: 'aad',
    pinSalt: 'salt',
    pinWrap: { version: '1', algorithm: 'AES-GCM', ciphertext: 'wrapped' },
    recoveryWraps: [
      {
        keyVersion: '1',
        authority: 'recovery' as const,
        kmsKeyId: 'key',
        algorithm: 'RSA',
        ciphertext: 'wrap',
      },
    ],
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  };
  it.each([1, 2] as const)('reads package version %s', (version) => {
    expect(hiddenMemoPackageSchema.parse({ ...base, version }).version).toBe(version);
  });
});
