import { expect, it } from 'vitest';
import {
  hashPassword,
  passwordParameters,
  verifyPassword,
} from '../../apps/api/src/auth/password.js';
import { handler as calibrationHandler } from '../../apps/api/src/auth/calibration-handler.js';

it('verifies within the one-second local p95 calibration budget', async () => {
  expect(passwordParameters.memoryCost).toBeGreaterThanOrEqual(102_400);
  expect(passwordParameters.parallelism).toBe(1);
  const hash = await hashPassword('calibration', 'pepper');
  const timings: number[] = [];
  for (let sample = 0; sample < 8; sample += 1) {
    const start = performance.now();
    expect(await verifyPassword(hash, 'calibration', 'pepper')).toBe(true);
    timings.push(performance.now() - start);
  }
  timings.sort((left, right) => left - right);
  const p50 = timings[Math.floor(timings.length * 0.5)]!;
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
  console.info(JSON.stringify({ metric: 'argon2-local-verify', p50Ms: p50, p95Ms: p95 }));
  expect(p95).toBeLessThan(1_000);
}, 30_000);

it('exposes a content-free direct-invocation calibration contract', async () => {
  await expect(
    calibrationHandler({ kind: 'argon2-calibration', samples: 1 }),
  ).resolves.toMatchObject({
    schema: 'naaseh-argon2-calibration/v1',
    samples: 1,
    parameters: { memoryKiB: 102_400, iterations: 3, parallelism: 1 },
  });
}, 10_000);
