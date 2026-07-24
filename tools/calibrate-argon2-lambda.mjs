import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const functionName = argument('--function-name') ?? process.env.ARGON2_CALIBRATION_FUNCTION;
const invocationSamples = Number(argument('--invocations') ?? '8');
const verifySamples = Number(argument('--verify-samples') ?? '8');
const outputPath = argument('--output');
if (!functionName) throw new Error('Provide --function-name or ARGON2_CALIBRATION_FUNCTION.');
if (!Number.isInteger(invocationSamples) || invocationSamples < 2 || invocationSamples > 30)
  throw new Error('--invocations must be an integer from 2 through 30.');
if (!Number.isInteger(verifySamples) || verifySamples < 1 || verifySamples > 30)
  throw new Error('--verify-samples must be an integer from 1 through 30.');

const directory = mkdtempSync(join(tmpdir(), 'naaseh-argon2-'));
try {
  const observations = [];
  for (let index = 0; index < invocationSamples; index += 1) {
    const responsePath = join(directory, `response-${index}.json`);
    const startedAt = performance.now();
    const invocation = spawnSync(
      'aws',
      [
        'lambda',
        'invoke',
        '--function-name',
        functionName,
        '--cli-binary-format',
        'raw-in-base64-out',
        '--payload',
        JSON.stringify({ kind: 'argon2-calibration', samples: verifySamples }),
        responsePath,
        '--output',
        'json',
      ],
      { encoding: 'utf8', env: process.env },
    );
    if (invocation.error) throw invocation.error;
    if (invocation.status !== 0)
      throw new Error(`Lambda invocation failed: ${invocation.stderr.trim()}`);
    const metadata = JSON.parse(invocation.stdout);
    if (metadata.FunctionError) throw new Error('Calibration Lambda returned a function error.');
    observations.push({
      ...JSON.parse(readFileSync(responsePath, 'utf8')),
      roundTripMs: performance.now() - startedAt,
    });
  }
  const warm = observations.filter((observation) => !observation.coldStart);
  const cold = observations.filter((observation) => observation.coldStart);
  const evidence = {
    schema: 'naaseh-argon2-deployed-evidence/v1',
    functionName,
    measuredAt: new Date().toISOString(),
    observations,
    warm: summarize(warm),
    cold: summarize(cold),
    passed:
      warm.length > 0 &&
      observations.every(
        (observation) =>
          observation.parameters.memoryKiB >= 102_400 &&
          observation.parameters.parallelism === 1 &&
          observation.p95Ms <= 1_000,
      ),
    note:
      cold.length < 2
        ? 'One execution environment cannot establish cold p95; repeat after publishing fresh versions.'
        : undefined,
  };
  const rendered = `${JSON.stringify(evidence, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, rendered, { mode: 0o600 });
  process.stdout.write(rendered);
  if (!evidence.passed) process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function summarize(values) {
  if (!values.length) return { samples: 0 };
  const handler = values.map((value) => value.p95Ms).sort((left, right) => left - right);
  const roundTrip = values.map((value) => value.roundTripMs).sort((left, right) => left - right);
  return {
    samples: values.length,
    handlerP95Ms: percentile(handler, 0.95),
    roundTripP95Ms: percentile(roundTrip, 0.95),
  };
}

function percentile(values, percentileValue) {
  return values[Math.max(0, Math.ceil(values.length * percentileValue) - 1)];
}
