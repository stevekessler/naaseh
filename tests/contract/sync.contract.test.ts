import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pushRequestSchema } from '@naaseh/contracts';
const contract = readFileSync('specs/001-naaseh-v1-baseline/contracts/openapi.yaml', 'utf8');
describe('sync contract', () => {
  it('declares versioned bootstrap, push, and pull operations', () => {
    for (const value of [
      '/sync/bootstrap:',
      '/sync/push:',
      '/sync/pull:',
      'contractVersion:',
      'const: 1',
    ])
      expect(contract).toContain(value);
  });
  it('requires a nonempty batch of at most 100 mutations', () => {
    expect(pushRequestSchema.safeParse({ contractVersion: 1, mutations: [] }).success).toBe(false);
    expect(
      pushRequestSchema.safeParse({ contractVersion: 1, mutations: Array(101).fill({}) }).success,
    ).toBe(false);
    expect(pushRequestSchema.safeParse({ contractVersion: 2, mutations: [{}] }).success).toBe(
      false,
    );
  });
  it('accepts only bounded content-free durable backlog evidence', () => {
    const mutation = {
      id: '01J00000000000000000000001',
      entityId: '01J00000000000000000000002',
      entityType: 'task',
      operation: 'update',
      baseVersion: 1,
      payload: {},
      createdAt: '2026-07-23T12:00:00.000Z',
      attempts: 0,
    };
    expect(
      pushRequestSchema.safeParse({
        contractVersion: 1,
        mutations: [mutation],
        backlog: { depth: 3, oldestAgeSeconds: 60 },
      }).success,
    ).toBe(true);
    expect(
      pushRequestSchema.safeParse({
        contractVersion: 1,
        mutations: [mutation],
        backlog: { depth: -1, oldestAgeSeconds: 60, label: 'must-not-be-accepted' },
      }).success,
    ).toBe(false);
  });
});
