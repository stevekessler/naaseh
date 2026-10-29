# Implementation Plan: Finance and Budget Management

**Branch**: `015-finance-budget-management` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-finance-budget-management/spec.md`

## Summary

Add a Finance area for individually owned and group-owned accounts, manually maintained accounts independent of SimpleFIN, reviewed CSV transaction imports, provisional manual transactions on SimpleFIN accounts, provider reconciliation, balance history, transactions and allocations, transfers, global merchant and finance-category catalogs, reusable and date-flexible budgets, matching, reconciliation, task links, and finance-aware search. The implementation extends the existing TypeScript domain and contracts, request-driven Lambda API, on-demand DynamoDB single table, audience-based synchronization, encrypted Dexie cache/outbox, React PWA, backup/restore workflow, and CloudWatch controls.

The design deliberately does not introduce MySQL, Aurora, a search cluster, a queue, or always-on compute. SimpleFIN v2 access runs only in an isolated finance-import Lambda. A claimed Access URL is encrypted with the existing runtime-secrets KMS key and stored only as ciphertext; browsers, ordinary API functions, logs, and synchronization payloads never receive it. Imports are asynchronous, idempotent, bounded to the provider's 90-day request window, overlap successful cursors by five days, and publish authorized changes through the existing sync feeds.

CSV files are parsed locally in a bounded Web Worker with an RFC 4180-compatible parser implemented in the finance domain, then previewed and mapped with either one signed amount column or separate debit/credit columns before accepted rows are submitted through chunked, idempotent sync mutations; raw file bytes are never retained or uploaded. Every suspected duplicate is walked through and explicitly included or excluded before confirmation. A manual account's current balance is derived from its latest dated balance snapshot plus strictly later transactions. SimpleFIN refresh evaluates provisional manual transactions before inserting provider transactions and attaches provider identity only when one candidate has exact normalized payee-or-description equality in addition to the account, currency, amount, and date predicates.

All destructive Finance commands are online-only and start with an authorization-filtered impact preview. Referenced records are archived or replaced by durable audit tombstones; permanent deletion is permitted only for an unreferenced draft or mistake. Finance exports are excluded from v1. The design targets no more than $5 per month in incremental AWS operating cost at the stated household scale; a higher forecast is a release gate requiring Steve's explicit approval.

## Technical Context

**Language/Version**: TypeScript 5.8.3 strict mode; Node.js 24 development and validation tooling; existing Node.js 22 AWS Lambda runtime; React 19.2.8

**Primary Dependencies**: Existing React/Vite, Dexie 4, MiniSearch 7, Zod 3, AWS SDK v3, AWS CDK 2, Vitest 5, Testing Library, and Playwright 1.61; built-in File, Web Worker, HTTPS/fetch, and Web Crypto capabilities; no new runtime framework or CSV dependency

**Storage**: Existing KMS-encrypted, on-demand DynamoDB single table with PITR, AWS Backup, two existing GSIs, audience feeds, revisions, and idempotency records; existing encrypted IndexedDB/Dexie cache and mutation outbox; SimpleFIN Access URLs encrypted by the existing runtime-secrets KMS key before DynamoDB persistence

**Testing**: Vitest unit/integration/contract/security/performance/restore tests; Testing Library component tests; Playwright Chromium/WebKit browser tests; 20-iteration throttled Chromium performance measurements; two-user moderated usability acceptance; CDK assertions; mocked SimpleFIN protocol fixtures with no live financial credentials

**Target Platform**: AWS serverless web application delivered by CloudFront/S3 with API Gateway HTTP API and bounded Node.js Lambdas in `us-west-2`; installable responsive PWA on desktop, iPhone, and iPad. Native Apple finance parity is outside this feature.

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including supported iPhone/iPadOS versions

**Project Type**: TypeScript monorepo web application with React PWA, Lambda API, shared domain/contracts, and AWS CDK infrastructure

**Performance Goals**: At the specified ceiling of 50 accounts, 100,000 accessible transactions, 20 active budgets, and five concurrent group members, the Finance landing page, merchant view, budget view, and filtered transaction search show useful content within two seconds at p95 across 20 Chromium measurements using a mid-range mobile profile, 4x CPU slowdown, 10 Mbps bandwidth, and 100 ms latency. Progress appears within one second for longer refreshes. Account/date transaction pages are cursor-bounded; local search indexing is incremental and must not block first content.

**Constraints**: Preserve exact monetary values as safe integer minor units paired with ISO 4217 currency and exponent; never combine currencies silently. Provider source fields and user-authored allocations remain separately authoritative. Allocation totals must equal the source transaction. CSV files are UTF-8 comma-delimited, at most 10 MB and 50,000 rows, parsed off the main thread, and committed in chunks of at most 100 rows. A batch chooses one amount layout: signed amount, or nonnegative debit/credit columns with exactly one nonzero value per row. Every suspected duplicate requires an include/exclude decision. Exact budget matching requires one unique candidate; near matches up to 20% are suggestions only. Automatic provider reconciliation additionally requires one same-account, same-currency, same-signed-amount candidate within three UTC calendar days and exact corresponding-field equality of either payee or description after Unicode NFC normalization, case folding, punctuation-to-space conversion, whitespace collapse, and trim. Authorization precedes aggregation, search, matching, task linking, and destructive impact calculation. Referenced records are never permanently deleted. Finance export is out of scope. Required hosted validation remains at or below ten minutes.

**Offline Strategy**: Cache authorized finance records in one encrypted Dexie finance-entity store with non-content indexes for entity type, account, scope, posted date, lifecycle, and update time. Queue user-authored transactions, CSV import batches, budgets, allocations, merchant/category associations, reusable items, and task links in the existing encrypted outbox. CSV selection, parsing, mapping, and preview work offline; committing accepted rows is queued until connectivity. External connection claims, SimpleFIN refreshes, destructive operations, provider reconciliation decisions, and budget reconciliation remain online-only. Reconnect processes revocation tombstones before reopening cached records, preserves source/user field ownership, and sends semantic concurrent edits to conflict review rather than silently overwriting them. Plaintext search indexes and CSV previews remain memory-only.

**Security & Data Boundaries**: Individual finance records use owner audiences; group finance records use active-group audiences; global merchant and finance-category identities use the authenticated public audience. Merchant activity, account identity, amounts, transactions, allocations, budgets, matches, reconciliation, import status, and financial task links remain protected. Active group members may add/edit manual transactions, commit CSV imports, and manage budgets/classifications; only group owners/managers may connect or reassign accounts and delete group financial records, including transactions. The task feed never carries a financial reference; a separate finance-audience link prevents broader task sharing from revealing finance metadata. SimpleFIN tokens and Access URLs are accepted only by the connection endpoint, validated against an HTTPS Bridge host allowlist with redirect revalidation, encrypted immediately, and excluded from responses and telemetry.

**AWS Architecture & Cost Impact**: Reuse the existing DynamoDB table, GSIs, KMS keys, API Gateway, Lambda topology, sync feeds, PITR, AWS Backup vault, restore testing, SNS alerting, and CloudWatch dashboards. Add one finance API Lambda and one asynchronously invoked finance-import Lambda with bounded concurrency; reuse the existing deletion workflow for large archival/tombstone cascades. Principal variable costs are DynamoDB transaction/feed writes, Lambda duration during imports, KMS encrypt/decrypt requests, logs, and backup growth. There is no new fixed-cost database or always-on compute. Direct KMS encryption avoids one Secrets Manager secret per connection (currently priced at $0.40 per secret-month) while preserving least-privilege decryption. A new relational database was rejected because the existing access patterns are bounded key/date queries plus local authorized aggregation. During Foundation, before any user-story implementation, the implementation-validation record must estimate normal incremental monthly cost at the reference scale; a forecast above $5 must identify cost drivers and cheaper alternatives and receive Steve's explicit approval before implementation continues. The estimate is verified again before release.

**CloudWatch Observability**: Use a retained 30-day finance application log group and structured events containing correlation ID, operation, outcome, duration bucket, entity type, counts, provider error class, and retry category. Never log tokens, Access URLs, credentials, CSV filenames or rows, account or merchant names, descriptions, memos, amounts, balances, search text, raw provider payloads, or unredacted identifiers. Emit metrics for SimpleFIN and CSV import starts/completions/partial failures, provider throttling/authentication failures, import latency, accepted/updated/duplicate-suppressed counts, provisional reconciliation outcomes, invariant failures, authorization denials, sync conflicts, and reconciliation invalidations. Alarm on invariant failures, repeated import failures, abnormal authorization denial rates, throttling, and Lambda/DynamoDB errors through the existing SNS alert path.

**Scale/Scope**: Household deployment with approximately 50 application users; design and performance validation cover 50 financial accounts, 100,000 accessible transactions, 20 active budgets, five concurrent group members, CSV files up to 10 MB/50,000 rows, up to 100 allocations per transaction, and cursor pages of at most 200 records. Bill payment, investments, tax workflows, exports, currency conversion, native-app finance UI, and non-Bridge SimpleFIN servers remain out of scope.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Security and data boundaries — PASS**: [research.md](research.md), [data-model.md](data-model.md), [contracts/finance.openapi.yaml](contracts/finance.openapi.yaml), and [contracts/sync.md](contracts/sync.md) define owner/group/global audiences, active-member transaction/import permissions, owner/manager deletion, separate task links, provider credential isolation, SSRF controls, reconciliation not-found behavior, encryption, revocation, and negative authorization behavior.
- **Data durability and observability — PASS**: Versioned conditional writes, SimpleFIN source identity locks and atomic transfers, separate entry/provider snapshots, CSV file/row/decision receipts, idempotent import jobs, immutable balance/reconciliation records, deterministic manual-balance baselines, allocation invariants, conservative provisional reconciliation, conflict review, referenced-record archival/tombstones, PITR, daily locked backups, quarterly restore testing, user-visible partial failures, redacted logs, metrics, and alarms are explicit. Recovery targets are RPO at most five minutes for accepted DynamoDB state and RTO at most four hours for the documented restore path; source transactions may also be re-imported without replacing user-authored state.
- **Browser offline operation and resynchronization — PASS**: Encrypted finance cache, queued supported edits, online-only boundary, freshness labels, tombstone-first revocation, conflict handling, and memory-only search are designed and covered by contracts and validation scenarios.
- **Supported browsers — PASS**: [contracts/ui.md](contracts/ui.md) defines progressive tables/cards, touch and keyboard operation, narrow iPhone/iPad layouts, status announcements, and current Chromium/WebKit coverage.
- **Automated testing — PASS**: Unit, integration, contract, security, restore, performance, and browser layers are assigned in [quickstart.md](quickstart.md). One representative finance journey may enter `test:e2e:quick`; exhaustive roles, devices, refresh failures, and large data remain in full browser/release gates. Test count and `/usr/bin/time -p npm run test:e2e:quick` must be recorded before and after any required-suite change, and hosted PR duration must remain at or below ten minutes.
- **Performance and AWS architecture — PASS**: The 20-iteration throttled mobile Chromium protocol, household-scale targets, cursor bounds, progressive indexing, existing on-demand AWS services, $5 incremental monthly target and approval gate, variable cost drivers, and rejected RDS/Aurora/search alternatives are documented. No always-on component is introduced.
- **Simplicity, review, comments, and documentation — PASS**: The plan extends existing domain/repository/sync/UI patterns, uses one provider adapter, and adds only two request-driven functions. Tasks must include final-diff review, accurate invariant/security comments, provider operations documentation, cost review, and recovery validation.

**Post-design re-check**: PASS. The Phase 1 model and contracts preserve every gate. Eight bounded implementation risks require explicit tests rather than exceptions: SimpleFIN pending-to-posted identity changes may require user review when source identity changes; provisional reconciliation must use exact normalization and never merge fuzzy or ambiguous same-value transactions; every suspected CSV duplicate must receive an explicit decision; dated balance baselines must not double-count older transactions; large or malformed CSV parsing must remain bounded off the main thread; destructive previews must never reveal inaccessible dependents; referenced records must archive or tombstone rather than disappear; and throttled performance plus the $5 cost estimate must be recorded before release.

## Project Structure

### Documentation (this feature)

```text
specs/015-finance-budget-management/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── finance.openapi.yaml
│   ├── sync.md
│   └── ui.md
└── tasks.md                    # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
packages/
├── domain/src/finance/         # Money, account, transaction, CSV, budget, match, and reconciliation invariants
└── contracts/src/finance.ts    # HTTP/sync schemas and redacted response shapes

