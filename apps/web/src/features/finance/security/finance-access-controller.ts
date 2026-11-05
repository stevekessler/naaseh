import FinancePinWorker from '../../../crypto/finance-pin.worker.ts?worker';
import { financeUnlockResponseSchema } from '@naaseh/contracts';

export interface FinanceOfflineState {
  ownerId: string;
  requirePin: boolean;
  revision: number;
  sessionEpoch: number;
  knownStale?: boolean;
  verifier?: { salt: string; hash: string };
  failures: number;
  retryAt: number;
  leaseId?: string;
  leaseUntil?: number;
}
export interface FinanceOfflineStore {
  read(ownerId: string): Promise<FinanceOfflineState | undefined>;
  update(
    ownerId: string,
    change: (current: FinanceOfflineState | undefined) => FinanceOfflineState,
  ): Promise<FinanceOfflineState>;
  remove(ownerId: string): Promise<void>;
}
type UnlockResponse = ReturnType<typeof financeUnlockResponseSchema.parse>;
const connect = () => new Error('Connect to refresh Finance security before unlocking.');
const locked = () => new Error('Unlock Finance to continue.');
const wait = () => new Error('Wait before trying the Finance PIN again.');
const randomHex = () =>
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
const validPin = (pin: string) => {
  if (!/^\d{6,32}$/.test(pin)) throw new Error('Enter a Finance PIN of 6 to 32 digits.');
};
const equalHash = (a: string, b: string) => {
  let different = a.length ^ b.length;
  for (let index = 0; index < 64; index++)
    different |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return different === 0;
};

export function deriveOfflineFinanceVerifier(
  pin: string,
  salt: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new FinancePinWorker();
    const id = crypto.randomUUID();
    const done = (value?: string) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (value && /^[a-f0-9]{64}$/.test(value)) resolve(value);
      else reject(connect());
    };
    const abort = () => done();
    const timer = setTimeout(abort, 30_000);
    worker.onmessage = (event: MessageEvent<{ id: string; verifier?: string }>) => {
      if (event.data.id === id) done(event.data.verifier);
    };
    worker.onerror = abort;
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else worker.postMessage({ id, pin, salt });
  });
}

