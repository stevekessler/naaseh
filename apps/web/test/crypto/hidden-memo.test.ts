import { describe, expect, it } from 'vitest';
import { hiddenMemoAad, hiddenMemoPackageSchema } from '@naaseh/domain';
import { createMemoCiphertext, decryptMemo } from '../../src/crypto/hidden-memo.js';
import {
  derivePinKey,
  rewrapDekForPinChange,
  unwrapDekWithPin,
  wrapDekWithPin,
} from '../../src/crypto/pin-wrap.js';
import { UnlockSession } from '../../src/crypto/unlock-session.js';
import { migratePinPackages } from '../../src/features/memos/ChangePinFlow.js';

describe('hidden memo cryptography', () => {
  it('binds AES-GCM ciphertext to canonical task and memo AAD and rejects tampering', async () => {
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'private details');
    await expect(decryptMemo(encrypted, encrypted.dek)).resolves.toBe('private details');
    await expect(
      decryptMemo({ ...encrypted, aad: hiddenMemoAad('task-2', 'memo-1') }, encrypted.dek),
    ).rejects.toThrow();
  });

  it('wraps a unique DEK with a PIN and rejects the wrong PIN', async () => {
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'private details');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const pinKey = await derivePinKey('246810', salt);
    const wrapped = await wrapDekWithPin(encrypted.dek, pinKey);
    const unwrapped = await unwrapDekWithPin(wrapped, pinKey);
    await expect(decryptMemo(encrypted, unwrapped)).resolves.toBe('private details');
    const wrongKey = await derivePinKey('135791', salt);
    await expect(unwrapDekWithPin(wrapped, wrongKey)).rejects.toThrow();
  }, 20_000);

  it('changes PIN wrap versions without changing memo ciphertext', async () => {
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'private details');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const oldKey = await derivePinKey('246810', salt);
    const oldWrap = await wrapDekWithPin(encrypted.dek, oldKey);
    const ciphertextBefore = encrypted.ciphertext;
    const nextWrap = await rewrapDekForPinChange(oldWrap, '246810', salt, '864200', 'pin-v2');
    expect(nextWrap.version).toBe('pin-v2');
    expect(encrypted.ciphertext).toBe(ciphertextBefore);
  }, 20_000);

  it('migrates all PIN wraps before persistence without changing memo ciphertext', async () => {
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'private details');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const pinKey = await derivePinKey('246810', salt);
    const pinWrap = await wrapDekWithPin(encrypted.dek, pinKey);
    const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
    const packages = [
      {
        memoId: 'memo-1',
        memoCiphertext: encrypted.ciphertext,
        pinSalt: encode(salt),
        pinWrap,
      },
    ];

    const migrated = await migratePinPackages(packages, '246810', '864200', 'pin-v2');
    expect(migrated[0]?.memoCiphertext).toBe(encrypted.ciphertext);
    expect(migrated[0]?.pinWrap.version).toBe('pin-v2');
    expect(migrated[0]?.pinSalt).not.toBe(packages[0]?.pinSalt);
    const nextKey = await derivePinKey(
      '864200',
      Uint8Array.from(atob(migrated[0]!.pinSalt), (character) => character.charCodeAt(0)),
    );
    const nextDek = await unwrapDekWithPin(migrated[0]!.pinWrap, nextKey);
    await expect(decryptMemo(encrypted, nextDek)).resolves.toBe('private details');
  }, 30_000);

  it('does not return a partial migration when any old PIN wrap is invalid', async () => {
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'private details');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const pinKey = await derivePinKey('246810', salt);
    const pinWrap = await wrapDekWithPin(encrypted.dek, pinKey);
    const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
    await expect(
      migratePinPackages(
        [
          {
            memoId: 'memo-1',
            memoCiphertext: encrypted.ciphertext,
            pinSalt: encode(salt),
            pinWrap,
          },
          {
            memoId: 'memo-2',
            memoCiphertext: 'unchanged',
            pinSalt: encode(salt),
            pinWrap: { ...pinWrap, ciphertext: 'invalid' },
          },
        ],
        '246810',
        '864200',
        'pin-v2',
      ),
    ).rejects.toThrow();
  }, 30_000);

  it('requires one regional recovery wrap and clears unlocked key references', async () => {
    const at = new Date().toISOString();
    expect(
      hiddenMemoPackageSchema.safeParse({
        version: 1,
        taskId: 'task-1',
        memoId: 'memo-1',
        ciphertext: 'ciphertext',
        iv: 'iv',
        aad: hiddenMemoAad('task-1', 'memo-1'),
        pinSalt: 'salt',
        pinWrap: { version: 'pin-v1', algorithm: 'AES-256-GCM', ciphertext: 'wrapped' },
        recoveryWraps: [
          {
            keyVersion: 'memo-v1',
            authority: 'recovery',
            kmsKeyId: 'arn:aws:kms:us-west-2:222222222222:key/recovery',
            algorithm: 'RSA-OAEP-256',
            ciphertext: 'wrapped',
          },
        ],
        createdAt: at,
        updatedAt: at,
      }).success,
    ).toBe(true);
    const encrypted = await createMemoCiphertext('task-1', 'memo-1', 'private details');
    const session = new UnlockSession();
    session.unlock('memo-1', encrypted.dek);
    expect(session.get('memo-1')).toBe(encrypted.dek);
    session.lock();
    expect(session.get('memo-1')).toBeUndefined();
  });
});
