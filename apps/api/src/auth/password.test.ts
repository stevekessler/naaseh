import { describe, expect, it } from 'vitest';
import { hashPassword, passwordParameters, verifyPassword } from './password.js';
describe('password protection', () => {
  it('uses the required Argon2id memory and parallelism', () => {
    expect(passwordParameters.memoryCost).toBeGreaterThanOrEqual(102_400);
    expect(passwordParameters.parallelism).toBe(1);
  });
  it('accepts only the matching password and pepper', async () => {
    const hash = await hashPassword('correct horse battery staple', 'pepper');
    expect(await verifyPassword(hash, 'correct horse battery staple', 'pepper')).toBe(true);
    expect(await verifyPassword(hash, 'wrong', 'pepper')).toBe(false);
  });
}, 15_000);
