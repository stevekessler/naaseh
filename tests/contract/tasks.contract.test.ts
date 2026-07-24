import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { taskCreateSchema } from '@naaseh/contracts';
const contract = readFileSync('specs/001-naaseh-v1-baseline/contracts/openapi.yaml', 'utf8');
describe('task HTTP contract', () => {
  it('declares CRUD, completion, and revision routes with mutation and concurrency controls', () => {
    for (const value of [
      '/tasks:',
      '/tasks/{taskId}:',
      '/tasks/{taskId}/completion:',
      '/tasks/{taskId}/revisions:',
      'Idempotency-Key',
      'If-Match',
    ])
      expect(contract).toContain(value);
  });
  it('requires a label, rejects unknown input, unsafe URLs, and incomplete due dates', () => {
    expect(taskCreateSchema.safeParse({ memo: 'x' }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ label: 'x', unknown: true }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ label: 'x', link: 'http://example.com' }).success).toBe(
      false,
    );
    expect(
      taskCreateSchema.safeParse({ label: 'x', dueAt: '2026-01-01T00:00:00.000Z' }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        label: 'x',
        dueAt: '2026-01-01T00:00:00.000Z',
        dueTimeZone: 'America/Denver',
      }).success,
    ).toBe(true);
  });
  it('defines safe revision provenance without memo or label snapshots', () => {
    for (const value of ['sourceClientId:', 'syncOutcome:', 'local-pending', 'before:', 'after:'])
      expect(contract).toContain(value);
    expect(contract).toContain('memo and label content are excluded');
  });
});
