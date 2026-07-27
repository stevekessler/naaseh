# Implementation Plan: Bidirectional Google Tasks Sync

**Branch**: `004-google-tasks-sync` | **Date**: 2026-07-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-google-tasks-sync/spec.md`

## Summary

Add owner-scoped, bidirectional synchronization between dated Na'aseh tasks and one selected
Google Tasks list. A dedicated Node.js Lambda handles OAuth callbacks, settings, previews,
conflicts, manual runs, and scheduled reconciliation. The existing DynamoDB stream feeds local task
changes into durable idempotent operations; five-minute EventBridge polling reads remote changes
with an overlap window because Google Tasks has no task-change push interface. Google credentials
are server-only, KMS encrypted or held in Secrets Manager. Shared fields use a three-way snapshot
merge; same-field divergence becomes a protected, user-visible conflict.

## Technical Context

**Language/Version**: TypeScript 5.8 on Node.js 24 Lambda and React 19 browser code

**Primary Dependencies**: Existing AWS SDK v3, Zod, React, Dexie, CDK, native Node.js `fetch` and
Web Crypto; direct Google OAuth 2.0 and Tasks REST calls without a new Google client dependency

**Storage**: Existing customer-managed-KMS DynamoDB single table with streams, PITR, TTL and GSI1;
Google OAuth client secret in a dedicated Secrets Manager secret; refresh tokens encrypted with the
existing application data KMS key using owner-bound encryption context

**Testing**: Vitest unit/integration/contract/security tests, CDK assertions, Playwright Chromium and
WebKit including iPhone/iPad-sized projects, existing validation/build/lint gates

**Target Platform**: AWS Lambda/API Gateway/EventBridge/DynamoDB/KMS/Secrets Manager/CloudWatch and
the existing installable offline PWA

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including relevant iOS/iPadOS versions

**Project Type**: TypeScript monorepo web application with serverless API and infrastructure-as-code

**Performance Goals**: User-triggered progress within 2 seconds; incremental runs of at most 100
changes converge within 60 seconds p95 without throttling; 5,000 linked tasks per user; paginated
initial preview and import

**Constraints**: Google due values are date-only; 50,000 default Tasks API queries/day; up to 100
items per list page and documented 20,000 non-hidden tasks/list; outbound requests require Internet;
provider timestamps are untrusted and coarse reconciliation uses a five-minute overlap; no Google
push channel is available for Tasks v1

**Offline Strategy**: Local task editing continues through the encrypted browser outbox. Integration
settings and last-known conflict/status summaries cache locally. Provider operations run only on the
server; offline UI states say they are waiting. Existing client resynchronization delivers imported
task changes and status summaries after reconnection.

**Security & Data Boundaries**: Only the owner may connect, configure, publish, import, resolve, or
disconnect their Google account. The sync Lambda alone reads the OAuth secret and decrypts refresh
tokens. OAuth state is random, short-lived, single-use, session-owner bound, redirect-bound, and
stored hashed. Only the `tasks` scope is requested. Titles, due dates, and conflict values are
protected data and excluded from logs. Hidden memos never cross the boundary; private tasks require
per-task consent. Provider JSON is strictly parsed and bounded.

**AWS Architecture & Cost Impact**: One on-demand Lambda serves API and reconciliation, one small
stream-consumer Lambda creates local operations, one five-minute EventBridge schedule triggers
bounded batches, and the existing table/key/logging are reused. A dedicated OAuth secret adds about
one secret plus API calls; Lambda, DynamoDB, EventBridge, KMS and logs remain pay-per-use. At 10 users
and 100,000 total tasks, empty polling is about 2,880 Google list requests/day plus OAuth and changed
pages, below the documented 50,000 default daily courtesy limit. Principal AWS costs are Lambda
duration, DynamoDB reads/writes, KMS token decrypts, secret reads, and CloudWatch ingestion. A
15-minute schedule is the cheaper fallback but misses the 10-minute detection target. No always-on
compute is introduced.

**CloudWatch Observability**: A retained one-month sync log group receives redacted structured events
with correlation/run/connection/link IDs, operation class, direction, outcome, latency, retry count,
HTTP status class and checkpoint age. Embedded metrics and alarms cover auth failures, revocation,
throttling, run failure, lag, stalled checkpoints, conflicts and quarantines. Titles, dates, notes,
snapshots, OAuth data, Google account email and raw provider bodies are permanently excluded.

**Scale/Scope**: Initial production target is 10 users, one connection/list per user, 5,000 linked
tasks per typical user and 100,000 total tasks. The provider supports larger lists, but the acceptance
performance fixture is 5,000 links/user and scheduled concurrency is capped to protect quota.

## Constitution Check

*GATE: Passed before research and passed again after Phase 1 design.*

- **Security and data boundaries — PASS**: Owner-only actions, least-privilege functions, Google
  scope, KMS encryption context, Secrets Manager, strict provider parsing, CSRF/OAuth-state checks,
  log exclusions, private consent and revocation are explicit.
- **Data durability and observability — PASS**: Stream delivery, idempotent operations, three-way
  snapshots, overlap checkpoints, conflicts, quarantine, retry, PITR/backup behavior, restore
  revalidation, user feedback and CloudWatch signals are defined.
- **Browser offline operation and resynchronization — PASS**: Core tasks remain offline capable;
  external work is queued server-side and status/imported changes use existing resynchronization.
- **Supported browsers — PASS**: Full-page OAuth redirect, responsive settings/preview/conflict UI,
  accessibility and Chromium/WebKit desktop/mobile coverage are planned.
- **Automated testing — PASS**: Unit, integration, contract, security, infrastructure, recovery,
  performance and Playwright tests map to the risky state transitions.
- **Performance and AWS architecture — PASS**: Targets, provider quota, serverless services, scale,
  cost drivers, concurrency bounds and the cheaper 15-minute alternative are documented.
- **Simplicity, review, comments, and documentation — PASS**: Native REST avoids a large dependency;
  the design reuses the table, stream, KMS, sync feed and UI patterns. Final diff/security review,
  non-obvious invariant comments and operator/user docs are planned.

## Project Structure

### Documentation (this feature)

```text
specs/004-google-tasks-sync/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── google-tasks-sync.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
packages/domain/src/
├── google-sync.ts
└── index.ts

