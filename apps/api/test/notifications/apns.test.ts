import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  APNSProvider,
  apnsPayload,
  classifyAPNSResponse,
  createAPNSProviderToken,
} from '../../src/notifications/apns.js';

describe('APNs provider', () => {
  it('creates ES256 tokens and caches them within their bounded lifetime', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const first = createAPNSProviderToken(
      {
        teamId: 'TEAM123456',
        keyId: 'KEY1234567',
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      },
      1_700_000_000,
    );
    expect(first.split('.')).toHaveLength(3);
    const provider = new APNSProvider({
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      topic: 'link.thepandas.naaseh',
      environment: 'sandbox',
    });
    expect(provider.providerToken(1_700_000_000)).toBe(provider.providerToken(1_700_000_100));
  });

  it('uses generic defaults, supports opted-in private previews, and stays below 4 KiB', () => {
    const generic = apnsPayload({
      occurrenceId: 'occ-1',
      taskId: 'task-1',
      previewPolicy: 'generic',
    });
    expect(generic.aps.alert.body).toBe('A task is due.');
    expect(JSON.stringify(generic)).not.toContain('task title');
    const preview = apnsPayload({
      occurrenceId: 'occ-2',
      taskId: 'task-2',
      previewPolicy: 'private',
      title: 'Task title',
    });
    expect(preview.aps.alert.body).toBe('Task title');
    expect(Buffer.byteLength(JSON.stringify(preview))).toBeLessThanOrEqual(4096);
  });

  it('classifies success, retryable, permanent, and invalid-token responses', () => {
    expect(classifyAPNSResponse(200, '')).toBe('success');
    expect(classifyAPNSResponse(429, '{"reason":"TooManyRequests"}')).toBe('retryable');
    expect(classifyAPNSResponse(410, '{"reason":"Unregistered"}')).toBe('invalid-token');
    expect(classifyAPNSResponse(400, '{"reason":"BadTopic"}')).toBe('permanent');
  });

  it('bounds retries and rejects topic or environment mismatch before delivery', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    let attempts = 0;
    const provider = new APNSProvider(
      {
        teamId: 'TEAM123456',
        keyId: 'KEY1234567',
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
        topic: 'link.thepandas.naaseh',
        environment: 'sandbox',
      },
      async () => {
        attempts += 1;
        return { status: 503, body: '{}' };
      },
    );
    const installation = {
      kind: 'apple' as const,
      clientId: 'phone',
      platform: 'ios' as const,
      environment: 'sandbox' as const,
      token: 'a'.repeat(64),
      topic: 'link.thepandas.naaseh' as const,
      previewPolicy: 'generic' as const,
      userId: 'user',
      updatedAt: new Date().toISOString(),
    };
    expect(
      await provider.send(
        installation,
        apnsPayload({ occurrenceId: 'o', taskId: 't', previewPolicy: 'generic' }),
        3,
      ),
    ).toBe('retryable');
    expect(attempts).toBe(3);
    expect(
      await provider.send(
        { ...installation, environment: 'production' },
        apnsPayload({ occurrenceId: 'o', taskId: 't', previewPolicy: 'generic' }),
      ),
    ).toBe('permanent');
    expect(attempts).toBe(3);
  });
});
