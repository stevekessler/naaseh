import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashPassword, passwordParameters, verifyPassword } from './password.js';

const inputSchema = z
  .object({
    kind: z.literal('argon2-calibration'),
    samples: z.number().int().min(1).max(30).default(8),
  })
  .strict();

let invocationCount = 0;

/** Direct-invocation-only calibration endpoint; it never accepts or returns user material. */
export async function handler(event: unknown) {
  const input = inputSchema.parse(event);
  const coldStart = invocationCount === 0;
  invocationCount += 1;
  const syntheticPassword = randomBytes(32).toString('base64url');
  const syntheticPepper = randomBytes(32).toString('base64url');
  const verifier = await hashPassword(syntheticPassword, syntheticPepper);
  const timingsMs: number[] = [];
  for (let index = 0; index < input.samples; index += 1) {
    const startedAt = performance.now();
    if (!(await verifyPassword(verifier, syntheticPassword, syntheticPepper)))
      throw new Error('Synthetic Argon2id verification failed.');
    timingsMs.push(performance.now() - startedAt);
  }
  timingsMs.sort((left, right) => left - right);
  return {
    schema: 'naaseh-argon2-calibration/v1',
    coldStart,
    samples: timingsMs.length,
    p50Ms: percentile(timingsMs, 0.5),
    p95Ms: percentile(timingsMs, 0.95),
    maximumMs: timingsMs.at(-1),
    parameters: {
      memoryKiB: passwordParameters.memoryCost,
      iterations: passwordParameters.timeCost,
      parallelism: passwordParameters.parallelism,
    },
  };
}

function percentile(values: number[], percentileValue: number) {
  return values[Math.max(0, Math.ceil(values.length * percentileValue) - 1)]!;
}