packages/contracts/src/
├── google-sync-openapi.ts
└── index.ts

apps/api/src/google-sync/
├── auth-service.ts
├── google-client.ts
├── handler.ts
├── merge-service.ts
├── repository.ts
├── run-service.ts
├── scheduled-handler.ts
├── stream-handler.ts
└── telemetry.ts

apps/web/src/features/google-sync/
├── GoogleSyncPage.tsx
├── GoogleSyncPreview.tsx
├── GoogleSyncConflicts.tsx
└── google-sync-client.ts

infra/lib/
├── google-sync-stack.ts
├── api-stack.ts
├── naaseh-stack.ts
├── secrets-stack.ts
└── observability-stack.ts

tests/
├── contract/google-sync.contract.test.ts
├── integration/google-sync-*.test.ts
├── security/google-sync.security.test.ts
└── performance/google-sync-performance.test.ts

tests/e2e/google-sync.spec.ts
infra/test/google-sync.test.ts
docs/user/google-tasks-sync.md
docs/operations/google-tasks-sync.md
```

**Structure Decision**: Extend the existing domain/contracts workspaces, serverless API, React PWA,
CDK stack, and layered test layout. The integration is isolated in `google-sync` feature folders;
shared task lifecycle and sync-feed code is changed only where provider-origin mutations must reuse
existing durable semantics.

## Complexity Tracking

No constitution violations require an exception. Two Lambda entry points are justified: the stream
consumer needs no Internet credentials and may only enqueue owner-scoped operation IDs, while the
reconciler needs OAuth/KMS/secret access but no DynamoDB stream permission. This separation reduces
credential blast radius.
