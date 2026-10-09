import { describe, expect, it } from 'vitest';
import { journalHandler } from '../../src/journal/handler.js';

describe('native journal authorization boundary', () => {
  it('does not treat native identity headers as authentication or owner authority', async () => {
    const unauthenticated = await journalHandler({ method: 'GET', path: '/journal/key-envelope' });
    expect(unauthenticated.statusCode).toBe(401);
    expect(JSON.parse(unauthenticated.body).code).toBe('AUTHENTICATION_REQUIRED');

    const mismatched = await journalHandler({
      method: 'PUT',
      path: '/journal/key-envelope',
      ownerId: 'owner-a',
      origin: 'http://localhost:4173',
      expectedCsrf: 'csrf',
      providedCsrf: 'csrf',
      body: { id: 'journal-key', ownerId: 'owner-b' },
    });
    expect(mismatched.statusCode).toBe(400);
    expect(JSON.parse(mismatched.body).code).toBe('INVALID_JOURNAL_ENVELOPE');
    expect(mismatched.headers['cache-control']).toBe('no-store');
  });
});
