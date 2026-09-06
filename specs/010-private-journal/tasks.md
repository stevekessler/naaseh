---

description: "Dependency-ordered implementation tasks for the encrypted private journal"
---

# Tasks: Private Journal and Wellness Dashboard

**Input**: Design documents from `/specs/010-private-journal/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Automated tests are mandatory. Within every user-story phase, write the listed tests first and verify the expected failure before implementing the behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other ready tasks because it changes different files and has no unmet dependency
- **[Story]**: Maps the task to a user story in `spec.md`
- Every task names exact files

## Phase 1: Setup

**Purpose**: Establish test fixtures, module boundaries, dependencies, and the required-validation baseline.

- [X] T001 Measure the unchanged required quick suite with `npx playwright test --config playwright.quick.config.ts --list` and `/usr/bin/time -p npm run test:e2e:quick`, recording test/file counts and timing in `specs/010-private-journal/quickstart.md`
- [X] T002 [P] Add reusable journal owner, entry, encrypted-envelope, task, conflict, and recovery fixtures in `tests/fixtures/journal.ts`
- [X] T003 [P] Add Journal contract exports in `packages/contracts/src/journal-openapi.ts` and `packages/contracts/src/index.ts`
- [X] T004 [P] Add Journal observability exports in `packages/observability/src/journal.ts` and `packages/observability/src/index.ts`
- [X] T005 [P] Add and pin `@lexical/link` 0.49.0 in `apps/web/package.json` and `package-lock.json`
- [X] T006 [P] Create the plaintext, key-lifetime, recovery-abuse, offline-cache, task-reference, backup, and telemetry threat checklist in `docs/security/private-journal-threat-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared domain, ciphertext contracts, local schema, sync version, and telemetry boundary used by every story.

**CRITICAL**: No user-story implementation starts until this phase passes.

- [X] T007 [P] Add failing domain tests for optional responses, ranges/steps, DBT enums, one-entry-per-date identity, rich-text AST validation, preferences, and no-delete invariants in `packages/domain/test/journal.test.ts`
- [X] T008 [P] Add failing crypto-package tests for envelope schemas, canonical AAD, opaque date tokens, key versions, and plaintext-field rejection in `packages/domain/test/journal-crypto.test.ts`
- [X] T009 [P] Add failing contract tests for Journal key-envelope endpoints, sync-v5 journal entities, ciphertext-only schemas, recovery routes, no-store headers, and absence of delete/export/search operations in `tests/contract/journal.contract.test.ts`
- [X] T010 [P] Add failing Dexie v12 migration tests for encrypted entries, projections, bodies, profiles, key envelopes, conflicts, outbox records, and owner purge behavior in `apps/web/test/db/journal-repository.test.ts`
- [X] T011 [P] Add failing telemetry tests that reject journal dates, answers, notes, task references, wraps, keys, ciphertext, recovery reasons, public keys, and aggregate values in `packages/observability/test/journal.test.ts`
- [X] T012 Implement Journal field definitions, validators, rich-text structural AST, preferences, projection/body models, dashboard types, and no-delete invariants in `packages/domain/src/journal.ts` and export them from `packages/domain/src/index.ts`
- [X] T013 Implement Journal ciphertext envelopes, key-envelope schemas, canonical AAD inputs, opaque date-token inputs, sync mutation/change schemas, and recovery views in `packages/domain/src/journal-crypto.ts` and export them from `packages/domain/src/index.ts`
- [X] T014 Implement and export Journal OpenAPI-derived request/response validators and sync-v5 entity schemas in `packages/contracts/src/journal-openapi.ts` and `packages/contracts/src/index.ts`
- [X] T015 Implement Dexie v12 Journal tables, indexes, encrypted conflict/outbox stores, migration registration, and owner-bound purge fields in `apps/web/src/db/database.ts`, `apps/web/src/db/schema.ts`, and `apps/web/src/db/feature-migration-registry.ts`
- [X] T016 Extend sync negotiation and entity dispatch for owner-only `journalEntry` and `journalProfile` entities at contract version 5 in `packages/domain/src/sync.ts`, `apps/web/src/sync/sync-engine.ts`, and `apps/api/src/sync/types.ts`
- [X] T017 Implement positive-allowlist Journal and recovery event fields, permanent protected-data redaction, metrics, and safe correlation context in `packages/observability/src/journal.ts` and `apps/api/src/journal/telemetry.ts`
- [X] T018 Add authenticated Journal route dispatch and concealed error mapping in `apps/api/src/index.ts`, `apps/api/src/journal/handler.ts`, and `apps/web/src/features/journal/journal-client.ts`
- [X] T019 Extend backup inventory and restore-validator registration for encrypted Journal records and recovery audit rows in `apps/api/src/crypto-recovery/backup-manifest.ts`, `apps/api/src/crypto-recovery/restore-validator.ts`, and `infra/lib/backup-stack.ts`

