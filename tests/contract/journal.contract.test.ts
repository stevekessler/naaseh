import {
  journalBootstrapResponseSchema,
  journalKeyEnvelopeResponseSchema,
  journalMutationRequestSchema,
  journalPullResponseSchema,
  journalRecoveryViewSchema,
  journalRoutes,
} from '@naaseh/contracts';
import { describe, expect, it } from 'vitest';

describe('journal API contract', () => {
  it('publishes ciphertext-only sync v5 and no-store key/recovery routes', () => {
    expect(
      journalRoutes.every(
        (route) =>
          !route.path.includes('delete') &&
          !route.path.includes('export') &&
          !route.path.includes('search'),
      ),
    ).toBe(true);
    expect(
      journalRoutes
        .filter((route) => route.sensitive)
        .every((route) => route.cacheControl === 'no-store'),
    ).toBe(true);
    expect(journalPullResponseSchema.shape.version.value).toBe(5);
    expect(journalBootstrapResponseSchema.shape.version.value).toBe(5);
  });

  it('strictly rejects plaintext mutation fields', () => {
    expect(
      journalMutationRequestSchema.safeParse({ date: '2026-08-29', notes: 'secret' }).success,
    ).toBe(false);
  });

  it('exports owner key and recovery response validators', () => {
    expect(journalKeyEnvelopeResponseSchema).toBeDefined();
    expect(journalRecoveryViewSchema).toBeDefined();
  });
});
