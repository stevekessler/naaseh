# Implementation Plan: Journal Recycle Bin

**Branch**: `[013-journal-recycle-bin]` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-journal-recycle-bin/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a recoverable lifecycle to encrypted Journal entries: owners can recycle and restore
entries online or offline, browse an owner-only recycle bin after unlock, and permanently
delete only recycled entries through the existing authoritative deletion workflow. The
implementation first repairs Journal pull/bootstrap synchronization and conflict visibility,
then adds an encrypted projection v2 with lifecycle metadata plus a minimal server-side
control state, versioned recycle/restore mutations, content-free tombstones, and journal-aware
deletion-ledger restore protection. Existing DynamoDB, Step Functions, Lambda, CloudWatch,
IndexedDB/Dexie, and encryption foundations are reused without always-on compute.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.8 on Node.js 24 for application code; AWS Lambda remains on the repository's managed Node runtime until the infrastructure baseline is upgraded

**Primary Dependencies**: React 19, Vite 7, Dexie 4, Zod, AWS SDK v3, AWS CDK, Step Functions, Web Crypto

**Storage**: Browser IndexedDB for encrypted local entries/outbox/conflicts; existing on-demand DynamoDB table for encrypted server records, owner feeds, jobs, and content-free deletion ledger; existing protected AWS backups

**Testing**: Vitest unit/contract/integration/security/restore tests; Playwright Chromium and WebKit; CDK assertions; timed quick-suite validation before and after any required-browser expansion

**Target Platform**: Responsive browser PWA backed by AWS Lambda/API Gateway/DynamoDB/Step Functions

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including relevant iOS/iPadOS versions

**Project Type**: TypeScript monorepo web application with shared domain/contracts, serverless API, infrastructure-as-code, and native clients that must reject unsupported protocol versions safely

**Performance Goals**: Local recycle/restore feedback under 200 ms; first recycle-bin page usable within 2 seconds broadband and 5 seconds degraded mobile for 1,000 recycled entries; required PR validation at or below 10 minutes

**Constraints**: Journal plaintext, dates, date tokens, ciphertext, keys, and confirmation tokens never enter logs/URLs/analytics; one entry per date across active and recycled state; hard deletion cannot be reversed or defeated by stale clients/backups; no new always-on service or GSI in the first implementation

**Offline Strategy**: Recycle and restore update the encrypted local entry and enqueue a durable versioned mutation. Reconnect drains the outbox and paginates owner-feed pulls without overwriting pending rows. Version mismatches preserve local ciphertext and lifecycle intent in a Journal-specific conflict record. Permanent deletion is refused offline and begins only after online preview and confirmation.

**Security & Data Boundaries**: Only the authenticated owner can read or mutate Journal ciphertext. User-visible lifecycle metadata is inside the encrypted projection; the API stores only an owner-scoped coarse lifecycle control state so it can authorize recycle/restore/delete and reject stale resurrection. The browser unlock gate controls decryption; the server cannot and does not claim to prove local unlock. Deletion leaves only content-free owner-scoped tombstone/ledger evidence. Crisis-plan readers, collaborators, administrators, ordinary task/list APIs, service workers, and telemetry receive no Journal plaintext.

**AWS Architecture & Cost Impact**: Reuse the existing on-demand DynamoDB table, API Gateway/Lambda Journal API, Standard Step Functions deletion state machine, KMS protection, backup/restore workflow, SNS alerting, and CloudWatch. Recycle/restore add a bounded transaction and feed write; permanent delete adds one state-machine execution plus bounded DynamoDB reads/deletes. At current single-user scale the incremental monthly cost is negligible. A new GSI was rejected initially because it would tax every write; bounded owner-partition queries are simpler and cheaper. No non-serverless component is added.