**Checkpoint**: Journal domain/contracts agree, Dexie v12 migrates, sync v5 recognizes ciphertext-only Journal entities, and telemetry rejects protected fields.

---

## Phase 3: User Story 1 - Record a Private Daily Journal (Priority: P1) MVP

**Goal**: An owner enrolls/unlocks a private journal, creates or edits one encrypted entry per local date, and remains protected from other users and administrators; bounded two-party recovery restores only owner access.

**Independent Test**: Enroll a journal PIN, save a date-only and a fully populated entry, lock/reopen/edit it online and offline, deny another user and ordinary administrator, verify no delete path, and complete owner-initiated recovery without exposing plaintext or the JMK to the recovery administrator.

### Tests for User Story 1

- [X] T020 [P] [US1] Add failing browser crypto tests for random JMK generation, HKDF domain separation, AES-256-GCM fresh IVs, Argon2id PIN wrapping, recovery public-key wrapping, opaque HMAC date tokens, tamper rejection, and five-minute key lifetime in `apps/web/test/crypto/journal-crypto.test.ts`
- [X] T021 [P] [US1] Add failing local repository tests for atomic encrypted projection/body/outbox writes, date uniqueness, pending status, oversized-draft preservation, restart recovery, and plaintext absence in `apps/web/test/db/journal-repository.test.ts`
- [X] T022 [P] [US1] Add failing API service tests for owner-only create/read/update, exact-version writes, mutation replay, date-token collision, legacy/no-delete behavior, ciphertext size bounds, and actionable errors in `apps/api/test/journal/journal-service.test.ts`
- [X] T023 [P] [US1] Add failing security tests for cross-user identifiers, ordinary administrators, direct routes, sync feeds, caches, exports, notifications, reports, and protected log fields in `tests/security/journal.security.test.ts`
- [X] T024 [P] [US1] Add failing recovery tests for owner initiation, password/TFA controls, five-minute expiry, request/session/key binding, replay, arbitrary-wrap rejection, owner-only consumption, PIN replacement, and tamper-evident audit in `apps/api/test/crypto-recovery/journal-recovery.test.ts`
- [X] T025 [P] [US1] Add failing infrastructure tests for recovery-key IAM separation, reserved-concurrency-one recovery Lambda, no-store routes, CloudTrail evidence, backup inclusion, logs, metrics, and alarms in `infra/test/journal-stack.test.ts`
- [X] T026 [P] [US1] Add failing component tests for enrollment/unlock/lock, optional entry fields, synchronized slider/number controls, DBT values, structural rich text, safe validation, pending/conflict states, and no delete UI in `apps/web/test/features/journal.test.tsx`
- [X] T027 [P] [US1] Add the single failing representative required Chromium journey for enroll, create, save, lock/unlock, reopen, and edit in `tests/e2e/journal.spec.ts` and include only that journey in `playwright.quick.config.ts`

### Implementation for User Story 1

