import { describe, expect, it } from 'vitest';
import {
  CrisisPlanKeyBroker,
  crisisPlanBrokerHeaders,
} from '../../src/journal/crisis-plan-key-broker-handler.js';
import { crisisPlanGrantFixture } from '../../../../tests/fixtures/crisis-plan.js';

describe('isolated Crisis Plan key broker', () => {
  it('reauthorizes, rewraps only the CPK, denies replay, and requires no-store', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );
    const publicKey = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString(
      'base64url',
    );
    const cpk = crypto.getRandomValues(new Uint8Array(32));
    const grant = crisisPlanGrantFixture();
    let active = true;
    const claimed = new Set<string>();
    const broker = new CrisisPlanKeyBroker({
      now: () => Date.parse('2026-08-29T12:00:00Z'),
      currentGrant: async () => (active ? grant : undefined),
      claimRequest: async (binding) => {
        if (claimed.has(binding.requestId)) return false;
        claimed.add(binding.requestId);
        return true;
      },
      decryptGrant: async () =>
        new TextEncoder().encode(
          JSON.stringify({
            ownerId: 'owner-1',
            planId: grant.planId,
            recipientId: 'recipient-1',
            shareVersion: 1,
            keyGeneration: 1,
            cpk: Buffer.from(cpk).toString('base64url'),
          }),
        ),
    });
    const binding = {
      requestId: '22222222-2222-4222-8222-222222222222',
      recipientId: 'recipient-1',
      ownerId: 'owner-1',
      planId: grant.planId,
      shareVersion: 1,
      keyGeneration: 1,
      ephemeralPublicKeySpki: publicKey,
    };
    const result = await broker.rewrap(binding);
    expect(
      new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          pair.privateKey,
          Buffer.from(result.wrappedCpk, 'base64url'),
        ),
      ),
    ).toEqual(cpk);
    await expect(broker.rewrap(binding)).rejects.toThrow('unavailable');
    active = false;
    await expect(broker.rewrap({ ...binding, requestId: crypto.randomUUID() })).rejects.toThrow(
      'unavailable',
    );
    expect(crisisPlanBrokerHeaders['cache-control']).toContain('no-store');
  });

  it('uses the durable request claim before decrypting so a fresh broker instance denies replay', async () => {
    const grant = crisisPlanGrantFixture();
    const claimed = new Set<string>();
    let decrypts = 0;
    const dependencies = {
      now: () => Date.parse('2026-08-29T12:00:00Z'),
      currentGrant: async () => grant,
      claimRequest: async (binding: { requestId: string }) => {
        if (claimed.has(binding.requestId)) return false;
        claimed.add(binding.requestId);
        return true;
      },
      decryptGrant: async () => {
        decrypts += 1;
        return new Uint8Array();
      },
    };
    const binding = {
      requestId: '22222222-2222-4222-8222-222222222222',
      recipientId: 'recipient-1',
      ownerId: 'owner-1',
      planId: grant.planId,
      shareVersion: 1,
      keyGeneration: 1,
      ephemeralPublicKeySpki: 'unused',
    };

    await expect(new CrisisPlanKeyBroker(dependencies).rewrap(binding)).rejects.toThrow();
    await expect(new CrisisPlanKeyBroker(dependencies).rewrap(binding)).rejects.toThrow(
      'unavailable',
    );
    expect(decrypts).toBe(1);
  });
});
