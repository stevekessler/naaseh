import { journalSyncContractVersion } from '@naaseh/domain';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy } from '../../../infra/lib/web-security.js';

/** Serves the existing built PWA with a synthetic API; no AWS or persistent financial data. */
export async function startFinancePinBrowserServer() {
  const root = resolve(fileURLToPath(new URL('../../../apps/web/dist/', import.meta.url)));
  const state = {
    signedIn: false,
    requirePin: false,
    enrolled: false,
    revision: 0,
    pin: '001234',
    grants: 0,
    revoked: 0,
    financeCatchUp: false,
    financeDeliveryCursors: [] as number[],
  };
  const preference = () => ({
    requirePin: state.requirePin,
    enrolled: state.enrolled,
    revision: state.revision,
  });
  const session = () => ({
    user: { id: 'local-steve', displayName: 'Steve', role: 'admin', sessionEpoch: 1 },
    csrfToken: 'local-development',
  });
  const server = createServer(async (request, response) => {
    const json = (status: number, value?: unknown) => {
      response.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
        if (chunks.reduce((size, part) => size + part.length, 0) > 16_384) {
          json(413);
          return;
        }
      }
      const raw = Buffer.concat(chunks).toString();
      const body = raw ? JSON.parse(raw) : {};
      if (path === '/api/v1/auth/login') {
        state.signedIn = true;
        json(200, session());
        return;
      }
      if (path === '/api/v1/auth/session') {
        json(state.signedIn ? 200 : 401, session());
        return;
      }
      if (path === '/api/v1/auth/finance-security') {
        if (request.method !== 'GET') {
          if (
            body.currentPassword !== 'local' ||
            body.targetUserId ||
            body.expectedRevision !== state.revision
          ) {
            json(403);
            return;
          }
          if (body.newPin) {
            if (body.newPin !== body.confirmPin || !/^\d{6,32}$/.test(body.newPin)) {
              json(400);
              return;
            }
            state.pin = body.newPin;
          }
          state.requirePin = body.requirePin;
          state.enrolled = true;
          state.revision++;
        }
        json(200, preference());
        return;
      }
      if (path === '/api/v1/auth/finance-unlocks') {
        if (body.pin !== state.pin || !/^[a-f0-9]{32}$/.test(body.tabNonce)) {
          json(403);
          return;
        }
        state.grants++;
        json(200, {
          grant: 'g'.repeat(43),
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          securityRevision: state.revision,
          sessionEpoch: 1,
        });
        return;
      }
      if (path === '/api/v1/auth/finance-unlocks/current') {
        state.revoked++;
        json(204);
        return;
      }
      if (
        ['accounts', 'budgets', 'categories', 'connections'].some(
          (part) => path === `/api/v1/finance/${part}`,
        )
      ) {
        if (
          state.requirePin &&
          (request.headers['x-finance-unlock'] !== 'g'.repeat(43) ||
            !/^[a-f0-9]{32}$/.test(String(request.headers['x-finance-tab'])))
        ) {
          json(403, { code: 'finance_locked' });
          return;
        }
        response.setHeader('x-finance-cache-proof', 'fc1.synthetic.fixture.proof');
        json(200, { items: [], cursor: null });
        return;
      }
      if (path === '/api/v1/sync/bootstrap') {
        json(200, {
          tasks: [],
          categories: [],
          projects: [],
          lists: [],
          listItems: [],
          cursor: { public: 0, owner: 0 },
        });
        return;
      }
      if (path === '/api/v1/sync/pull') {
        if (body.financeCacheOnly === true && body.financeCacheProtocol === 1) {
          if (
            request.headers['x-finance-owner'] !== 'local-steve' ||
            (state.requirePin &&
              (request.headers['x-finance-unlock'] !== 'g'.repeat(43) ||
                !/^[a-f0-9]{32}$/.test(String(request.headers['x-finance-tab']))))
          ) {
            json(403, { code: 'finance_locked' });
            return;
          }
          json(200, {
            changes: [],
            financeChanges: [],
            cursor: {},
            financeCursor: body.financeCursor ?? {},
            financeCache: { status: 'current', proof: 'fc1.synthetic.fixture.proof' },
          });
          return;
        }

        if (body.version === journalSyncContractVersion) {
          json(200, {
            version: journalSyncContractVersion,
            changes: [],
            journalCursor: body.journalCursor ?? 0,
            hasMore: false,
          });
          return;
        }
        if (state.financeCatchUp && body.financeCacheProtocol === 1 && !body.financeCacheOnly) {
          if (
            request.headers['x-finance-owner'] !== 'local-steve' ||
            (state.requirePin &&
              (request.headers['x-finance-unlock'] !== 'g'.repeat(43) ||
                !/^[a-f0-9]{32}$/.test(String(request.headers['x-finance-tab']))))
          ) {
            json(403, { code: 'finance_locked' });
            return;
          }
          const id = '01K00000000000000000008101';
          const after = Number(body.financeCursor?.owner ?? 0);
          state.financeDeliveryCursors.push(after);
          const next = Math.min(after + 1, 3);
          json(200, {
            financeState: 'ready',
            financeCursor: { owner: next },
            financeHasMore: next < 3,
            financeCache: { status: 'current', proof: 'fc1.synthetic.fixture.proof' },
            changes: [],
            cursor: { owner: 777 },
            financeChanges:
              next === 2
                ? []
                : [
                    {
                      audience: 'OWNER#local-steve',
                      sequence: next,
                      entityId: id,
                      entityType: 'financeBudget',
                      version: next === 1 ? 1 : 2,
                      changedAt: '2026-11-09T00:00:00Z',
                      operation: 'upsert',
                      payload: {
                        id,
                        version: next === 1 ? 1 : 2,
                        name: next === 1 ? 'First synthetic budget' : 'Caught-up synthetic budget',
                      },
                    },
                  ],
          });
          return;
        }
        json(200, { changes: [], cursor: body.cursor ?? {}, journalCursor: 0, hasMore: false });
        return;
      }
      if (path.startsWith('/api/')) {
        json(404, {});
        return;
      }
      const target = resolve(root, `.${decodeURIComponent(path)}`);
      if (target !== root && !target.startsWith(`${root}/`)) {
        json(404);
        return;
      }
      let file = target;
      let bytes: Buffer;
      try {
        bytes = await readFile(file);
      } catch {
        file = resolve(root, 'index.html');
        bytes = await readFile(file);
      }
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json',
      };
      response.writeHead(200, {
        'content-type': mime[extname(file)] ?? 'application/octet-stream',
        'content-security-policy': contentSecurityPolicy,
      });
      response.end(bytes);
    } catch {
      json(500, {});
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Finance test server did not bind.');
  return {
    state,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
