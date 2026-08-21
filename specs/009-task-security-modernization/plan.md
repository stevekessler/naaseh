# Implementation Plan: Task Security and Experience Modernization

**Branch**: `codex/009-task-security-modernization` | **Date**: 2026-08-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-task-security-modernization/spec.md`

## Summary

Modernize account security and the task-management experience without replacing the current session protocol or AWS topology. Add optional TOTP for users and mandatory TOTP for administrators, PIN-based password reset, an audited recovery-operator workflow, an offline-capable owner-private synchronized timer, modal task editing with limited structured rich text, accessible searchable references, browser-local due/report behavior, drag-enhanced personal ranking, profile/administration separation, complete server-generated completion CSV, and the requested list, priority, table, and post-it refinements.

The implementation extends the existing React/Dexie encrypted outbox, versioned sync, Node Lambda/API Gateway, on-demand DynamoDB, KMS, S3/Step Functions export, CloudWatch, PITR, and AWS Backup patterns. Device-bound sessions remain explicitly deferred. Security operations and administration remain online-only; task, timer, rank, memo, list-item, and color mutations retain visible offline persistence and conflict handling.

## Technical Context

**Language/Version**: TypeScript 5.8.3 in strict mode on Node.js 24; React 19.1.1

**Primary Dependencies**: Existing React/Vite, Dexie, MiniSearch, Zod, AWS SDK v3, AWS CDK, Argon2, and PWA stack; add a maintained RFC 6238 TOTP library, `downshift` for a shared ARIA combobox, Lexical React/rich-text/list packages for the constrained memo editor, and current dnd-kit React/DOM packages for pointer/touch ranking. Pin and verify React 19/browser compatibility before implementation.

**Storage**: Existing KMS-encrypted on-demand DynamoDB single-table records, immutable revisions/mutation receipts/owner feeds, S3 export results, and encrypted IndexedDB/Dexie. Add TFA factor and login-transaction records, one deterministic timer aggregate per user, structured memo/color/date fields, completion-export jobs, and Dexie schema version 11 timer/current-schema migration.

**Testing**: Vitest 3.2.6, Testing Library, Playwright 1.61.1 with Chromium and WebKit, axe, API/contract/infrastructure tests, migration/restore validation, performance and observability checks

**Target Platform**: AWS serverless web application delivered through CloudFront/S3 with API Gateway HTTP API and bounded Node.js Lambdas

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including supported iPhone/iPad versions and touch viewports

**Project Type**: TypeScript monorepo web application with React PWA, Lambda API, shared domain/contracts, and AWS CDK infrastructure

**Performance Goals**: Cached task modal and timer usable within 1 second; local editor feedback within 100 ms; local rank feedback within 200 ms; 1,000 cached combobox choices filtered within 200 ms; bounded initial presentation for 10,000 report/user rows within 2 seconds; timer state within 2 seconds of timestamp-derived truth after recovery; required hosted PR validation remains at or below 10 minutes.

**Constraints**: No device-bound-session behavior; no always-on compute; no plaintext credentials, TFA material, hidden memo content, or private object access in storage/logs/exports; one personal timer aggregate per account; no silent offline loss; stable current due instants and legacy off-grid times; fixed safe rich-text and color vocabularies; accessible non-drag ranking alternative; CSV formula neutralization and authorization per row/field.

**Offline Strategy**: Cache authorized task/timer/reference data in encrypted Dexie. Apply task, timer, ranking, memo, list amount, and post-it mutations optimistically in an atomic transaction with an encrypted outbox entry. Extend sync to contract version 5 for timer semantic commands and preserve existing visible pending/conflict/reapply/discard behavior. Derive timer progress from persisted UTC anchors plus server-time offset, never a decrementing counter. Security, administration, Google setup, and server exports fail clearly while offline and are never queued or cached by the service worker.

**Security & Data Boundaries**: TOTP seeds are KMS ciphertext restricted by encryption context; recovery codes are one-time high-entropy digests; pre-auth login transactions are opaque, five-minute, rate-limited, and single purpose. Only the user controls their profile/factor/timer; administrators manage system records but receive no factor, hidden-memo, or personal-timer access. A separate IAM recovery operator can reset an administrator factor through an audited, session-revoking workflow. Task/list/report authorization remains server-enforced; CSV reauthorizes each record and field. Session epoch changes revoke all sessions after password/factor recovery or factor-state changes, while the existing opaque application session format remains unchanged.

**AWS Architecture & Cost Impact**: Reuse API Gateway, request-driven Lambdas, the existing on-demand DynamoDB table, runtime KMS key, CloudFront/WAF, S3/KMS/Step Functions export workflow, CloudWatch/SNS, PITR, and AWS Backup. Add one low-concurrency IAM-invoked recovery Lambda and CloudTrail data-event coverage; no scheduler, WebSocket, Redis, RDS, Cognito, new table, per-user Secrets Manager record, or always-on service. Costs scale with sign-ins/KMS decrypts, sync mutations, the read-only Extra Low inventory, export rows/storage, WAF evaluation, CloudTrail data events, logs, metrics, and alarms. Passive timer ticks and repeat intervals produce no AWS traffic.

**CloudWatch Observability**: Extend the existing 90-day structured auth/sync/export logs and dashboards with safe TFA/reset/recovery outcomes, timer actions/conflicts/failures/latency/clock anomalies, Extra Low inventory/removal-guard outcomes, administration denials, and completion-export lifecycle/checksum failures. Use correlation IDs, bounded counts, action/outcome classes, latency, version, and safe conflict reasons. Exclude credentials, codes, factor state detail, user search terms, raw IPs/usernames, user/task IDs where unnecessary, task labels/memos, timer anchors/payloads, CSV rows, object paths, and protected data. Alarm on sustained abuse/failure rates, invariant violations, recovery failure, a nonzero Extra Low inventory, and export integrity failures.

**Scale/Scope**: Existing small deployment (about 50 provisioned users) designed and tested for 1,000 cached reference choices, 10,000 user/report rows, multi-device offline use, and current task/list/export data volumes without changing the service topology.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Security and data boundaries — PASS**: Actor capabilities, online-only security trust boundaries, KMS context, digest-only recovery material, server authorization, recovery-operator separation, session revocation, hidden memo handling, export exclusions, and negative tests are explicit.
- **Data durability and observability — PASS**: Every mutation uses atomic current/revision/outbox or current/revision/receipt/feed patterns; migrations are compatible, idempotent, verified, and restorable; conflicts and failures remain visible; structured CloudWatch coverage excludes protected content.
- **Browser offline operation and resynchronization — PASS**: Task-related and timer changes are encrypted and durable offline, sync is versioned with visible pending/conflict states, access revocation purges identifying timer data, and online-only security/admin/export actions never claim offline success.
- **Supported browsers — PASS**: Native modal semantics, maintained headless/editor/drag packages, keyboard fallbacks, touch/zoom/reduced-motion requirements, and Chromium/WebKit desktop/iPhone/iPad tests are specified. Browser background execution is not a correctness dependency.
- **Automated testing — PASS**: Domain/migration unit, contract/API/infrastructure integration, Dexie upgrade, component accessibility, and targeted/exhaustive Playwright coverage are planned. Required quick validation remains representative and subject to the repository's measured ten-minute budget.
- **Performance and AWS architecture — PASS**: Measurable client and 10,000-row goals are carried forward. The design reuses managed serverless services and adds no always-on component; incremental request, KMS, export, WAF, CloudTrail, and telemetry cost drivers are documented.
- **Simplicity, review, comments, and documentation — PASS**: Three focused client dependencies replace browser-sensitive custom widgets; existing persistence/sync/export/operator patterns are reused. Tasks must include final-diff review, invariant/security comments, runbook updates, and contract/architecture documentation.

**Post-design re-check**: PASS. The data model and contracts define owners, encryption, state transitions, retries, conflicts, migrations, browser constraints, CSV authorization/safety, recovery, backup, and observability. No exception or constitution violation remains.

## Project Structure

### Documentation (this feature)

```text
specs/009-task-security-modernization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api.openapi.yaml
│   ├── completed-task-csv.md
│   ├── sync-protocol.md
│   └── ui-contracts.md
└── tasks.md                 # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── auth/            # Login transaction, TOTP, reset, session enforcement
│   │   ├── admin/           # User table paging and operator patterns
│   │   ├── tasks/           # Task schema/memo/date/color and migration
│   │   ├── ranking/         # Existing personal stack mutation service
│   │   ├── sync/            # Timer entity and sync v5 dispatcher/feed
│   │   ├── reporting/       # Browser-local filters and export request
│   │   └── exports/         # Versioned complete CSV generation/results
│   └── test/
└── web/
    ├── src/
    │   ├── app/             # Profile/admin/directory routes
    │   ├── db/              # Dexie v11, encrypted timer and migrations
    │   ├── sync/            # Timer conflict/reapply and v5 protocol
    │   ├── crypto/          # Hidden memo document payload
    │   └── features/        # Auth, task dialog/editor, timer, stacks, reports,
    │                        # profile, admin table, lists, post-its
    └── test/

packages/
├── domain/src/              # Versioned entities, validators, state machines
├── contracts/src/           # Zod API/sync/export request contracts
└── observability/src/       # Safe structured events and metrics

infra/
├── lib/                     # API/admin/migration/export/observability stacks
└── test/

tests/
└── e2e/                     # Representative quick plus exhaustive browser journeys
```

**Structure Decision**: Extend the existing monorepo boundaries rather than introduce a new service. Shared domain rules and wire schemas live in `packages`, request/persistence enforcement in `apps/api`, encrypted offline projections and accessible UI in `apps/web`, AWS changes in `infra`, and risk-appropriate browser journeys in `tests/e2e`.

## Complexity Tracking

No constitution violations require an exception. The three client dependencies and one recovery Lambda have concrete present needs documented in [research.md](research.md); all data and compute remain within existing architectural boundaries.
