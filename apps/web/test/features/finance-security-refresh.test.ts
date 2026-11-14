import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FinanceAccessController,
  type FinanceOfflineState,
} from '../../src/features/finance/security/finance-access-controller.js';
import { refreshFinanceSecurity } from '../../src/features/finance/security/finance-access-session.js';

const controllers: FinanceAccessController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.unstubAllGlobals();
});
const preference = { requirePin: false, revision: 1, sessionEpoch: 1 };
async function setup() {
  let stored: FinanceOfflineState | undefined;
  const store = {
    read: async () => structuredClone(stored),
    update: async (
      _ownerId: string,
      change: (current: FinanceOfflineState | undefined) => FinanceOfflineState,
    ) => {
      stored = structuredClone(change(structuredClone(stored)));
      return structuredClone(stored);
    },
    remove: async () => {
      stored = undefined;
    },
  };
  const controller = new FinanceAccessController({
    ownerId: 'owner',
    store,
    unlock: async () => {
      throw new Error('No PIN is required by this fixture.');
    },
  });
  controllers.push(controller);
  await controller.synchronize(preference);
  return { controller, store };
}
describe('Finance security refresh visit binding', () => {
  it('aborts both requests on lock and rejects a transport that still delivers its old responses', async () => {
    const { controller } = await setup();
    await controller.markStale();
    const requests: Array<{ signal?: AbortSignal; finish: (value: Response) => void }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((finish) => {
            requests.push({ signal: options.signal ?? undefined, finish });
          }),
      ),
    );
    const refresh = refreshFinanceSecurity(controller, 'owner');
    const rejected = expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toHaveLength(2);
    controller.lock(false);
    const aborted = requests.every(({ signal }) => signal?.aborted);
    requests[0]!.finish(Response.json({ requirePin: false, enrolled: false, revision: 1 }));
    requests[1]!.finish(Response.json({ user: { id: 'owner', sessionEpoch: 1 } }));
    await rejected;
    expect(aborted).toBe(true);
    expect(controller.securityReady).toBe(false);
    expect(controller.canRead()).toBe(false);
    // A fresh visit can still refresh successfully without another PIN prompt.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/auth/session')
          ? Response.json({ user: { id: 'owner', sessionEpoch: 1 } })
          : Response.json({ requirePin: false, enrolled: false, revision: 1 }),
      ),
    );
    await refreshFinanceSecurity(controller, 'owner');
    expect(controller.securityReady).toBe(true);
    expect(controller.canRead()).toBe(true);
  });
  it('does not fetch or synchronize security for a different controller owner', async () => {
    const { controller } = await setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(refreshFinanceSecurity(controller, 'another-owner')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not publish a delayed security-store result after another lock or delete the retained verifier', async () => {
    const { controller, store } = await setup();
    const verifier = { salt: 'retained-salt', hash: 'a'.repeat(64) };
    await store.update('owner', (current) => ({ ...current!, verifier }));
    await controller.markStale();
    const update = store.update;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    store.update = async (ownerId, change) => {
      const value = await update(ownerId, change);
      await pending;
      return value;
    };
    const remove = vi.spyOn(store, 'remove');
    const sync = controller.synchronize(preference);
    const rejected = expect(sync).rejects.toThrow();
    await Promise.resolve();
    controller.lock(false);
    finish();
    await rejected;
    expect(controller.securityReady).toBe(false);
    expect(controller.canRead()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(await store.read()).toEqual(
      expect.objectContaining({ ownerId: 'owner', revision: 1, verifier }),
    );
  });
});