- [X] T028 [P] [US1] Implement JMK creation/import, HKDF record keys, HMAC date tokens, AES-GCM projection/body encryption, Argon2id owner wrapping, recovery wrapping, zeroization, and safe envelope validation in `apps/web/src/crypto/journal-crypto.ts`
- [X] T029 [P] [US1] Implement five-minute visibility/session-bound `JournalUnlockSession` enrollment, unlock, PIN change, explicit lock, logout/session-revocation purge, and generic failure handling in `apps/web/src/crypto/journal-unlock-session.ts`
- [X] T030 [P] [US1] Implement encrypted Journal projection/body/profile/key-envelope/conflict reads, atomic outbox saves, unique local date pointers, pending acknowledgements, and owner purge in `apps/web/src/db/journal-repository.ts`
- [X] T031 [US1] Implement ciphertext-only Journal entries, date pointers, profiles, key envelopes, mutation receipts, and owner feed operations with conditional transactions in `apps/api/src/journal/journal-repository.ts`
- [X] T032 [US1] Implement owner-derived authorization, create/update validation, exact-version conflicts, duplicate mutation receipts, ciphertext bounds, and no-delete enforcement in `apps/api/src/journal/journal-authorization.ts` and `apps/api/src/journal/journal-service.ts`
- [X] T033 [US1] Implement Journal key-envelope, entry sync, bootstrap, and concealed owner-only route handlers in `apps/api/src/journal/handler.ts` and `apps/api/src/sync/handlers.ts`
- [X] T034 [US1] Implement ordered encrypted Journal outbox drain, bootstrap/pull transactions, pending protection, replay handling, cursor commits, and conflict preservation in `apps/web/src/sync/journal-sync.ts` and `apps/web/src/sync/sync-engine.ts`
- [X] T035 [P] [US1] Build paired accessible numeric controls and optional yes/no controls from domain metadata in `apps/web/src/features/journal/JournalNumericField.tsx` and `apps/web/src/features/journal/JournalYesNoField.tsx`
- [X] T036 [P] [US1] Build the structural Lexical editor/renderer with the exact supported formatting and HTTPS-link allowlist in `apps/web/src/features/journal/JournalRichTextEditor.tsx` and `apps/web/src/features/journal/JournalRichTextView.tsx`
- [X] T037 [US1] Build the entry create/read/edit form with date-only validity, structured wellness/DBT fields, safe errors, local-pending/server-synced status, no-delete behavior, and draft preservation in `apps/web/src/features/journal/JournalEntryEditor.tsx`
- [X] T038 [US1] Build Journal enrollment, unlock, lock, recovery-oriented failure, and PIN-change UI in `apps/web/src/features/journal/JournalUnlock.tsx` and `apps/web/src/features/journal/JournalSettings.tsx`
- [X] T039 [US1] Register authenticated Journal navigation plus `/journal/new` and `/journal/{entryId}` routes with journal-lock lifecycle cleanup in `apps/web/src/app/App.tsx` and `apps/web/src/app/router.tsx`
- [X] T040 [US1] Implement owner recovery request persistence, authorization, state transitions, idempotency, expiry, and content-free audit chaining in `apps/api/src/crypto-recovery/journal-recovery-repository.ts` and `apps/api/src/crypto-recovery/journal-recovery-service.ts`
- [X] T041 [US1] Implement isolated KMS recovery rewrap, fresh administrator password/TFA approval, owner-only result consumption, PIN completion, session advancement, raw-key zeroization, and no-store responses in `apps/api/src/crypto-recovery/journal-recovery-handler.ts` and `apps/api/src/crypto-recovery/authorization.ts`
- [X] T042 [US1] Provision Journal routes, recovery Lambda/IAM/KMS grants, DynamoDB indexes, log retention, metrics, alarms, PITR, and backup wiring using on-demand services in `infra/lib/journal-stack.ts`, `infra/lib/crypto-recovery-stack.ts`, and `infra/lib/observability-stack.ts`
- [X] T043 [US1] Add recovery audit/restore verification that detects chain alteration, version rollback, unauthorized grants, and plaintext exposure without decrypting entries in `apps/api/src/crypto-recovery/journal-restore-validator.ts` and `tests/restore/journal-restore.test.ts`

**Checkpoint**: US1 is a secure deployable MVP with encrypted daily entries, offline owner use, strict authorization, no deletion, and bounded recovery.

---

## Phase 4: User Story 2 - Browse and Revisit Entries by Date (Priority: P2)

