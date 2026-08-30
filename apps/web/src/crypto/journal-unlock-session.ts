import { zeroizeJournalKey } from './journal-crypto.js';

export class JournalUnlockSession {
  private unlocked = new Map<string, Uint8Array>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private visibilityListener: (() => void) | undefined;

  async unlock(ownerId: string, jmk: Uint8Array, lifetimeMs = 5 * 60_000) {
    this.lock(ownerId);
    const ownedCopy = new Uint8Array(jmk);
    this.unlocked.set(ownerId, ownedCopy);
    this.timers.set(
      ownerId,
      setTimeout(() => this.lock(ownerId), lifetimeMs),
    );
  }
  get(ownerId: string): Uint8Array | undefined {
    return this.unlocked.get(ownerId);
  }
  lock(ownerId?: string) {
    const owners = ownerId ? [ownerId] : [...this.unlocked.keys()];
    for (const id of owners) {
      const key = this.unlocked.get(id);
      if (key) zeroizeJournalKey(key);
      this.unlocked.delete(id);
      const timer = this.timers.get(id);
      if (timer) clearTimeout(timer);
      this.timers.delete(id);
    }
  }
  bindLifecycle() {
    if (typeof document === 'undefined' || this.visibilityListener) return;
    this.visibilityListener = () => {
      if (document.hidden) this.lock();
    };
    document.addEventListener('visibilitychange', this.visibilityListener);
  }
  dispose() {
    this.lock();
    if (this.visibilityListener)
      document.removeEventListener('visibilitychange', this.visibilityListener);
    this.visibilityListener = undefined;
  }
}
