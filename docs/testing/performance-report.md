# Performance report

## Local evidence — 2026-07-22

- Argon2id verification at 102,400 KiB, three iterations, and parallelism 1 measured
  146.17 ms p50 and 149.49 ms p95 over eight samples during the complete validation run.
  This passes the one-second
  local threshold but does not calibrate Lambda cold starts.
- Authorized in-memory filtering of 50,000 tasks measured 65.87 ms p50 and 147.36 ms p95
  over twenty samples during the complete validation run, passing the one-second target.
- The focused responsive UI and browser checks passed in Chromium, WebKit, iPhone 14, and
  iPad Pro 11 profiles. Browser automation confirms functional responsiveness, not physical
  device CPU/memory performance.

The release performance task remains open. Deployed Lambda cold/warm p50/p95, API p95,
single-Region DynamoDB/API latency, production bundle transfer/runtime measurements,
real mobile Safari measurements, notification delivery latency, and full restore RTO need
AWS or physical-device evidence before production approval.

## Local rerun — 2026-07-23

- Argon2id at the required 102,400 KiB / parallelism 1 configuration measured 191.29 ms p50
  and 248.96 ms p95 over the latest local performance sample.
- The 50,000-task authorized local search fixture measured 85.65 ms p50 and 232.91 ms p95.
- The complete pre-AWS Vitest run passed 58 files / 188 tests, including recovery workflow,
  manifest/signature, infrastructure synthesis, security, integration, and performance suites.
- Chromium and WebKit passed 38 local journeys; four production-only canary cases were skipped
  because no deployed `PRODUCTION_BASE_URL` or protected smoke credentials were supplied.

Deployed API/Lambda/DynamoDB latency and isolated restore RTO remain AWS
evidence and keep T167 open.

## Local automation

`npm run test:performance` reruns the deterministic Argon2id and 50,000-task search budgets.
`npm run validate:pre-aws` runs the runtime, type, lint, complete Vitest, build, and CDK synthesis
gates in fail-fast order. `npm run validate:pre-aws:browsers` adds Chromium/WebKit when the local
Playwright browser binaries are installed. These commands deliberately do not claim Lambda/API,
CloudWatch delivery or restore timings without AWS evidence.

## Final pre-AWS rerun — 2026-07-23

- The Node.js 24 fail-fast sequence passed TypeScript, ESLint, 59 Vitest files / 196 tests,
  all workspace builds, and CDK synthesis.
- Argon2id verification measured 162.35 ms p50 / 213.72 ms p95 locally. The deployed
  `npm run calibrate:argon2 -- --function-name <name>` command now records content-free cold/warm
  evidence, but valid Lambda measurements remain an AWS gate.
- The 50,000-task authorized search fixture measured 105.84 ms p50 / 172.50 ms p95 in the
  complete Node.js 24 run.
- The complete Playwright matrix passed 76 local journeys across Chromium, desktop WebKit,
  iPhone WebKit, and iPad WebKit. Eight deployed-production canaries were intentionally skipped.
