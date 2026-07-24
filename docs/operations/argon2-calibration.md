# Argon2id calibration

The verifier floor is 102,400 KiB, three iterations, and parallelism one. The deployment creates
a direct-invocation-only 1,024 MiB calibration Lambda that generates synthetic random inputs in
memory. It never receives or returns usernames, passwords, hashes, salts, or peppers.

After deployment, read the `Argon2CalibrationFunctionName` stack output and run:

```bash
npm run calibrate:argon2 -- \
  --function-name FUNCTION_NAME \
  --invocations 8 \
  --verify-samples 8 \
  --output docs/operations/argon2-deployed-evidence.json
```

The evidence file is created with owner-only permissions and records parameters and timings only.
Warm p95 must remain at or below one second. A single execution environment can provide only one
cold observation; establish cold p95 by repeating against freshly published function versions.
Increase iterations only while both warm and cold p95 stay within budget. T045 remains open until
the deployed evidence and the `AuthDuration` CloudWatch alarm are inspected.
