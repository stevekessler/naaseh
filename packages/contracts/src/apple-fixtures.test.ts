import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apiProblemSchema, syncEnvelopeV4Schema } from './apple-native.js';

const fixture = (relativePath: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../test-fixtures/fixtures/apple/${relativePath}`, import.meta.url)),
      'utf8',
    ),
  );

describe('Apple language-neutral fixtures', () => {
  it('round-trips the existing API problem envelope', () => {
    const input = fixture('contracts/api-problem.json');
    expect(apiProblemSchema.parse(input)).toEqual(input);
  });

  it('rejects fields outside the content-free problem contract', () => {
    const input = fixture('contracts/api-problem.json') as Record<string, unknown>;
    expect(() => apiProblemSchema.parse({ ...input, protected: 'leak' })).toThrow();
  });

  it('round-trips sync contract v4 and rejects another version', () => {
    const input = fixture('contracts/sync-envelope-v4.json');
    expect(syncEnvelopeV4Schema.parse(input)).toEqual(input);
    expect(() =>
      syncEnvelopeV4Schema.parse({ ...(input as object), contractVersion: 3 }),
    ).toThrow();
  });
});
