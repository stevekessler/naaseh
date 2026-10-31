import { describe, expect, it } from 'vitest';
import {
  claimSimplefinAccessUrl,
  decodeAndValidateSetupToken,
  fetchSimplefinAccounts,
  validateSimplefinAccessUrl,
  validateSimplefinClaimUrl,
} from '../../apps/api/src/finance/simplefin-client.js';
import {
  decryptConnectionAccessUrl,
  encryptConnectionAccessUrl,
} from '../../apps/api/src/finance/connection-service.js';
import { EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const token = (url: string) => Buffer.from(url, 'utf8').toString('base64');

describe('SimpleFIN SSRF boundary', () => {
  it('accepts only configured HTTPS Bridge hosts on port 443', () => {
    expect(
      decodeAndValidateSetupToken(token('https://bridge.simplefin.org/simplefin/create'), [
        'bridge.simplefin.org',
      ]).hostname,
    ).toBe('bridge.simplefin.org');
    for (const url of [
      'http://bridge.simplefin.org/x',
      'https://127.0.0.1/x',
      'https://169.254.169.254/latest/meta-data',
      'https://bridge.simplefin.org:444/x',
      'https://evil.invalid/x',
    ]) {
      expect(() => validateSimplefinAccessUrl(url, ['bridge.simplefin.org'])).toThrow(
        /url|host|https|port/i,
      );
    }
  });

  it('rejects credentials in claim URLs but requires them in Bridge Access URLs', () => {
    expect(() => decodeAndValidateSetupToken('a'.repeat(10_000), ['bridge.simplefin.org'])).toThrow(
      /size/i,
    );
    expect(() =>
      validateSimplefinClaimUrl('https://user:pass@bridge.simplefin.org/x', [
        'bridge.simplefin.org',
      ]),
    ).toThrow(/credential/i);
    expect(
      validateSimplefinAccessUrl('https://user:pass@bridge.simplefin.org/simplefin', [
        'bridge.simplefin.org',
      ]).username,
    ).toBe('user');
    expect(() =>
      validateSimplefinAccessUrl('https://bridge.simplefin.org/simplefin', [
        'bridge.simplefin.org',
      ]),
    ).toThrow(/credentials/i);
  });

  it('disables redirects and bounds provider responses', async () => {
    const calls: RequestInit[] = [];
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response('x'.repeat(20), { status: 200 });
    }) as typeof fetch;
    await expect(
      fetchSimplefinAccounts(
        'https://user:pass@bridge.simplefin.org/simplefin',
        ['bridge.simplefin.org'],
        fetcher,
        10,
      ),
    ).rejects.toThrow(/size/i);
    expect(calls[0]?.redirect).toBe('manual');
  });

  it('calls the Bridge v2 accounts endpoint with Basic auth and bounded dates', async () => {
    let requested = '';
    let authorization = '';
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      requested = input.toString();
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return new Response('{"errlist":[],"connections":[],"accounts":[]}');
    }) as typeof fetch;
    await fetchSimplefinAccounts(
      'https://demo:secret@bridge.simplefin.org/simplefin',
      ['bridge.simplefin.org'],
      fetcher,
      5_000_000,
      { startDate: '2026-01-01', endDate: '2026-03-01' },
    );
    const url = new URL(requested);
    expect(url.pathname).toBe('/simplefin/accounts');
    expect(url.searchParams.get('version')).toBe('2');
    expect(url.searchParams.get('pending')).toBe('1');
    expect(url.searchParams.get('start-date')).toBe(
      String(Date.parse('2026-01-01T00:00:00.000Z') / 1_000),
    );
    expect(authorization).toBe(`Basic ${Buffer.from('demo:secret').toString('base64')}`);
    expect(requested).not.toContain('demo:secret');
  });

  it('validates the claimed Access URL before returning it', async () => {
    const fetcher = (async () =>
      new Response('https://user:pass@bridge.simplefin.org/simplefin', {
        status: 200,
      })) as typeof fetch;
    await expect(
      claimSimplefinAccessUrl(
        token('https://bridge.simplefin.org/claim'),
        ['bridge.simplefin.org'],
        fetcher,
      ),
    ).resolves.toBe('https://user:pass@bridge.simplefin.org/simplefin');
  });

  it('binds credential ciphertext to the connection and never persists plaintext', async () => {
    const sent: unknown[] = [];
    const kms = {
      send: async (command: unknown) => {
        sent.push(command);
        return command instanceof EncryptCommand
          ? { CiphertextBlob: new Uint8Array([1, 2, 3]) }
          : {
              Plaintext: new TextEncoder().encode(
                'https://user:pass@bridge.simplefin.org/simplefin',
              ),
            };
      },
    };
    const encrypted = await encryptConnectionAccessUrl(
      'connection-1',
      'https://user:pass@bridge.simplefin.org/simplefin',
      'key-1',
      kms,
    );
    expect(encrypted).toEqual({
      encryptedAccessUrl: 'AQID',
      credentialKeyId: 'key-1',
      credentialContextVersion: 1,
    });
    expect(JSON.stringify(encrypted)).not.toContain('bridge.simplefin.org');
    await expect(decryptConnectionAccessUrl('connection-1', encrypted, kms)).resolves.toContain(
      'bridge.simplefin.org',
    );
    expect((sent[0] as EncryptCommand).input.EncryptionContext).toEqual({
      purpose: 'naaseh-finance-connection',
      connectionId: 'connection-1',
      contextVersion: '1',
    });
    expect(sent[1]).toBeInstanceOf(DecryptCommand);
  });
});