**Goal**: The unlocked owner browses newest-first entries and filters by inclusive local dates without exposing plaintext dates or offering content search.

**Independent Test**: Seed several encrypted projections, filter with start/end/both/no matches/reversed values, and open a result while confirming no keyword search or server-side plaintext date query exists.

### Tests for User Story 2

- [X] T044 [P] [US2] Add failing projection tests for decrypted newest-first sorting, inclusive local-date filters, daylight-saving boundaries, invalid-range preservation, empty states, and absent content search in `apps/web/test/features/journal-list.test.tsx`
- [X] T045 [P] [US2] Add failing browser coverage for list/filter/open behavior in Chromium and WebKit at desktop and mobile viewports in `tests/e2e/journal.spec.ts`

### Implementation for User Story 2

- [X] T046 [P] [US2] Implement unlocked in-memory projection sorting/filtering and entry-link view models without plaintext persistence in `apps/web/src/features/journal/journal-list-model.ts`
- [X] T047 [US2] Build the accessible newest-first Journal list, inclusive date filters, actionable invalid-range handling, empty states, and no-search UI in `apps/web/src/features/journal/JournalListPage.tsx`
- [X] T048 [US2] Add lazy encrypted body loading and dedicated read/edit navigation without leaking dates into URLs or analytics in `apps/web/src/features/journal/journal-client.ts` and `apps/web/src/app/router.tsx`
- [X] T049 [US2] Add content-free list/filter/open telemetry and safe failure states in `apps/api/src/journal/telemetry.ts` and `packages/observability/src/journal.ts`

**Checkpoint**: US2 independently supports private chronological browsing and inclusive date filtering.

---

## Phase 5: User Story 3 - Configure Sensitive Journal Sections (Priority: P2)

**Goal**: Each owner independently controls suicidal/self-harm and DBT section visibility while historical encrypted answers remain preserved.

**Independent Test**: Toggle each preference independently online/offline, reload and use another account, verify hidden historical values reappear after re-enable, and confirm sensitive answers trigger no alert/resource/notification/sharing behavior.

### Tests for User Story 3

- [X] T050 [P] [US3] Add failing preference tests for enabled defaults, independent toggles, encrypted persistence, historical preservation, offline retry, owner isolation, and dashboard visibility in `apps/web/test/features/journal-settings.test.tsx`
- [X] T051 [P] [US3] Add failing privacy tests proving suicidal/self-harm answers create no crisis resources, interpretation, alerts, notification, sharing, report, or emergency workflow in `tests/security/journal-sensitive-response.security.test.ts`

### Implementation for User Story 3

- [X] T052 [P] [US3] Implement encrypted profile preference reads, local pending updates, server conditional writes, and sync conflicts in `apps/web/src/db/journal-repository.ts`, `apps/api/src/journal/journal-service.ts`, and `apps/web/src/sync/journal-sync.ts`
- [X] T053 [US3] Build independent sensitive-section and DBT visibility controls with enabled defaults and pending/conflict feedback in `apps/web/src/features/journal/JournalSettings.tsx`
- [X] T054 [US3] Apply preference visibility to entry create/read/edit while retaining all historical encrypted fields in `apps/web/src/features/journal/JournalEntryEditor.tsx` and `apps/web/src/features/journal/JournalRichTextView.tsx`
- [X] T055 [US3] Add negative integration assertions that sensitive answers never invoke notification, export, reporting, or sharing services in `tests/integration/journal-sensitive-response.test.ts`

**Checkpoint**: US3 preferences are private, offline-safe, reversible, and behaviorally non-clinical.

---

## Phase 6: User Story 4 - Relate a Journal Entry to a Task (Priority: P3)

**Goal**: The owner optionally selects an authorized open/recently-completed task and stores an encrypted rich-text reflection without gaining or leaking task access.

**Independent Test**: Select an eligible task, save/reopen formatted reflection, clear it with confirmation, exclude foreign/old tasks, and render “Task unavailable” if access later disappears.

### Tests for User Story 4

