import { describe, expect, it } from 'vitest';
import { redact } from '../../packages/observability/src/redaction.js';
import {
  encryptGoogleRefreshToken,
  googleTokenEncryptionContext,
  hashGoogleOAuthState,
} from '../../apps/api/src/google-sync/auth-service.js';

describe('Google synchronization security boundary', () => {
  it('stores only a deterministic hash of OAuth state', () => {
    expect(hashGoogleOAuthState('random-state')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGoogleOAuthState('random-state')).not.toContain('random-state');
  });

  it('binds refresh-token ciphertext to purpose, owner and connection', async () => {
    process.env.NAASEH_DATA_KMS_KEY_ARN = 'arn:aws:kms:us-west-2:123:key/test';
    let input: Record<string, unknown> | undefined;
    const kms = {
      send: async (command: { input: Record<string, unknown> }) => {
        input = command.input;
        return { CiphertextBlob: Buffer.from('ciphertext') };
      },
    };
    await expect(
      encryptGoogleRefreshToken('refresh-secret', 'owner', 'connection', kms as never),
    ).resolves.toBe(Buffer.from('ciphertext').toString('base64'));
    expect(input).toMatchObject({
      KeyId: process.env.NAASEH_DATA_KMS_KEY_ARN,
      EncryptionContext: googleTokenEncryptionContext('owner', 'connection'),
    });
    expect(String(input?.Plaintext)).toBe('refresh-secret');
  });

  it('permanently redacts Google content and credentials', () => {
    expect(
      redact({
        authorizationCode: 'code',
        refreshToken: 'token',
        taskTitle: 'private task',
        dueDate: '2026-07-25',
        googleNotes: 'memo',
        localValue: 'choice-a',
        remoteValue: 'choice-b',
        correlationId: 'safe',
      }),
    ).toEqual({
      authorizationCode: '[REDACTED]',
      refreshToken: '[REDACTED]',
      taskTitle: '[REDACTED]',
      dueDate: '[REDACTED]',
      googleNotes: '[REDACTED]',
      localValue: '[REDACTED]',
      remoteValue: '[REDACTED]',
      correlationId: 'safe',
    });
  });
});
