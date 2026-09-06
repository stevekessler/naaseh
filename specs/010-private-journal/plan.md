# Implementation Plan: Private Journal and Wellness Dashboard

**Branch**: `010-private-journal` | **Date**: 2026-08-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-private-journal/spec.md`

## Summary

Add a daily private journal, configurable wellness and DBT questions, encrypted rich-text task reflections, date browsing, and client-computed trend cards while preserving a stronger boundary than ordinary task data: journal plaintext, dates, answers, task associations, preferences, and derived dashboard values never reach ordinary server, administrator, logging, export, or backup paths.

The browser generates one versioned Journal Master Key (JMK) per owner, derives per-record AES-256-GCM keys and an opaque date-identity key, and retains the unwrapped JMK only in a short owner unlock session. The existing encrypted Dexie/outbox, versioned owner feed, on-demand DynamoDB, API Gateway/Lambda, KMS recovery, CloudWatch, PITR, and AWS Backup patterns are extended with ciphertext-only journal entities. A two-party recovery workflow lets a strongly reauthenticated owner request and a strongly reauthenticated recovery administrator approve a one-use JMK rewrap to the owner's ephemeral browser key; the administrator never receives journal plaintext or the recovered key.

## Technical Context

**Language/Version**: TypeScript 5.8.3 in strict mode on Node.js 24; React 19.2.8

**Primary Dependencies**: Existing React/Vite PWA, Dexie 4, Zod 3, Web Crypto, `hash-wasm` Argon2id, Lexical 0.49, Downshift 9, AWS SDK v3, and AWS CDK; add pinned `@lexical/link` 0.49.0 for safe journal links

**Storage**: Existing customer-managed-KMS-encrypted, pay-per-request DynamoDB single table with PITR and locked AWS Backup; application-layer ciphertext for journal key envelopes, profiles, projections, bodies, mutation receipts, feeds, recovery requests, and signed audit events; encrypted IndexedDB/Dexie schema version 12 for local journal projections, bodies, profiles, outbox items, and conflicts

**Testing**: Vitest 3.2.6, Testing Library, Playwright 1.61.1 with Chromium/WebKit/iPhone/iPad, axe, Zod/OpenAPI contract tests, API/integration/security/infrastructure tests, migration and restore validation, performance and observability tests

**Target Platform**: AWS serverless web application delivered through CloudFront/S3 with API Gateway HTTP API and bounded Node.js Lambdas

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including supported iPhone/iPadOS versions and touch viewports

**Project Type**: TypeScript monorepo web application with React PWA, Lambda API, shared domain/contracts, and AWS CDK infrastructure

**Performance Goals**: On representative mobile hardware and ordinary broadband, 95% of unlocked journal list, entry, and seven-day dashboard views usable within 2 seconds and online save acknowledgement within 2 seconds; degraded-network views usable or accurately pending within 5 seconds; paired numeric and editor controls respond locally within 100 ms; initial encrypted projection bootstrap/decryption remains responsive for 3,650 daily entries and is performance-tested through 10,000 entries; required hosted PR validation remains at or below 10 minutes

**Constraints**: Only the date is required; one entry per owner/local date; create/update only with no deletion/export/search; no plaintext journal dates, values, notes, task IDs, preferences, aggregates, wraps, or reason text in ordinary server paths or logs; no server-side journal aggregation; no silent overwrite; no always-on compute; no background-sync correctness dependency; local drafts are never truncated and remain recoverable if a ciphertext body exceeds the conservative 300 KiB server envelope budget

**Offline Strategy**: A previously authorized owner unlocks a PIN-wrapped JMK locally. The browser atomically persists ciphertext projection/body/profile records plus encrypted outbox mutations, confirms local durability separately from server synchronization, and retries on app start, focus, reconnect, and manual action. Pull cursors advance atomically with ciphertext changes. Strict base-version conflicts preserve both encrypted variants and require owner resolution after unlock; date-token collisions direct the user to the existing day. Pending, retry, conflict, storage-health, and locked states remain visible. Service-worker background execution is an optimization only.

**Security & Data Boundaries**: The owner browser's short unlocked session and the isolated recovery Lambda's transient buffer are the only key/plaintext boundaries. Ordinary API, sync, admin, reporting, export, notification, Google integration, DynamoDB, streams, backups, CloudWatch, and durable browser storage receive ciphertext or opaque routing fields only. Each random entry ID is paired with `HMAC(dateIdentityKey, YYYY-MM-DD)` for owner/date uniqueness without date disclosure. Recovery requires owner initiation, recent password verification, CSRF binding, a one-use browser public key, a five-minute request, a designated recovery administrator's fresh password plus TFA, exact-request approval, one-time consumption, session-epoch binding, and a signed tamper-evident audit chain. No recovery response or administrator UI receives plaintext or an unwrapped JMK.

**AWS Architecture & Cost Impact**: Reuse the existing HTTP API, request-driven Lambdas, on-demand single-region DynamoDB table, data/recovery/signing KMS keys, PITR, AWS Backup, CloudTrail, CloudWatch, SNS alarms, WAF, and CloudFront/S3. Extend the existing low-concurrency crypto-recovery function and sync/API routes; add no table, search service, RDS, cache cluster, per-user KMS key, or always-on component. Principal incremental costs are ciphertext bytes, owner-feed transactions, API/Lambda requests, encrypted backup growth, bounded logs/metrics, and rare KMS decrypt/sign calls during recovery. Client-computed dashboards and one shared recovery key are cheaper than materialized server aggregates, a per-user KMS key, or provisioned compute.

**CloudWatch Observability**: Extend 90-day structured journal/sync/recovery log groups with allowlisted operation, outcome, latency bucket, schema/key version, retry/conflict class, safe correlation/request/approval IDs, and bounded failure counts. Exclude dates, answers, notes, DBT choices, task associations, dashboard values, ciphertext, IVs, salts, wraps, public keys, reason text, request/response bodies, decrypted keys, and exception serialization. Metrics and alarms cover authorization denials, save/sync/conflict rates, key/decryption failures, recovery denials/replay/failures, audit-chain failure, schema migration failure, and backup/restore validation. Durable recovery audit rows use conditional append, previous-event hashes, and a KMS-signed terminal chain head.

**Scale/Scope**: Current small deployment (tens of provisioned accounts), designed for one compact projection per owner per day, 3,650 entries per owner over ten years, and performance-tested to 10,000 entries per owner. Bootstrap and feeds paginate in bounded batches; rich-text bodies load only for an opened entry. This is a private personal-wellness feature, not a diagnosis, clinical alerting, clinician-sharing, or regulated-records claim. A separate legal/compliance review is required before deployment on behalf of a covered or regulated organization.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Security and data boundaries — PASS**: The design identifies all journal data and derivatives, makes the owner browser the ordinary plaintext boundary, uses application-layer authenticated encryption and opaque date tokens, denies ordinary administrators, isolates recovery, and defines negative tests for direct IDs, feeds, backups, caches, logs, task references, and recovery misuse.
- **Data durability and observability — PASS**: Atomic encrypted local writes/outbox, conditional server transactions, mutation receipts, owner feeds, strict conflicts, resumable migrations, PITR/backup/restore, safe user errors, content-free structured telemetry, alarms, and signed recovery audits are explicit. No deletion path is introduced.
- **Browser offline operation and resynchronization — PASS**: Journal creation/editing/list/dashboard use encrypted local records after owner unlock; pending state survives restarts; foreground retry, atomic cursor advancement, date collisions, and explicit conflict resolution are testable without depending on background execution.
- **Supported browsers — PASS**: Native range/number/date/dialog semantics, a keyboard-capable Downshift combobox, Lexical structural editing, touch targets, safe areas, visibility locking, quota handling, and Chromium/WebKit/iPhone/iPad coverage are planned.
- **Automated testing — PASS**: Domain/crypto/property, Dexie migration/repository, API/contract/integration, security/restore/observability/infrastructure, component accessibility, and exhaustive browser coverage are planned. The required quick gate receives only one representative Chromium journey and remains subject to measured runtime controls.
- **Performance and AWS architecture — PASS**: Measurable 2-second/5-second/100-millisecond targets and 3,650/10,000-entry scales are explicit. Existing managed serverless resources are reused; incremental request/storage/KMS/logging costs and cheaper rejected alternatives are documented.
- **Simplicity, review, comments, and documentation — PASS**: Existing crypto, sync, repository, combobox, editor, dialog, reporting, recovery, and observability patterns are extended. The one new client package adds only missing safe-link support. Tasks must include final-diff re-review, security/invariant comments, recovery/restore runbooks, threat-model updates, and contract/architecture documentation.

**Post-design re-check**: PASS. [research.md](research.md), [data-model.md](data-model.md), the interface contracts, and [quickstart.md](quickstart.md) define ownership, encryption/AAD, key wrapping, recovery, create/update lifecycle, opaque uniqueness, retries, conflicts, offline storage, browser behavior, validation, performance, AWS cost, backup/restore, and protected-data exclusions. No exception or constitution violation remains.

## Project Structure

### Documentation (this feature)

```text
specs/010-private-journal/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── journal.openapi.yaml
│   ├── sync-protocol.md
│   ├── crypto-recovery.md
│   └── ui-contracts.md
└── tasks.md                 # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── journal/         # Ciphertext authorization/repository/sync/key-envelope handlers
│   │   ├── crypto-recovery/ # Two-party journal recovery and content-free audit chain
│   │   └── sync/            # Journal entity dispatch, receipts, feed, conflicts
│   └── test/
└── web/
    ├── src/
    │   ├── app/             # Lazy journal/list/entry/settings/dashboard routes
    │   ├── crypto/          # JMK enrollment, unlock, derivation, envelopes, recovery client
    │   ├── db/              # Dexie v12 journal repository/outbox/conflicts/migration
    │   ├── sync/            # Ciphertext journal push/pull and conflict resolution
    │   └── features/journal/# Forms, editors, task selector, list, dashboard, dialog, settings
    └── test/

