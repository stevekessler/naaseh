import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleWebShellRecovery } from '../../src/client/web-shell-recovery.js';

const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;

function event(method: string, queryStringParameters?: Record<string, string>) {
  return {
    requestContext: { http: { method } },
    ...(queryStringParameters ? { queryStringParameters } : {}),
  } as never;
}

describe('web shell recovery', () => {
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'https://gsd.thepandas.link';
  });

  afterEach(() => {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
  });

  it('serves a direct launcher that posts to the Naaseh origin', () => {
    const response = handleWebShellRecovery(event('GET')) as {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['content-security-policy']).toContain(
      'form-action https://gsd.thepandas.link',
    );
    expect(response.body).toContain('method="post"');
    expect(response.body).toContain(
      'action="https://gsd.thepandas.link/api/v1/client/recover-shell"',
    );
  });

  it('uses a POST document plus an external script to bypass stale navigation handling', () => {
    const document = handleWebShellRecovery(event('POST')) as { body: string };
    expect(document.body).toContain('src="/api/v1/client/recover-shell?script=1"');

    const script = handleWebShellRecovery(event('GET', { script: '1' })) as {
      headers: Record<string, string>;
      body: string;
    };
    expect(script.headers['content-type']).toContain('application/javascript');
    expect(script.body).toContain('registration.unregister()');
    expect(script.body).toContain('caches.delete(cacheName)');
    expect(script.body).toContain("location.replace('/?recovered='");
  });

  it('does not clear account cookies, browser history, or durable user data', () => {
    const script = handleWebShellRecovery(event('GET', { script: '1' })) as { body: string };
    expect(script.body).not.toMatch(/indexedDB|localStorage|sessionStorage|document\.cookie/);
    const launcher = handleWebShellRecovery(event('GET')) as { body: string };
    expect(launcher.body).toContain(
      'cookies, history, saved data, and pending changes are preserved',
    );
  });
});
