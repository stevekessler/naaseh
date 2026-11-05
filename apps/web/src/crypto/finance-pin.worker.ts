/// <reference lib="webworker" />
import { argon2id } from 'hash-wasm';

self.onmessage = async (event: MessageEvent<{ id: string; pin: string; salt: string }>) => {
  const { id, pin, salt } = event.data;
  try {
    if (!/^\d{6,32}$/.test(pin) || !/^[a-f0-9]{32}$/.test(salt)) throw new Error();
    const raw = await argon2id({
      password: `finance-offline-v1:${pin}`,
      salt: Uint8Array.from(salt.match(/../g)!, (value) => Number.parseInt(value, 16)),
      parallelism: 1,
      iterations: 3,
      memorySize: 102400,
      hashLength: 32,
      outputType: 'binary',
    });
    const verifier = [...raw].map((value) => value.toString(16).padStart(2, '0')).join('');
    raw.fill(0);
    self.postMessage({ id, verifier });
  } catch {
    self.postMessage({ id, error: 'Finance offline verification is unavailable.' });
  }
};
