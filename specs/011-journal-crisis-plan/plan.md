# Implementation Plan: Journal Crisis Plan

**Branch**: `011-journal-crisis-plan` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-journal-crisis-plan/spec.md`

## Summary

Extend the private journal from feature 010 with one encrypted WYSIWYG crisis plan per owner, a hard prerequisite for every new journal-entry creation, inline display whenever either crisis-related behavior answer is `yes`, and immediate read-only sharing to selected active users through the `Crisis Plans` tab. Owners retain encrypted offline access; recipients must be online and are never given an application-managed offline copy.

The browser encrypts the plan with a random Crisis Plan Content Key (CPK). The owner copy of that key is wrapped under the feature-010 Journal Master Key (JMK). For each active recipient, the owner browser encrypts a compact, identity-bound CPK grant with the signed public key of a dedicated RSA-3072 AWS KMS sharing key. A narrowly scoped online key-broker Lambda rechecks the recipient's current share, decrypts only that grant, and rewraps the CPK to a one-use browser public key; it never renders or logs plan plaintext. Owner revocation rotates the CPK, plan ciphertext, owner wrap, and every remaining recipient grant in one conditional DynamoDB transaction. The design reuses the existing React/Vite PWA, Lexical rich-text allowlist, encrypted Dexie/outbox, API Gateway/Lambda, pay-per-request DynamoDB, KMS registry/signing, PITR/AWS Backup, and CloudWatch patterns.

## Technical Context

**Language/Version**: TypeScript 5.8.3 in strict mode on Node.js 24; React 19.2.8

**Primary Dependencies**: Existing React/Vite PWA, Dexie 4, Zod 3, Web Crypto, Lexical 0.49 plus the feature-010 link/list packages, Select2 with its jQuery runtime wrapped behind a React lifecycle adapter for owner user selection, AWS SDK v3, and AWS CDK; no additional server runtime package is required by this feature

**Storage**: Feature-010 customer-managed-KMS-encrypted, pay-per-request DynamoDB single table with PITR and locked AWS Backup; application-layer AES-256-GCM crisis-plan ciphertext, owner key wrap, recipient grant ciphertext, share state, mutation receipts, and owner sync changes; encrypted IndexedDB/Dexie schema version 13 for owner plan, draft, conflict, and pending share/revocation intent only

**Testing**: Vitest 3.2.6, Testing Library, contract/security/integration/restore/performance suites, and Playwright 1.61.1 across Chromium, WebKit, iPhone, and iPad projects

**Target Platform**: Responsive installable web application on current desktop/mobile browsers; AWS API Gateway HTTP API, Lambda, DynamoDB, KMS, CloudWatch, CloudTrail, PITR, and AWS Backup in `us-west-2`

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including relevant iOS/iPadOS versions

**Project Type**: TypeScript monorepo web application with React PWA frontend, serverless API, shared domain/contracts packages, and CDK infrastructure

**Performance Goals**: 95% of Journal, owner/shared crisis-plan, trigger-display, and sharing views usable within 2 seconds on ordinary broadband and within 5 seconds or an accurate pending/loading state on degraded mobile; online save/share confirmation within 2 seconds; local editor and trigger response within 100 milliseconds

**Constraints**: Journal feature 010 is a prerequisite; plan plaintext and CPKs never enter ordinary API, admin, sync, logging, analytics, export, notification, URL, service-worker cache, or durable recipient-browser paths; no delete transition; no automatic alert/clinical workflow; direct share is immediately active; recipient reads require a fresh online authorization decision; owner user selection uses Select2 without exposing inactive or sensitive account fields; required PR validation must remain at or below ten minutes

**Offline Strategy**: The unlocked owner decrypts the CPK from its JMK-wrapped owner wrap and atomically stores plan ciphertext plus an encrypted outbox mutation. Owner edits, conflicts, and share/revocation intents survive restart as encrypted local state and visibly remain pending. Reconnect/app-focus/manual retry drains them; conflicting plan versions preserve both ciphertext variants. Recipient lists, plan ciphertext, rewrapped keys, plaintext, and open-session keys are memory-only, require `navigator.onLine` plus a current authenticated response, and are cleared on offline, route leave, tab hide, logout, or session revocation.

**Security & Data Boundaries**: The owner browser and an active recipient's visible online browser session are the only plan-plaintext boundaries. The dedicated sharing-key broker transiently handles a 256-bit CPK only, checks owner/plan/recipient/share/key-generation bindings before and after KMS decryption, rewraps it to a one-use non-extractable recipient browser key, returns `Cache-Control: no-store`, and has no logging of bodies, ciphertext, public keys, grants, or key material. Ordinary APIs store/route ciphertext and state only. Owner revocation performs forward key rotation; recipient self-removal denies server delivery immediately and marks owner rekey required before the next plan update or share mutation. Ordinary administrators, recovery operators, unrelated users, revoked/removed recipients, service workers, exports, reports, notifications, and offline recipient storage cannot read content.

**AWS Architecture & Cost Impact**: Reuse the existing API Gateway, on-demand Lambda, single DynamoDB table, authorizer, CloudWatch, PITR, AWS Backup, and manifest-signing key. Add one asymmetric RSA-3072 KMS encryption key, its signed public registry entry, and one dedicated on-demand key-broker Lambda/route. Principal incremental costs are the KMS key's fixed monthly storage charge, asymmetric decrypt requests per shared-plan open, Lambda/API requests, DynamoDB share/grant reads and conditional transactions, backup bytes, and bounded log metrics. Current scale is tens of accounts, one plan per owner, and at most 90 simultaneous recipients per plan so a key rotation remains within DynamoDB's 100-action transaction limit. Performance targets must first be met through browser responsiveness, bounded payloads, indexes, pagination, caching that respects privacy, and tuning of the existing on-demand services; materially higher recurring AWS cost or always-on capacity requires explicit user approval with measured evidence. A browser-managed per-user key directory avoids the KMS fixed charge but is rejected because it cannot guarantee immediate sharing to any active account, simple recovery, and online-only recipient access. Reusing the recovery key is cheaper but rejected because it expands recovery-key purpose and permissions.

**CloudWatch Observability**: Add 90-day structured crisis-plan/key-broker log groups or namespaces with allowlisted operation, outcome, latency bucket, schema/key/share generation, retry/conflict class, safe correlation/mutation IDs, and bounded counts. Exclude rich text, journal answers, owner/recipient display values, plan/share IDs unless irreversibly allowlisted, ciphertext, IVs, owner wraps, recipient grants, public keys, CPK/JMK material, request/response bodies, and exception serialization. Metrics/alarms cover authorization denials, plan save/sync conflicts, share/revoke/remove failures, stale-generation/key-broker denials, KMS decrypt failures, local migration/storage failure, backup/restore validation, and anomalous broker volume. CloudTrail supplies KMS evidence.

**Scale/Scope**: Current small deployment with tens of provisioned accounts; one plan and one owner ciphertext record per user; expected formatted plan body below the feature-010 300 KiB encrypted-body ceiling; paginated online share/user lists; up to 90 active recipients per plan in this release; no recipient offline content, plan history UI, deletion, export, notification, clinician workflow, or regulated-care claim

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-design gate

- **Security and data boundaries — PASS**: The spec defines owner, active-recipient, revoked/removed-recipient, administrator, recovery, server, offline-device, and logging boundaries. Research must resolve share-key distribution and revocation without weakening feature 010.
- **Data durability and observability — PASS**: The plan requires atomic acknowledged saves, encrypted drafts/outbox, conditional versioning, retry receipts, conflict preservation, PITR/backup restoration, actionable errors, and content-free CloudWatch signals.
- **Browser offline operation and resynchronization — PASS**: Owner offline availability and pending changes are required; recipient content is explicitly online-only and purged on connectivity loss. Reconnect and conflict paths are testable.
- **Supported browsers — PASS**: Chrome, Safari/WebKit, iPhone, and iPad rich-text, Web Crypto, viewport, storage, keyboard/touch, and lifecycle paths are in scope.
- **Automated testing — PASS**: Domain, crypto, API, contract, security, sync, restore, performance, accessibility, and browser journeys are planned. Required quick-suite growth is bounded and measured below.
- **Performance and AWS architecture — PASS**: User-visible targets are measurable; managed serverless services are used first; cost drivers and cheaper alternatives are explicit.
- **Simplicity, review, comments, and documentation — PASS**: The design extends feature-010 primitives. New key-broker complexity is tied directly to immediate encrypted sharing and online revocation, with protocol/runbook documentation and final-diff review required.

### Post-design gate

- **Security and data boundaries — PASS**: [crypto-sharing.md](contracts/crypto-sharing.md) binds every CPK grant to owner, plan, recipient, share version, and key generation; [crisis-plan.openapi.yaml](contracts/crisis-plan.openapi.yaml) reauthorizes each recipient open and returns no-store ciphertext plus an ephemeral-key rewrap. Revocation rotates the CPK atomically. Recipient durable/offline content is prohibited.
- **Data durability and observability — PASS**: [data-model.md](data-model.md) defines conditional state transitions, mutation receipts, local drafts/conflicts, rekey-required state, backup invariants, and no-delete rules. [quickstart.md](quickstart.md) covers interruption, replay, restore, and telemetry inspection.
- **Browser offline operation and resynchronization — PASS**: [sync-protocol.md](contracts/sync-protocol.md) separates owner ciphertext sync from live recipient reads and defines retry/conflict/pending revocation semantics.
- **Supported browsers — PASS**: [ui-contracts.md](contracts/ui-contracts.md) covers Lexical allowlisting, immediate trigger display, online-only recipient teardown, accessibility, safe-area/keyboard/orientation behavior, and current Chromium/WebKit device classes.
- **Automated testing — PASS**: The validation guide assigns meaningful unit, integration, contract, security, restore, performance, Chromium, WebKit, iPhone, and iPad coverage while keeping exhaustive multi-user/key-broker cases out of the required quick gate.
- **Performance and AWS architecture — PASS**: The final design adds no always-on compute, new database, queue, stream, search service, or per-user KMS key. One shared-purpose KMS key and on-demand broker are justified; list/body pagination and a 90-recipient transactional ceiling bound scale.
- **Simplicity, review, comments, and documentation — PASS**: One content key avoids ciphertext duplication per recipient; one online broker avoids a per-user public-key lifecycle; direct DynamoDB conditional transactions avoid a new workflow service at current scale. Protocol invariants require explanatory code comments and operations documentation.

No constitution violations or exceptions require Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-journal-crisis-plan/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── crisis-plan.openapi.yaml
│   ├── crypto-sharing.md
│   ├── sync-protocol.md
│   └── ui-contracts.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── app/{App.tsx,router.tsx}
│   ├── crypto/{journal-crypto.ts,crisis-plan-crypto.ts}
│   ├── db/{database.ts,crisis-plan-repository.ts}
│   ├── features/journal/
│   │   ├── CrisisPlanPage.tsx
│   │   ├── CrisisPlanEditor.tsx
│   │   ├── CrisisPlanShareManager.tsx
│   │   ├── SharedCrisisPlanView.tsx
│   │   ├── TriggeredCrisisPlan.tsx
│   │   └── crisis-plan-client.ts
│   └── sync/sync-engine.ts
└── test/{crypto,db,features}/

apps/api/
├── src/journal/
│   ├── crisis-plan-authorization.ts
│   ├── crisis-plan-handler.ts
│   ├── crisis-plan-key-broker-handler.ts
│   ├── crisis-plan-repository.ts
│   ├── crisis-plan-service.ts
│   ├── sharing-key-registry.ts
│   └── telemetry.ts
└── test/journal/

packages/domain/src/{journal.ts,crisis-plan.ts}
packages/domain/test/crisis-plan.test.ts
packages/contracts/src/{journal-openapi.ts,crisis-plan-openapi.ts}
packages/observability/src/crisis-plan.ts

infra/lib/{journal-stack.ts,crisis-plan-sharing-stack.ts,observability-stack.ts}
infra/test/crisis-plan-sharing.test.ts

tests/
├── contract/crisis-plan.contract.test.ts
├── integration/{crisis-plan-sync.test.ts,crisis-plan-sharing.test.ts,crisis-plan-recipient-lifecycle.test.ts}
├── security/{crisis-plan.security.test.ts,crisis-plan-admin-recovery.security.test.ts}
├── restore/crisis-plan-restore.test.ts
├── performance/crisis-plan.test.ts
└── e2e/{journal.spec.ts,crisis-plan-sharing.spec.ts,crisis-plan-connectivity.spec.ts}
```

