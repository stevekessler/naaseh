# Validation results

Last updated: 2026-07-23

## Release-gate evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run validate` | Pass | Node 24 runtime, TypeScript, ESLint, 284 Vitest checks, and all production builds passed. The runner is capped at four workers so performance checks are not distorted by concurrent CDK bundling. |
| `npm run test:python` | Pass | 9 operator-command checks passed, including region restriction, overwrite protection, mode 0600, manifest verification, atomic rename, and acknowledgement. |
| `npm run test:e2e` | Pass | 116 browser checks passed across Chromium, WebKit, iPhone, and iPad; 8 production-deployment canaries were skipped because no production URL was supplied. |
| Enhanced browser matrix | Pass | All 36 `@enhanced-lists` journeys passed across Chromium, WebKit, iPhone, and iPad, including keyboard, touch, reduced motion, rejected audio, offline restart, file upload state, and horizontal-overflow checks. |
| `npm run test:performance` | Pass | 7 checks across 6 files passed. Measurements are recorded below. |
| `npm run test:observability` | Pass | 18 logging, redaction, metric, alarm, and dashboard checks passed. |
| `npm run cdk:synth` | Pass | `NaasehEdge` and `NaasehProd` synthesized, including private KMS/versioned attachment storage, GuardDuty scanning, export workflow, recovery validation, and 30 alarms. |
| `npm run validate:pre-aws` | Pass | Runtime, types, lint, 283-test gate at that run, production build, and CDK synthesis passed. The later final `npm run validate` includes the added performance evidence check. |

## Measured performance evidence

Measurements use Node 24.14.0 in the local release environment. They are regression evidence, not claims about deployed-network latency.

| Target | p50 | p95 | Result |
| --- | ---: | ---: | --- |
| 50,000-task local search | 56.217 ms | 66.991 ms | Pass, below 1 second |
| 1,000-item construction/reorder/total plus 100 deterministic copy IDs | 6.534 ms | 9.139 ms | Pass, below 250 ms |
| Completion and upload-progress acknowledgement calculation | 0.010 ms | 0.025 ms | Pass, below one 16 ms frame |
| 50,000-row CSV transformation | 43.744 ms | 52.840 ms | Pass, below 5 seconds |
| Argon2 local verification calibration | 131.356 ms | 135.046 ms | Pass, below 1 second |

The browser suite also proves visible upload progress, completion acknowledgement, and responsive list interaction end to end. Exact signed-URL and WAN transfer time remains deployment-dependent.

## User-story evidence

- US1 — independent lists: encrypted local repository, atomic outbox writes, restart/quota behavior, routing, pending-sync state, conflicts, multiple independent items, reorder, completion, removal, and exact totals pass automated coverage.
- US2 — global directory and values: active-user CRUD, signed cost/credit parsing, version conflicts, archive/replay, linked offline edits, overrides, reset-to-global, reindexing, and computed totals pass contract, integration, local-database, and browser checks.
- US3 — sharing and copy: owner/global/group/locked/admin precedence, non-disclosing direct reads, preserved group scope, revocation tombstones, administrator read-only access, deterministic child IDs, resumable checkpoints, hidden destination, attachment reference reuse, and deep links pass.
- US4 — encrypted attachments: parent-first authorization, initiate/complete/status/download/delete contracts, checksum and exact-version validation, scan ordering/retry/threat handling, offline deferral, cache exclusion, private KMS/versioned storage, GuardDuty, lifecycle cleanup, alarms, and restore mismatches pass local tests and synthesis.
- US5 — mixed search: All/Lists/To-do Lists filtering, grouped list results, offline search, locked/group/admin/revoked non-disclosure, directory-linked reindexing, and atomic purge-before-cursor behavior pass.
- US6 — completion feedback: shared task/list/post-it announcement, optional gesture-timed scrunch audio, rejected-playback handling, keyboard/pointer/touch completion, persistent cross-out, focus behavior, and reduced-motion behavior pass automated checks. Audible quality and hardware-mute behavior still require a person on physical Apple devices.
- US7 — to-do locking: optimistic concurrency, replay, private-task administrator read-only access, audit redaction, search/cache transitions, lock icons, and reduced viewport behavior pass.
- US8 — CSV export: job lifecycle, exact snapshot timestamp, deterministic rows, hidden-memo handling, attachment metadata without blobs/keys, bounded 50,000-row transformation, isolated KMS storage, private workflow IAM, exact S3-version deletion, acknowledgement, and under-24-hour expiry paths pass.

## Quickstart execution record

Every locally executable quickstart scenario was covered by the release gates above:

- Lists, costs, directory, offline restart, conflicts, copy, search, completion, locking, and responsive behavior ran in Vitest and the four-project Playwright matrix.
- Attachment lifecycle, failure, authorization, reconciliation, recovery invariants, and infrastructure controls ran with isolated fixtures, mocked signed transfers, security suites, and CDK assertions.
- CSV export ran through Python command tests plus contract, integration, security, performance, and infrastructure suites.
- Full restore fixtures validate list-item parents, directory records, blob references, clean scan state, exact S3 object versions, export manifests, authorization probes, RPO/RTO, retained key generations, and artifact hashes before exposure.

## External release checks

The local checks cannot substitute for control-plane or physical-device evidence. Before production release, an authorized isolated `us-west-2` deployment must still provide:

- live GuardDuty malware findings and real signed-URL byte round trips;
- AWS Backup quarterly DynamoDB/S3 restore-job evidence and reconciliation of restored objects;
- delivered CloudWatch alarms, IAM-denial events, lifecycle deletion, and current AWS cost/pricing review;
- native Safari/PWA audible timing, hardware-mute behavior, and physical iPhone/iPad confirmation.

These are documented operational release checks rather than unfinished implementation tasks. The production Playwright canaries remain available by setting `PRODUCTION_BASE_URL`.