- [X] T056 [P] [US4] Add failing eligibility tests for owner-visible open tasks, prior-seven-local-day completions, offline cache behavior, foreign/inaccessible exclusions, and unavailable labels in `apps/web/test/features/journal-task-reflection.test.tsx`
- [X] T057 [P] [US4] Add failing security tests proving encrypted task IDs confer no task authorization and cannot disclose historical titles or content in `tests/security/journal-task-reference.security.test.ts`

### Implementation for User Story 4

- [X] T058 [P] [US4] Implement local authorized task eligibility and unavailable-task resolution in `apps/web/src/features/journal/journal-task-options.ts`
- [X] T059 [US4] Build the optional `ReferenceCombobox` task selector, reflection editor, and confirm-before-clearing behavior in `apps/web/src/features/journal/JournalTaskReflection.tsx`
- [X] T060 [US4] Integrate encrypted task ID/reflection into entry bodies without server-side task authorization inference in `apps/web/src/features/journal/JournalEntryEditor.tsx` and `apps/api/src/journal/journal-service.ts`
- [X] T061 [US4] Add Chromium/WebKit task-reflection coverage for selection, clearing, offline save, and inaccessible task behavior in `tests/e2e/journal.spec.ts`

**Checkpoint**: US4 adds useful task context without expanding task or journal visibility.

---

## Phase 7: User Story 5 - Review Wellness Trends (Priority: P3)

**Goal**: The unlocked owner computes dashboard metrics, trends, and contributor sets locally from encrypted projections for an accessible selected period.

**Independent Test**: With known current/prior projections, verify days, averages, yes-day counts, no-data states, trend direction, preference-hidden cards, and exact contributor links entirely in the browser.

### Tests for User Story 5

- [X] T062 [P] [US5] Add failing domain tests for inclusive/current/prior periods, answered-only averages, yes-day counts, distinct days, missing-versus-zero/no, trend direction, sensitive-card visibility, and contributor IDs in `packages/domain/test/journal-dashboard.test.ts`
- [X] T063 [P] [US5] Add failing component tests for date selection, square cards, accessible metric kinds/trends, color-independent states, dialog focus restoration, contributor links, offline/loading/error states, and 320px reflow in `apps/web/test/features/journal-dashboard.test.tsx`
- [X] T064 [P] [US5] Add failing performance tests for p95 local controls under 100 ms and 14/365/3,650/10,000 projection list/dashboard processing within documented targets without new always-on AWS capacity in `tests/performance/journal.test.ts`

### Implementation for User Story 5

- [X] T065 [P] [US5] Implement pure local dashboard period, aggregation, trend, no-data, preference, and contributor calculations in `packages/domain/src/journal-dashboard.ts` and export them from `packages/domain/src/index.ts`
- [X] T066 [P] [US5] Build semantic square metric-card buttons with accessible value kinds, text trends, no-data states, and non-clinical colors in `apps/web/src/features/journal/JournalMetricCard.tsx`
- [X] T067 [US5] Build the dashboard date range, responsive card grid, loading/offline/error states, and local calculation pipeline in `apps/web/src/features/journal/JournalDashboardPage.tsx`
- [X] T068 [US5] Build the native modal contributor dialog with exact entries, links, Escape/button close, inert background, and focus restoration in `apps/web/src/features/journal/JournalMetricDialog.tsx`
- [X] T069 [US5] Apply sensitive-section preference hiding and lazy projection/body boundaries to dashboard routes in `apps/web/src/features/journal/JournalDashboardPage.tsx` and `apps/web/src/app/router.tsx`
- [X] T070 [US5] Add exhaustive Chromium/WebKit/iPhone/iPad accessibility and responsive dashboard coverage outside the quick suite in `tests/e2e/journal.spec.ts`

**Checkpoint**: US5 provides correct, private, accessible local wellness summaries without server aggregates.

---

## Phase 8: Polish and Cross-Cutting Validation

**Purpose**: Complete restoration, observability, performance, documentation, browser validation, and required-runtime gates.