apps/api/src/finance/
├── authorization.ts            # Owner/group role and cross-entity access checks
├── handlers.ts                 # Authenticated finance HTTP routes
├── repository.ts               # Single-table keys, queries, conditional transactions, cursors
├── account-service.ts          # Accounts, assignments, balances, and destructive previews
├── transaction-service.ts      # Transactions, allocations, transfers, and catalogs
├── budget-service.ts           # Budgets, totals, and account links
├── matching-service.ts         # Reusable items and transaction matches
├── reconciliation-service.ts   # Immutable budget reconciliation
├── deletion-service.ts         # Archive/tombstone/permanent-delete policy enforcement
├── task-link-service.ts        # Independently authorized task links
├── simplefin-client.ts         # Allowlisted v2 claim/accounts adapter and safe error mapping
├── import-handler.ts           # Async idempotent import execution and progress
└── telemetry.ts                # Protected-data-safe events and metrics

apps/web/src/
├── app/                        # Finance routes and top-level navigation
├── db/                         # Encrypted finance entity repository and schema migration
├── features/finance/           # Accounts, transactions, merchants, budgets, matching, reconciliation
├── features/finance/csv/       # Worker parser, mapping, preview, row validation, and chunked commit
├── features/search/            # Tasks/lists/transactions/merchants include toggles
├── search/                     # Incremental memory-only transaction/merchant index
└── sync/                       # Finance hydration, outbox, conflicts, and revocation purge