**Structure Decision**: Extend the existing workspace boundaries and feature-010 journal modules. Domain invariants live in `packages/domain`, request/response validation in `packages/contracts`, owner browser cryptography/local durability in `apps/web`, ciphertext/state authorization and the isolated key broker in `apps/api`, and AWS/IAM/alarms in `infra`. No new workspace or service repository is introduced.

## Required Validation Runtime Budget

Planning baseline measured on the unchanged tree on 2026-08-27:

- `npx playwright test --config playwright.quick.config.ts --list`: **23 tests in 13 files**.
- `/usr/bin/time -p npm run test:e2e:quick`: **23 passed in 22.4 seconds; real 22.76 seconds**.
- `.github/workflows/validate.yml`: **15-minute timeout**, retained as headroom; the required check target remains ten minutes or less.

Feature 010 already plans one representative `journal.spec.ts` Chromium journey for the quick suite. This feature MUST extend that same journey with crisis-plan creation, entry gating, and triggered display rather than add another required quick test. If feature 010 has not yet added it, the expected result is 24 tests in 14 files; if it has, the count should remain unchanged. Multi-user direct sharing, revocation/key rotation, recipient online teardown, recovery misuse, and WebKit/device combinations remain in `npm run test:e2e` and `npm run validate:pre-aws:browsers`.

Immediately before and after editing `playwright.quick.config.ts`, `.github/workflows/validate.yml`, `test:e2e:quick`, or another required command, re-list and remeasure the actual suite under comparable conditions. After pushing, confirm the hosted PR check remains at or below ten minutes. Any additional required journey needs explicit runtime evidence and user approval if the expected total would exceed ten minutes.

## Complexity Tracking

No constitution violations. The dedicated KMS key and key-broker Lambda are security controls required for immediate encrypted sharing to arbitrary active users with online-only access; their simpler alternatives and cost tradeoffs are documented in [research.md](research.md).
