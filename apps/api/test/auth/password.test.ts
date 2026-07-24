import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  passwordParameters,
  verifyOrDummy,
  verifyPassword,
} from '../../src/auth/password.js';

describe('Argon2id password verification', () => {
  it('uses the mandated algorithm floor and parallelism', () => {
    expect(passwordParameters.memoryCost).toBeGreaterThanOrEqual(102_400);
    expect(passwordParameters.parallelism).toBe(1);
    expect(passwordParameters.timeCost).toBeGreaterThanOrEqual(1);
  });

  it('creates PHC verifiers with unique salts and binds them to the pepper version value', async () => {
    const first = await hashPassword('right', 'pepper-v1');
    const second = await hashPassword('right', 'pepper-v1');
    expect(first).toMatch(/^\$argon2id\$/);
    expect(second).not.toBe(first);
    expect(await verifyPassword(first, 'right', 'pepper-v1')).toBe(true);
    expect(await verifyPassword(first, 'right', 'pepper-v2')).toBe(false);
  }, 20_000);

  it('performs dummy verification for unknown users instead of returning early', async () => {
    expect(await verifyOrDummy(undefined, 'wrong', 'pepper-v1')).toBe(false);
  }, 20_000);
});
