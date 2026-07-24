import { describe, expect, it } from 'vitest';
import { redact } from '@naaseh/observability';
import {
  createProfilePictureReadUrl,
  profilePictureKey,
  validatePicture,
  validatePictureSignature,
} from '../../apps/api/src/admin/profile-picture.js';

describe('admin and profile-media security', () => {
  it('rejects executable, oversized, empty, and MIME-spoofed pictures', () => {
    expect(() => validatePicture('image/svg+xml', 100)).toThrow();
    expect(() => validatePicture('image/png', 0)).toThrow();
    expect(() => validatePicture('image/png', 5_000_001)).toThrow();
    expect(() =>
      validatePictureSignature('image/png', new Uint8Array([0xff, 0xd8, 0xff])),
    ).toThrow();
    expect(validatePictureSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
  });

  it('uses owner-scoped opaque keys and refuses arbitrary signed-read targets', async () => {
    expect(profilePictureKey('user_1', 'upload-id')).toBe('profiles/user_1/original/upload-id');
    expect(() => profilePictureKey('../other', 'upload-id')).toThrow();
    await expect(
      createProfilePictureReadUrl('profiles/other/original/raw', 'private-bucket'),
    ).rejects.toThrow();
  });

  it('redacts provisioning and media secrets', () => {
    const output = JSON.stringify(
      redact({
        password: 'secret',
        pin: '123456',
        uploadUrl: 'signed-secret-url',
        pictureKey: 'safe-id',
      }),
    );
    expect(output).not.toContain('secret');
    expect(output).not.toContain('123456');
    expect(output).not.toContain('signed-secret-url');
  });
});