/** An application access gate. It never derives or deletes the shared device encryption key. */
export class FinanceAccessController {
  readonly tabNonce = randomHex();
  private known: FinanceOfflineState | undefined;
  private grant: string | undefined;
  private openUntil = 0;
  private offline = false;
  private generation = 0;
  private readonly requests = new Set<AbortController>();
  private readonly cleanups = new Set<() => void>();
  private readonly changes = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly unsubscribe: (() => void) | undefined;
  private cleanupFailed = false;
  constructor(
    private readonly options: {
      ownerId: string;
      store: FinanceOfflineStore;
      unlock: (pin: string, tabNonce: string, signal: AbortSignal) => Promise<UnlockResponse>;
      derive?: typeof deriveOfflineFinanceVerifier;
      revoke?: (grant: string) => Promise<void>;
      now?: () => number;
      notifyLock?: (securityChanged?: boolean) => void;
      subscribeLock?: (listener: (securityChanged?: boolean) => void) => () => void;
    },
  ) {
    this.unsubscribe = options.subscribeLock?.((securityChanged) => {
      if (securityChanged && this.known) this.known = { ...this.known, knownStale: true };
      this.lock(false);
    });
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private derive(pin: string, salt: string, signal: AbortSignal) {
    return (this.options.derive ?? deriveOfflineFinanceVerifier)(pin, salt, signal);
  }
  private validate(state: FinanceOfflineState | undefined): FinanceOfflineState {
    if (
      !state ||
      state.ownerId !== this.options.ownerId ||
      typeof state.requirePin !== 'boolean' ||
      !Number.isSafeInteger(state.revision) ||
      state.revision < 0 ||
      !Number.isSafeInteger(state.sessionEpoch) ||
      state.sessionEpoch < 0 ||
      !Number.isSafeInteger(state.failures) ||
      state.failures < 0 ||
      !Number.isFinite(state.retryAt)
    )
      throw connect();
    return state;
  }
  private fresh(generation: number) {
    if (generation !== this.generation) throw locked();
  }
  private open(expiresAt: number, offline: boolean, grant?: string) {
    this.openUntil = expiresAt;
    this.offline = offline;
    this.grant = grant;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.lock(), Math.max(0, expiresAt - this.now()));
    for (const listener of this.changes) listener();
  }
  async restore() {
    this.lock(false);
    const generation = this.generation;
    const state = await this.options.store.read(this.options.ownerId);
    this.fresh(generation);
    this.known = state ? this.validate(state) : undefined;
    for (const listener of this.changes) listener();
  }
  async synchronize(preference: { requirePin: boolean; revision: number; sessionEpoch: number }) {
    if (
      typeof preference.requirePin !== 'boolean' ||
      !Number.isSafeInteger(preference.revision) ||
      preference.revision < 0 ||
      !Number.isSafeInteger(preference.sessionEpoch) ||
      preference.sessionEpoch < 0
    )
      throw connect();
    const olderThan = (state: FinanceOfflineState | undefined) =>
      state &&
      (preference.revision < state.revision || preference.sessionEpoch < state.sessionEpoch);
    if (olderThan(this.known)) {
      this.lock(false);
      throw connect();
    }
    let obsoleteResponse = false;
    const changed =
      !this.known ||
      this.known.revision !== preference.revision ||
      this.known.sessionEpoch !== preference.sessionEpoch ||
      this.known.requirePin !== preference.requirePin;
    if (changed) {
      if (this.known) this.known = { ...this.known, knownStale: true };
      this.lock(true, true);
    }
    try {
      this.known = await this.options.store.update(this.options.ownerId, (current) => {
        if (olderThan(current)) {
          obsoleteResponse = true;
          throw connect();
        }
        const same =
          current?.revision === preference.revision &&
          current.sessionEpoch === preference.sessionEpoch &&
          current.requirePin === preference.requirePin;
        return {
          ...(same ? current : {}),
          ownerId: this.options.ownerId,
          ...preference,
          failures: same ? current.failures : 0,
          retryAt: same ? current.retryAt : 0,
          ...(same && current.verifier ? { verifier: current.verifier } : {}),
          knownStale: false,
        };
      });
    } catch {
      this.known = undefined;
      // Keep the newer tab's durable verifier/throttle state when an old response arrives.
      if (!obsoleteResponse) await this.options.store.remove(this.options.ownerId);
      throw connect();
    }
    for (const listener of this.changes) listener();
  }
  async markStale() {
    this.lock();
    if (this.known) this.known = { ...this.known, knownStale: true };
    try {
      await this.options.store.update(this.options.ownerId, (current) => ({
        ...this.validate(current),
        knownStale: true,
      }));
    } catch {
      await this.options.store.remove(this.options.ownerId);
      throw connect();
    }
  }
  canRead() {
    if (this.openUntil && this.openUntil <= this.now()) this.lock();
    if (!this.known || this.known.knownStale) return false;
    return !this.known.requirePin || this.openUntil > this.now();
  }
  /** Every asynchronous read checks the same visit before work and before delivery. */
  async read<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!this.canRead() || signal?.aborted) throw locked();
    const generation = this.generation;
    const request = new AbortController();
    const abort = () => request.abort();
    signal?.addEventListener('abort', abort, { once: true });
    this.requests.add(request);
    try {
      const result = await operation(request.signal);
      this.fresh(generation);
      if (request.signal.aborted || !this.canRead()) throw locked();
      return result;
    } finally {
      request.abort();
      signal?.removeEventListener('abort', abort);
      this.requests.delete(request);
    }
  }
  requestHeaders(): Record<string, string> {
    if (!this.canRead()) throw locked();
    return this.grant && !this.offline
      ? { 'x-finance-unlock': this.grant, 'x-finance-tab': this.tabNonce }
      : {};
  }
  async unlockOnline(pin: string) {
    validPin(pin);
    const known = this.validate(this.known);
    if (!known.requirePin) return;
    const generation = this.generation;
    const request = new AbortController();
    this.requests.add(request);
    try {
      const response = financeUnlockResponseSchema.parse(
        await this.options.unlock(pin, this.tabNonce, request.signal),
      );
      this.fresh(generation);
      if (
        response.securityRevision !== known.revision ||
        response.sessionEpoch !== known.sessionEpoch ||
        Date.parse(response.expiresAt) <= this.now()
      )
        throw connect();
      const salt = randomHex();
      const hash = await this.derive(pin, salt, request.signal);
      this.fresh(generation);
      this.known = await this.options.store.update(this.options.ownerId, (current) => {
        if (current?.revision !== known.revision || current.sessionEpoch !== known.sessionEpoch)
          throw connect();
        return { ...current, knownStale: false, verifier: { salt, hash }, failures: 0, retryAt: 0 };
      });
      this.fresh(generation);
      this.open(
        Math.min(Date.parse(response.expiresAt), this.now() + 30 * 60_000),
        false,
        response.grant,
      );
    } finally {
      request.abort();
      this.requests.delete(request);
    }
  }
  async unlockOffline(pin: string) {
    validPin(pin);
    const generation = this.generation;
    const leaseId = randomHex();
    const material = await this.options.store.update(this.options.ownerId, (current) => {
      const state = this.validate(current);
      if (
        state.knownStale ||
        !state.requirePin ||
        !state.verifier ||
        !/^[a-f0-9]{32}$/.test(state.verifier.salt) ||
        !/^[a-f0-9]{64}$/.test(state.verifier.hash)
      )
        throw connect();
      if (
        this.known &&
        (this.known.revision !== state.revision || this.known.sessionEpoch !== state.sessionEpoch)
      )
        throw connect();
      if (Math.max(state.retryAt, state.leaseUntil ?? 0) > this.now()) throw wait();
      return { ...state, leaseId, leaseUntil: this.now() + 60_000 };
    });
    const request = new AbortController();
    this.requests.add(request);
    try {
      const hash = await this.derive(pin, material.verifier!.salt, request.signal);
      this.fresh(generation);
      const valid = equalHash(hash, material.verifier!.hash);
      this.known = await this.options.store.update(this.options.ownerId, (current) => {
        const state = this.validate(current);
        if (
          state.leaseId !== leaseId ||
          state.revision !== material.revision ||
          state.sessionEpoch !== material.sessionEpoch ||
          state.knownStale ||
          (state.leaseUntil ?? 0) <= this.now()
        )
          throw connect();
        const failures = valid ? 0 : Math.min(32, state.failures + 1);
        const delay =
          failures < 5 ? 0 : Math.min(1_800_000, 30_000 * 2 ** Math.min(26, failures - 5));
        const next = { ...state, failures, retryAt: this.now() + delay };
        delete next.leaseId;
        delete next.leaseUntil;
        return next;
      });
      this.fresh(generation);
      if (!valid)
        throw this.known.retryAt > this.now() ? wait() : new Error('The Finance PIN is incorrect.');
      this.open(this.now() + 30 * 60_000, true);
    } finally {
      request.abort();
      this.requests.delete(request);
    }
  }
  lock(notify = true, securityChanged = false) {
    const grant = this.grant;
    this.generation++;
    this.grant = undefined;
    if (grant) void this.options.revoke?.(grant).catch(() => undefined);
    this.openUntil = 0;
    this.offline = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch {
        this.cleanupFailed = true;
      }
    }
    for (const listener of this.changes) listener();
    if (notify) this.options.notifyLock?.(securityChanged);
  }
  onLock(cleanup: () => void) {
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }
  subscribe(listener: () => void) {
    this.changes.add(listener);
    return () => this.changes.delete(listener);
  }
  visitFinance(active: boolean) {
    if (!active) this.lock();
  }
  bindLifecycle(target: EventTarget = window) {
    const lock = () => this.lock();
    target.addEventListener('pagehide', lock);
    target.addEventListener('pageshow', lock);
    return () => {
      target.removeEventListener('pagehide', lock);
      target.removeEventListener('pageshow', lock);
    };
  }
  get securityReady() {
    return Boolean(this.known && !this.known.knownStale);
  }
  get requiresPin() {
    return this.known?.requirePin === true;
  }
  get cleanupError() {
    return this.cleanupFailed ? 'Finance cleanup needs attention.' : undefined;
  }
  dispose() {
    this.lock(false);
    this.unsubscribe?.();
    this.cleanups.clear();
    this.changes.clear();
    this.known = undefined;
  }
}
