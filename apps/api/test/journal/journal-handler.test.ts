import { describe, expect, it } from 'vitest';
import { journalHandler } from '../../src/journal/handler.js';

describe('Journal key-envelope handler', () => {
  it('rejects writes without the authenticated session CSRF binding before persistence', async () => {
    const response = await journalHandler({
      method: 'PUT',
      path: '/journal/key-envelope',
      ownerId: 'owner-1',
      origin: 'http://localhost:4173',
      expectedCsrf: 'expected',
      providedCsrf: 'wrong',
      body: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(response.body)).toMatchObject({ code: 'JOURNAL_WRITE_FORBIDDEN' });
  });
});
