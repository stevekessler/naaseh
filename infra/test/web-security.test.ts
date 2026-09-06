import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../lib/web-security.js';

describe('web content security policy', () => {
  it('allows the Argon2 WebAssembly module without allowing JavaScript eval', () => {
    const scriptDirective = contentSecurityPolicy
      .split('; ')
      .find((directive) => directive.startsWith('script-src '));
    const sources = scriptDirective?.split(' ').slice(1);

    expect(sources).toContain("'self'");
    expect(sources).toContain("'wasm-unsafe-eval'");
    expect(sources).not.toContain("'unsafe-eval'");
  });
});