packages/
├── domain/src/              # Journal entities, answer/document schemas, aggregates, crypto package
├── contracts/src/           # Journal/sync/recovery wire schemas
└── observability/src/       # Journal/recovery allowlists and permanent redaction

infra/
├── lib/                     # Journal routes/roles, recovery permissions, logs/metrics/alarms
└── test/

tests/
├── contract/
├── integration/
├── performance/
├── restore/
├── security/
└── e2e/                     # One quick Chromium journey; exhaustive browser/device variants
```

**Structure Decision**: Extend the existing monorepo and single-table/serverless boundaries rather than introduce a journal service or database. Shared validation/aggregation and wire contracts remain in `packages`; ciphertext-only persistence and recovery enforcement live in `apps/api`; owner-side cryptography, offline projections, and accessible UI live in `apps/web`; IAM/route/observability changes live in `infra`; risk-specific validation follows the existing `tests` layers.

## Complexity Tracking

No constitution violations require an exception. The JMK envelope, opaque keyed date token, separate projection/body ciphertexts, and two-party recovery state machine are necessary to satisfy owner-only ordinary access, offline use, arbitrary date dashboards, uniqueness, and administrator-assisted recovery simultaneously. Simpler server-side encryption, plaintext date indexes, server aggregates, and unilateral recovery fail explicit privacy requirements.
