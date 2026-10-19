import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export const webShellRecoveryPath = '/api/v1/client/recover-shell';

const securityHeaders = {
  'cache-control': 'no-store, max-age=0',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

function applicationOrigin(): string {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const configuredOrigin of configuredOrigins) {
    try {
      const url = new URL(configuredOrigin);
      if (url.protocol === 'https:' && url.origin === configuredOrigin) return url.origin;
    } catch {
      // Ignore malformed entries and fail closed below if none are usable.
    }
  }
  throw new Error('A secure Naaseh application origin is required for web shell recovery.');
}

function html(body: string, contentSecurityPolicy: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: {
      ...securityHeaders,
      'content-security-policy': contentSecurityPolicy,
      'content-type': 'text/html; charset=utf-8',
    },
    body,
  };
}

function launcherDocument(origin: string): APIGatewayProxyResultV2 {
  const action = `${origin}${webShellRecoveryPath}`;
  return html(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Repair Naaseh</title></head>
<body>
  <main>
    <h1>Repair Naaseh</h1>
    <p>This removes only Naaseh's outdated app shell. Your account, cookies, history, saved data, and pending changes are preserved.</p>
    <form method="post" action="${action}"><button type="submit">Repair and reopen Naaseh</button></form>
  </main>
</body>
</html>`,
    `default-src 'none'; base-uri 'none'; form-action ${origin}; frame-ancestors 'none'`,
  );
}

function recoveryDocument(): APIGatewayProxyResultV2 {
  return html(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Repairing Naaseh</title></head>
<body>
  <main>
    <h1>Repairing Naaseh</h1>
    <p id="status" role="status" aria-live="polite">Removing the outdated app shell…</p>
    <button id="retry" type="button" hidden>Try again</button>
  </main>
  <script src="${webShellRecoveryPath}?script=1"></script>
</body>
</html>`,
    `default-src 'none'; base-uri 'none'; script-src 'self'; frame-ancestors 'none'`,
  );
}

function recoveryScript(): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: {
      ...securityHeaders,
      'content-security-policy': `default-src 'none'; frame-ancestors 'none'`,
      'content-type': 'application/javascript; charset=utf-8',
    },
    body: `(() => {
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  retry.addEventListener('click', () => location.reload());
  (async () => {
    try {
      status.textContent = 'Removing the outdated app shell…';
      const registrations = 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistrations()
        : [];
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const cacheNames = 'caches' in window ? await caches.keys() : [];
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      status.textContent = 'Repair complete. Reopening Naaseh…';
      location.replace('/?recovered=' + Date.now());
    } catch (error) {
      status.textContent = 'Naaseh could not finish the repair. Close this tab, reopen it, and try once more.';
      retry.hidden = false;
    }
  })();
})();`,
  };
}

export function handleWebShellRecovery(event: APIGatewayProxyEventV2): APIGatewayProxyResultV2 {
  const method = event.requestContext.http.method;
  if (method === 'POST') return recoveryDocument();
  if (method === 'GET' && event.queryStringParameters?.script === '1') return recoveryScript();
  if (method === 'GET') return launcherDocument(applicationOrigin());
  return {
    statusCode: 405,
    headers: { ...securityHeaders, allow: 'GET, POST' },
  };
}