- [X] T071 [P] Reconcile implemented routes and schemas against `specs/010-private-journal/contracts/journal.openapi.yaml` in `packages/contracts/src/journal-openapi.ts`
- [X] T072 [P] Complete owner unlock/recovery help and operator recovery/restore runbooks in `docs/security/private-journal-threat-model.md`, `docs/runbooks/journal-recovery.md`, and `docs/runbooks/journal-restore.md`
- [X] T073 Complete CloudWatch log retention, safe metrics/alarms, recovery audit signing, CloudTrail evidence, and expected-cost annotations in `infra/lib/observability-stack.ts` and `packages/observability/src/journal.ts`
- [X] T074 Verify adversarial source/log/cache/export/notification/report fixtures cannot expose journal plaintext, dates, answers, task references, wraps, keys, or sensitive aggregates in `tests/security/journal.security.test.ts` and `tests/security/operational-telemetry.security.test.ts`
- [X] T075 Run and fix focused domain, crypto, web, API, contract, integration, security, restore, infrastructure, and performance tests using `specs/010-private-journal/quickstart.md`
- [X] T076 Run and fix exhaustive Chromium, WebKit, iPhone, and iPad Journal journeys outside the required quick suite using `tests/e2e/journal.spec.ts`
- [X] T077 List the resulting quick-test/file count and rerun `/usr/bin/time -p npm run test:e2e:quick`; record the before/after evidence in `specs/010-private-journal/quickstart.md`
- [X] T078 Keep exactly one representative Journal Chromium journey in `playwright.quick.config.ts`; keep recovery abuse, exhaustive privacy, WebKit, iPhone, and iPad permutations in full/local gates
- [X] T079 Run complete repository validation and confirm the hosted PR validation remains at or below ten minutes with headroom under `.github/workflows/validate.yml`, recording the run and duration in `specs/010-private-journal/quickstart.md`
- [X] T080 Review the final diff for authorization, cryptographic invariants, key lifetimes, plaintext leakage, retries/conflicts, recovery abuse, data loss, browser behavior, dependencies, cost, comments, and documentation in `specs/010-private-journal/quickstart.md`
- [X] T081 Execute every acceptance scenario and quality gate in `specs/010-private-journal/spec.md` and `specs/010-private-journal/quickstart.md`, recording final results in `specs/010-private-journal/quickstart.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Setup starts immediately; T001 must finish before T027 changes the required browser suite.
- Foundation depends on Setup and blocks all user stories.
- US1 depends on Foundation and is the secure MVP.
- US2 and US3 depend on US1's unlocked encrypted projections/profile.
- US4 depends on US1's encrypted entry body and current task authorization cache.
- US5 depends on US1 projections and US3 preference visibility.
- Polish depends on every story selected for release.

### Dependency Graph

```text
Setup -> Foundation -> US1 (MVP)
                         |-> US2
                         |-> US3 -> US5
                         `-> US4
US2 + US3 + US4 + US5 -> Polish -> Feature 011 prerequisite satisfied
```

### Parallel Opportunities

- T002-T006 can run together after T001.
- T007-T011 can run together; their implementations then proceed in dependency order.
- US1 tests T020-T027 can run together; T028-T030 can proceed in parallel before API/UI integration.
- US2 tests T044-T045 and US3 tests T050-T051 can run in parallel after US1.
- US4 tests T056-T057 and US5 tests T062-T064 can run in parallel once their prerequisites are complete.
- T071-T072 can run together; runtime and hosted-validation tasks T075-T079 remain sequential.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1, including recovery and privacy boundaries.
3. Stop and validate encrypted create/edit/offline/recovery independently.
4. Only then add browsing, preferences, task reflections, and dashboard trends.

### Scope Guardrails

- The browser is the ordinary plaintext boundary; APIs, DynamoDB, backups, logs, exports, reports, notifications, and administration remain ciphertext/content-free.
- The recovery administrator approves an owner request but never sees the JMK or journal plaintext.
- Entries use upsert only; no delete or tombstone operation exists.
- Only the date is required; unanswered is distinct from zero or no.
- Dashboard computation is local from decrypted projections; no server aggregates or plaintext dates exist.
- One representative Chromium Journal journey enters the required quick suite; exhaustive variants remain outside it.
