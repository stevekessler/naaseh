export class UnlockSession {
  private keys = new Map<string, CryptoKey>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  unlock(id: string, key: CryptoKey, minutes = 5) {
    this.keys.set(id, key);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.lock(), minutes * 60_000);
  }

  get(id: string) {
    return this.keys.get(id);
  }

  lock() {
    this.keys.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.lock();
    });
  }
}
