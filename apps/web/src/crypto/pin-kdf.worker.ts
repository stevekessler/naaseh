/// <reference lib="webworker" />
import { argon2id } from 'hash-wasm';
self.onmessage = async (event: MessageEvent<{ id: string; pin: string; salt: Uint8Array }>) => {
  try {
    const key = await argon2id({
      password: event.data.pin,
      salt: event.data.salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 102400,
      hashLength: 32,
      outputType: 'binary',
    });
    self.postMessage({ id: event.data.id, key }, [key.buffer]);
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'PIN derivation failed',
    });
  }
};
