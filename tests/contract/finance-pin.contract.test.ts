import { describe, expect, it } from 'vitest';
import {
  financePinUpdateSchema,
  financePinRequirementSchema,
  financeUnlockRequestSchema,
  financeSecurityResponseSchema,
  financeUnlockResponseSchema,
} from '@naaseh/contracts';

describe('self-only Finance PIN contracts', () => {
  const update = {
    currentPassword: 'synthetic password',
    newPin: '123456',
    confirmPin: '123456',
    requirePin: true,
    expectedRevision: 0,
  };
  it('requires bounded matching decimal PINs and rejects administrative target injection', () => {
    expect(financePinUpdateSchema.parse(update)).toEqual(update);
    for (const change of [
      { targetUserId: 'another-user' },
      { newPin: '12345' },
      { newPin: 'a23456' },
      { confirmPin: '654321' },
      { newPin: '1'.repeat(33) },
      { currentPassword: '' },
    ])
      expect(financePinUpdateSchema.safeParse({ ...update, ...change }).success).toBe(false);
  });
  it('requires current password and revision for requirement changes without permitting a target', () => {
    expect(
      financePinRequirementSchema.parse({
        currentPassword: 'proof',
        requirePin: false,
        expectedRevision: 1,
      }),
    ).toMatchObject({ requirePin: false });
    for (const body of [
      { requirePin: false, expectedRevision: 1 },
      { currentPassword: 'proof', requirePin: false, expectedRevision: -1 },
      { currentPassword: 'proof', requirePin: false, expectedRevision: 1, targetUserId: 'other' },
    ])
      expect(financePinRequirementSchema.safeParse(body).success).toBe(false);
  });
  it('binds unlock requests to a tab nonce without accepting a caller-supplied grant or epoch', () => {
    const body = { pin: '001234', tabNonce: 't'.repeat(32) };
    expect(financeUnlockRequestSchema.parse(body)).toEqual(body);
    for (const extra of [
      { grant: 'forged' },
      { sessionEpoch: 1 },
      { targetUserId: 'other' },
      { tabNonce: '' },
    ])
      expect(financeUnlockRequestSchema.safeParse({ ...body, ...extra }).success).toBe(false);
  });
  it('exposes only safe preference and opaque unlock response fields', () => {
    const preference = { requirePin: true, enrolled: true, revision: 1 };
    expect(financeSecurityResponseSchema.parse(preference)).toEqual(preference);
    expect(
      financeSecurityResponseSchema.safeParse({ ...preference, financePinHash: 'secret' }).success,
    ).toBe(false);
    const result = {
      grant: 'g'.repeat(43),
      expiresAt: '2026-11-01T18:30:00.000Z',
      securityRevision: 1,
      sessionEpoch: 2,
    };
    expect(financeUnlockResponseSchema.parse(result)).toEqual(result);
    expect(
      financeUnlockResponseSchema.safeParse({ ...result, offlineVerifier: 'secret' }).success,
    ).toBe(false);
  });
});
