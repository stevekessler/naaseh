import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { expect, test } from '@playwright/test';
import { db } from '../../apps/web/src/db/database.js';

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
