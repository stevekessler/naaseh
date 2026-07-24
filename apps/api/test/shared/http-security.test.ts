import { describe, expect, it } from 'vitest';
import { json } from '../../src/shared/http.js';

describe('API security headers', () => {
  it('delivers CSP and framing protections on every JSON response', () => {
    const response = json(200, { ok: true });
    expect(response.headers).toMatchObject({
      'content-security-policy': "default-src 'none'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    });
  });
});
