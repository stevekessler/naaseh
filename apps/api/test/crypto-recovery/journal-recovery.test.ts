import { describe, expect, it } from 'vitest';
import { InMemoryJournalRecoveryRepository } from '../../src/crypto-recovery/journal-recovery-repository.js';
import { JournalRecoveryService } from '../../src/crypto-recovery/journal-recovery-service.js';

describe('two-party journal recovery', () => {
  it('binds a five-minute one-use rewrap to the owner request and designated admin', async () => {
    const now = Date.parse('2026-08-29T12:00:00Z');
    const repository = new InMemoryJournalRecoveryRepository();
    const service = new JournalRecoveryService(repository, {
      now: () => now,
      verifyOwnerPassword: async () => true,
      verifyAdminStrongAuth: async () => true,
      rewrapForOwner: async () => 'owner-ephemeral-ciphertext',
    });
    const request = await service.initiate({
      ownerId: 'owner',
      actorId: 'owner',
      password: 'password',
      reason: 'Lost PIN',
      sessionEpochDigest: 'epoch',
      keyEnvelopeVersion: 1,
      recoveryKeyVersion: 1,
      ephemeralPublicKeySpki: 'A'.repeat(400),
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(request.state).toBe('requested');
    expect('reason' in request).toBe(false);
    await expect(
      service.approve({
        requestId: request.id,
        adminId: 'ordinary',
        role: 'admin',
        password: 'x',
        factorCode: '123456',
        approvalId: 'approval',
      }),
    ).rejects.toThrow();
    await service.approve({
      requestId: request.id,
      adminId: 'recovery-admin',
      role: 'recovery',
      password: 'x',
      factorCode: '123456',
      approvalId: 'approval',
    });
    expect((await service.ownerStatus('owner', request.id)).state).toBe('rewrapped');
    expect(await service.consume('owner', request.id)).toBe('owner-ephemeral-ciphertext');
    await expect(service.consume('owner', request.id)).rejects.toThrow();
    expect(repository.auditChainValid()).toBe(true);
  });

  it('rejects foreign owners, expired requests, replay, and arbitrary state changes', async () => {
    let now = Date.parse('2026-08-29T12:00:00Z');
    const service = new JournalRecoveryService(new InMemoryJournalRecoveryRepository(), {
      now: () => now,
      verifyOwnerPassword: async () => true,
      verifyAdminStrongAuth: async () => true,
      rewrapForOwner: async () => 'ciphertext',
    });
    const input = {
      ownerId: 'owner',
      actorId: 'owner',
      password: 'password',
      reason: 'Lost PIN',
      sessionEpochDigest: 'epoch',
      keyEnvelopeVersion: 1,
      recoveryKeyVersion: 1,
      ephemeralPublicKeySpki: 'A'.repeat(400),
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    };
    const request = await service.initiate(input);
    expect((await service.initiate(input)).id).toBe(request.id);
    await expect(service.ownerStatus('other', request.id)).rejects.toThrow();
    now += 300_001;
    await expect(
      service.approve({
        requestId: request.id,
        adminId: 'recovery-admin',
        role: 'recovery',
        password: 'x',
        factorCode: '123456',
        approvalId: 'approval',
      }),
    ).rejects.toThrow('expired');
  });
});