infra/lib/
├── api-stack.ts                # Finance API/import functions, routes, least-privilege grants
├── observability-stack.ts      # Finance metrics, dashboard widgets, and alarms
├── backup-stack.ts             # Finance restore-test tags and validation coverage
└── deletion-stack.ts           # Resumable finance account cascade extension

tests/
├── contract/                   # HTTP and sync contract/version coverage
├── integration/                # Repository, CSV/provider import, reconciliation, sync, and task-link workflows
├── security/                   # Authorization, SSRF, secret/log, search, aggregate, and cache isolation
├── restore/                    # Finance record and encrypted credential recovery validation
├── performance/                # 100k transaction search/render/import projections
└── e2e/                        # Representative quick journey plus exhaustive Chromium/WebKit variants
```

**Structure Decision**: Extend existing monorepo boundaries. Put financial invariants, exact decimal conversion, CSV parsing rules, and reconciliation predicates in the domain package; wire validation in contracts; put authorization/persistence/provider access in the API; keep raw CSV parsing and preview inside a browser worker; maintain encrypted offline projections and UI in the web app; and wire AWS resources in the existing CDK stacks. Keep provider credentials and provider import execution outside the generic sync Lambda.

## Complexity Tracking

No constitution violation requires an exception. The isolated import Lambda is justified by credential least privilege, provider latency, asynchronous progress, and the need to prevent ordinary content handlers from decrypting Access URLs. Reusing the existing deletion state machine for large archival/tombstone cascades avoids introducing another orchestration service. The design adds no export surface and no always-on infrastructure; a projected normal incremental cost above $5 per month blocks release pending Steve's explicit approval.