**CloudWatch Observability**: Extend existing structured Journal/deletion telemetry with correlation ID, operation/stage, outcome, safe error code, latency bucket, retry/conflict category, and aggregate counts. Exclude owner and entry identifiers where avoidable and always exclude dates/date tokens, ciphertext, plaintext, keys, tokens, and request bodies. Reuse three-month deletion workflow ERROR logs with execution data disabled, X-Ray, SNS failure alarm, and add alarms for timed-out/aborted/stranded deletion jobs using native metrics rather than polling compute.

**Scale/Scope**: Current single-user deployment, designed and tested for at least 1,000 recycled entries per owner. Scope includes web Journal, shared contracts/domain, API, serverless deletion/recovery, and compatibility failure behavior for old clients; native recycle-bin UI is outside this release.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Security and data boundaries**: Protected data, authorized actors, trust boundaries,
  secrets, encryption, and security validation are explicit.
- **Data durability and observability**: Persistence, validation, conflict, retry, recovery,
  backup/restore, user-visible errors, and detailed structured CloudWatch logging are
  addressed as applicable, with protected-data exclusions and retention/cost controls.
- **Browser offline operation and resynchronization**: Behavior without Internet access,
  browser-local change preservation, connectivity feedback, reconnection synchronization,
  and conflict handling are designed and testable without treating offline use as the primary mode.
- **Supported browsers**: Primary journeys are designed for current Chrome and
  Safari/WebKit, including relevant iPhone/iPad viewport and capability constraints.
- **Automated testing**: Unit, integration, contract, and Playwright Chromium/WebKit coverage
  is planned wherever each level provides meaningful risk coverage.
- **Performance and AWS architecture**: Measurable performance targets, AWS services, cost
  drivers, scaling assumptions, and simpler/cheaper alternatives are documented. Serverless
  options are evaluated first, and every non-serverless component is justified.
- **Simplicity, review, comments, and documentation**: Complexity is justified; final-diff
  re-review and required explanatory comments and documentation are planned.

Any non-applicable gate MUST include a brief rationale. Any violation MUST be resolved or
recorded in Complexity Tracking with Steve's explicit approval before implementation.

**Pre-design result**: PASS. Data boundaries, failure recovery, offline behavior, supported
browsers, measurable performance, serverless cost, observability, and validation limits are
explicit. The browser unlock requirement is enforced at the client cryptographic boundary;
the server authorizes ownership and state transitions without receiving an unlock secret.

**Post-design result**: PASS. Phase 1 keeps encrypted content local-to-owner, preserves
pending changes and conflicts, closes stale-client and backup resurrection paths, reuses
request-driven AWS services, and defines unit, integration, restore, security, and bounded
browser coverage. No constitutional exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
packages/domain/src/                 # Journal lifecycle, crypto, deletion schemas
packages/contracts/src/              # Versioned Journal sync and deletion contracts

apps/web/src/
├── db/                              # Dexie lifecycle/outbox/conflict persistence
├── sync/                            # Push, bootstrap/pull, tombstone handling
└── features/journal/                # Active views, recycle bin, confirmations

apps/api/src/
├── journal/                         # Authoritative lifecycle mutations and owner feed
├── deletion/                        # Journal preview and checkpointed hard purge
├── sync/                            # Version negotiation and Journal pull surface
└── crypto-recovery/                 # Ledger remediation and restore validation

infra/lib/                           # Existing API, deletion, observability, restore wiring

tests/
├── contract/                        # Protocol compatibility and shapes
├── integration/                     # Sync, deletion, retries, stale-client behavior
├── restore/                         # Ledger remediation and non-resurrection
├── security/                        # Authorization and protected-data exclusions
├── performance/                     # 1,000-entry projection/bin model
└── e2e/                             # One quick representative journey; full matrices elsewhere
```

**Structure Decision**: Extend the existing monorepo boundaries. Lifecycle semantics live in
the shared domain, wire compatibility in contracts, offline behavior in the web database and
sync layers, authoritative state/deletion in the API, and AWS resources in the current CDK
stacks. A separate service or datastore would add cost and consistency risks without meeting
a present need.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations or approved exceptions.
