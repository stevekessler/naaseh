import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { expect, test } from '@playwright/test';
import { db } from '../../apps/web/src/db/database.js';
import { handleWebShellRecovery } from '../../apps/api/src/client/web-shell-recovery.js';

// Exercise a real generated worker replacing a cached legacy shell, rather than
// simulating the update callback in React. Keep this in the full release suite.
test('replaces a blocked legacy worker and retains queued IndexedDB data', async ({ page }) => {
  let released = false;
  const legacy = `<!doctype html><html><body>
    <h1>Legacy app</h1><button id="update">Update</button><p id="status"></p>
    <script>
      document.querySelector('#update').onclick = () => {
        document.querySelector('#status').textContent = 'Waiting for sync';
      };
      navigator.serviceWorker.register('/sw.js');
    </script></body></html>`;
  const oldWorker = `
    self.addEventListener('install', event => event.waitUntil(
      caches.open('legacy-shell').then(cache => cache.put('/index.html', new Response(${JSON.stringify(legacy)}, {headers: {'Content-Type': 'text/html'}})))
    ));
    self.addEventListener('fetch', event => {
      if (event.request.mode === 'navigate') event.respondWith(caches.open('legacy-shell').then(cache => cache.match('/index.html')));
    });`;
  const root = resolve('apps/web/dist');
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url!, 'http://localhost').pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (!released && path === '/sw.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(oldWorker);
      } else if (!released && (path === '/' || path === '/index.html')) {
        response.setHeader('Content-Type', 'text/html');
        response.end(legacy);
      } else if (path.startsWith('/api/')) {
        response.writeHead(503).end();
      } else {
        const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
        if (!file.startsWith(`${root}/`)) return void response.writeHead(404).end();
        const content = await readFile(file);
        const types: Record<string, string> = {
          '.js': 'text/javascript',
          '.html': 'text/html',
          '.css': 'text/css',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.webmanifest': 'application/manifest+json',
        };
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        response.end(content);
      }
    })().catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Legacy app' })).toBeVisible();
    const schema = db;
    await page.evaluate(
      async ({ version, tables }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('naaseh', version);
          request.onupgradeneeded = () => {
            for (const table of tables) {
              const store = request.result.createObjectStore(table.name, {
                keyPath: table.keyPath,
              });
              for (const index of table.indexes)
                store.createIndex(index.name, index.keyPath, {
                  unique: index.unique,
                  multiEntry: index.multi,
                });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = database.transaction(['outbox', 'cryptoKeys', 'secureTasks'], 'readwrite');
        tx.objectStore('outbox').put({ id: 'pending', payload: 'encrypted-offline-change' });
        tx.objectStore('cryptoKeys').put({ id: 'key', value: 'retained-key-material' });
        tx.objectStore('secureTasks').put({ id: 'task', value: 'encrypted-task' });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      {
        version: schema.verno * 10,
        tables: schema.tables.map((table) => ({
          name: table.name,
          keyPath: table.schema.primKey.keyPath,
          indexes: table.schema.indexes.map((index) => ({
            name: index.name,
            keyPath: index.keyPath,
            unique: index.unique,
            multi: index.multi,
          })),
        })),
      },
    );
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.getByText('Waiting for sync')).toBeVisible();
    released = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const previous = registration!.active;
      await registration!.update();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('New worker stayed blocked')), 20_000);
        const check = () => {
          if (registration!.active !== previous && registration!.active?.state === 'activated') {
            clearTimeout(timeout);
            resolve();
          }
        };
        registration!.installing?.addEventListener('statechange', check);
        check();
      });
    });
    await page.reload();
    await expect(page.getByLabel('Username')).toBeVisible();
    const saved = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('naaseh');
        request.onsuccess = () => resolve(request.result);
      });
      const values = await Promise.all(
        ['outbox', 'cryptoKeys', 'secureTasks'].map(
          (name) =>
            new Promise<unknown[]>((resolve) => {
              const request = database.transaction(name).objectStore(name).getAll();
              request.onsuccess = () => resolve(request.result);
            }),
        ),
      );
      database.close();
      return values;
    });
    expect(saved).toEqual([
      [{ id: 'pending', payload: 'encrypted-offline-change' }],
      expect.arrayContaining([{ id: 'key', value: 'retained-key-material' }]),
      [{ id: 'task', value: 'encrypted-task' }],
    ]);
  } finally {
    await page.goto('about:blank');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('repairs a stale shell through POST without clearing Naaseh user data', async ({ page }) => {
  let repairStarted = false;
  const legacy = '<!doctype html><html><body><h1>Stale Naaseh</h1></body></html>';
  const current = '<!doctype html><html><body><h1>Current Naaseh</h1></body></html>';
  const oldWorker = `
    self.addEventListener('install', event => event.waitUntil(
      caches.open('legacy-shell').then(cache => cache.put('/index.html', new Response(${JSON.stringify(legacy)}, {headers: {'Content-Type': 'text/html'}})))
    ));
    self.addEventListener('fetch', event => {
      if (event.request.method === 'GET' && event.request.mode === 'navigate')
        event.respondWith(caches.open('legacy-shell').then(cache => cache.match('/index.html')));
    });`;
  const appServer = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(oldWorker);
      return;
    }
    if (url.pathname === '/api/v1/client/recover-shell') {
      const method = request.method ?? 'GET';
      if (method === 'POST') repairStarted = true;
      const result = handleWebShellRecovery({
        requestContext: { http: { method } },
        queryStringParameters: Object.fromEntries(url.searchParams),
      } as never) as { statusCode: number; headers?: Record<string, string>; body?: string };
      response.writeHead(result.statusCode, result.headers).end(result.body);
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(repairStarted ? current : legacy);
  });
  await new Promise<void>((done) => appServer.listen(0, '127.0.0.1', done));
  const appAddress = appServer.address();
  if (!appAddress || typeof appAddress === 'string') throw new Error('Missing app server address');
  const appOrigin = `http://127.0.0.1:${appAddress.port}`;
  const launcherServer = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      `<!doctype html><html><body><form method="post" action="${appOrigin}/api/v1/client/recover-shell"><button>Repair Naaseh</button></form></body></html>`,
    );
  });
  await new Promise<void>((done) => launcherServer.listen(0, '127.0.0.1', done));
  const launcherAddress = launcherServer.address();
  if (!launcherAddress || typeof launcherAddress === 'string')
    throw new Error('Missing launcher server address');

  try {
    await page.goto(appOrigin);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      document.cookie = 'naaseh-session=preserved; SameSite=Lax';
      localStorage.setItem('naaseh-preference', 'preserved');
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('recovery-preservation', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('records');
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('records', 'readwrite');
          transaction.objectStore('records').put('preserved', 'pending-sync');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      });
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Stale Naaseh' })).toBeVisible();

    await page.goto(`http://127.0.0.1:${launcherAddress.port}`);
    await page.getByRole('button', { name: 'Repair Naaseh' }).click();
    await expect(page.getByRole('heading', { name: 'Current Naaseh' })).toBeVisible();

    const preserved = await page.evaluate(async () => {
      const stored = await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('recovery-preservation');
        request.onsuccess = () => {
          const database = request.result;
          const value = database.transaction('records').objectStore('records').get('pending-sync');
          value.onsuccess = () => {
            database.close();
            resolve(value.result);
          };
          value.onerror = () => reject(value.error);
        };
        request.onerror = () => reject(request.error);
      });
      return {
        cacheNames: await caches.keys(),
        registrations: await navigator.serviceWorker.getRegistrations(),
        localStorage: localStorage.getItem('naaseh-preference'),
        stored,
      };
    });
    expect(preserved).toEqual({
      cacheNames: [],
      registrations: [],
      localStorage: 'preserved',
      stored: 'preserved',
    });
    expect(
      (await page.context().cookies(appOrigin)).some((cookie) => cookie.name === 'naaseh-session'),
    ).toBe(true);
  } finally {
    await page.goto('about:blank');
    appServer.closeAllConnections();
    launcherServer.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => appServer.close(() => resolve())),
      new Promise<void>((resolve) => launcherServer.close(() => resolve())),
    ]);
  }
});
