# Native Apple final diff review

Reviewed on 2026-10-08 across the feature specification, plan, tasks, Swift packages and targets,
API/infrastructure changes, browser compatibility tests, release scripts, and operating documents.

## Outcome

No known code-level blocker remains in the automated implementation baseline. The build is not yet
eligible for a tester rollout because physical-device, signed-distribution, App Store Connect, and
hosted-CI evidence is still missing. Those external gates remain explicitly open rather than being
represented as passing.

## Findings resolved during review

- Native create/edit/lifecycle, timer reset/switch, sync enqueue, and Crisis Plan share/revoke paths
  now persist and consult mutation receipts. The measurable 1,000-operation replay workload passes
  with zero duplicate durable effects.
- The app no longer passes its app-group identifier as a Keychain access group. Default credentials
  now stay in the signed application's own Keychain access group; explicit groups remain available
  for a future correctly provisioned sharing requirement.
- A missing Keychain telemetry key or unreadable encrypted telemetry ring no longer terminates app
  launch. The client falls back to the bounded memory-only buffer and never writes plaintext.
- iPad requests now identify as `ipados`, while iPhone requests identify as `ios`; both apps read the
  real bundle build number and use the shared sync contract version for compatibility headers.
- Beta feedback no longer claims an in-app no-op uploaded feedback. It prepares content-free
  diagnostics and directs the tester to submit through TestFlight.
- The interop validator now satisfies repository lint rules, and its closed API-problem/sync-field,
  crypto-vector, and Chromium/WebKit drift checks pass.

## Review areas

| Area                       | Review result                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness and complexity | Shared command services are used by UI, alerts, and intents; duplicate mutation paths are covered by receipts. Feature packages remain separated by contract, crypto, persistence, sync, service, and UI responsibilities.                                     |
| Security and privacy       | Production-only HTTPS origin checks, CSRF/session handling, device-only Keychain policies, encrypted local stores/outbox/telemetry, authorization-negative tests, generic alerts, on-demand-only Siri, and protected-content exclusions pass automated checks. |
| Durability and recovery    | Atomic entity/outbox commits, idempotent replay, staged migration, interruption quarantine, low-storage behavior, account purge, four-client convergence, and runbooks are present and tested.                                                                 |
| Errors and logging         | API problems use a closed privacy-safe schema with bounded correlation data. Client telemetry uses the existing authenticated API and aggregate existing alarm path; failures do not recursively generate telemetry.                                           |
| Platform support           | Deployment is intentionally limited to iOS/iPadOS 27 and Apple-silicon macOS 27. iPhone, iPad, and native Mac shells and platform-specific navigation/window surfaces exist. Physical UI and Siri validation remains open.                                     |
| Browser compatibility      | Native sync interoperability passes on Chromium and WebKit; existing browser behavior remains covered. No required browser gate was expanded.                                                                                                                  |
| AWS cost                   | Existing resources are reused, there is no separate beta stack and no always-on service. Production usage variance must be measured after the gated smoke run.                                                                                                 |
| Tests and documentation    | Swift, TypeScript, Python, browser interoperability, archive validation, security/durability/observability/cost reviews, user docs, runbooks, and release templates exist. External release evidence is clearly marked pending.                                |

The complete `npm run validate` attempt passed runtime, typecheck, and lint and reported 1,010
passing tests, but three existing CDK stack setup hooks exceeded Vitest's 60-second worker limit
during concurrent synthesis. An isolated extended-hook attempt encountered the same worker-RPC
limit before assertions. `npm run build` passes. This host-level validation limitation is recorded
in the quickstart results and must be rechecked in hosted CI; it is not represented as a clean full-
suite pass.

## Remaining release blockers

1. Run and record the Siri corpus on representative iPhone, iPad, and Mac hardware (T080).
2. Record 250 ms layout, unobscured controls, VoiceOver, and Full Keyboard Access evidence (T131).
3. Configure and capture the authorized App Store Connect/TestFlight records (T149).
4. Archive, sign, upload, install, upgrade, smoke-test, and exercise rollback/stop-testing (T153).
5. Confirm the unchanged required validation duration in a hosted PR check for this diff (T166).
