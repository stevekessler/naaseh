# Tasks: Journal Recycle Bin

**Input**: Design documents from `/specs/013-journal-recycle-bin/`

**Tests**: Required by the project constitution. Write risk-focused tests first and observe
the relevant failure before implementing each behavior.

## Phase 1: Setup and Validation Baseline

**Purpose**: Preserve validation-runtime evidence and align protocol ownership before code changes.

- [X] T001 Record the required quick-suite discovered test count and `/usr/bin/time -p npm run test:e2e:quick` baseline in `specs/013-journal-recycle-bin/validation.md`
- [X] T002 Audit and reconcile Journal contract-version literals and compatibility declarations in `packages/domain/src/journal.ts`, `packages/contracts/src/journal-openapi.ts`, and `apps/web/src/sync/journal-sync.ts`
- [X] T003 [P] Document the recovered-list incident, duplicate-preservation decision, and Journal pull/bootstrap root cause in `docs/operations/journal-recovery.md`

---

## Phase 2: Foundational Sync and Data-Safety Repairs

**Purpose**: Fix the hidden-data path before lifecycle features rely on Journal synchronization.

**CRITICAL**: User-story work begins only after pull/bootstrap, pagination, pending-row safety,
date-token persistence, and conflict visibility are covered and working.

- [ ] T004 [P] Add failing repository tests for pulled date-token persistence, pending-row preservation, and atomic tombstone cleanup in `apps/web/test/db/journal-repository.test.ts`
- [ ] T005 [P] Add failing sync tests for paginated Journal bootstrap/pull, reconnect, pending-row conflict preservation, and hard-deleted responses in `apps/web/test/sync/journal-sync.test.ts`
- [ ] T006 [P] Add failing UI-model tests proving corrupt ciphertext cannot hide healthy Journal entries and Journal conflicts are actionable in `apps/web/test/features/journal/journal-list-model.test.ts`
- [ ] T007 Add the compatible Journal change union, pagination cursor, safe conflict outcomes, and strict version negotiation in `packages/domain/src/journal.ts` and `packages/contracts/src/journal-openapi.ts`
- [X] T008 Extend Dexie Journal row/outbox/conflict types and add the lifecycle-ready database migration in `apps/web/src/db/journal-types.ts` and `apps/web/src/db/database.ts`
- [ ] T009 Implement transactional pull persistence, pending-row conflict preservation, top-level date-token retention, and tombstone cleanup in `apps/web/src/db/journal-repository.ts`
- [X] T010 Wire paginated Journal bootstrap/pull into foreground and reconnect synchronization and correct outbox entity mapping in `apps/web/src/sync/journal-sync.ts` and `apps/web/src/app/App.tsx`
- [X] T011 Expose Journal conflicts through the existing sync-status review surface without mixing plaintext into ordinary conflicts in `apps/web/src/components/ConflictResolutionDialog.tsx` and `apps/web/src/db/journal-repository.ts`
- [X] T012 Make Journal decryption per-record fault tolerant and surface safe recovery feedback in `apps/web/src/features/journal/JournalPage.tsx` and `apps/web/src/features/journal/journal-list-model.ts`

**Checkpoint**: A fresh or stale browser retrieves all Journal pages, preserves unsent work, and
shows conflicts/errors instead of hiding entries.

---

## Phase 3: User Story 1 - Recover a Removed Journal Note (Priority: P1) MVP

**Goal**: Recycle and restore one encrypted Journal entry with stable identity, date, and content.

**Independent Test**: Create an entry, recycle it, confirm every active view excludes it and the
date stays reserved, then restore it and compare UUID/date/body/answers byte-for-byte.

### Tests for User Story 1

- [X] T013 [P] [US1] Add failing projection-v1 compatibility, projection-v2 lifecycle, and crypto round-trip tests in `packages/domain/test/journal-crypto.test.ts`
- [X] T014 [P] [US1] Add failing API tests for authorized/idempotent recycle and restore, invalid transitions, date reservation, and version conflicts in `apps/api/test/journal/journal-lifecycle.test.ts`
- [ ] T015 [P] [US1] Add failing local offline lifecycle and active-filtering tests in `apps/web/test/db/journal-repository.test.ts` and `apps/web/test/features/journal/journal-list-model.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Add encrypted projection v2 lifecycle metadata with v1-as-active parsing in `packages/domain/src/journal-crypto.ts`
- [X] T017 [US1] Add explicit upsert/recycle/restore mutation schemas, outcomes, and transition validation in `packages/domain/src/journal.ts` and `packages/contracts/src/journal-openapi.ts`
- [ ] T018 [US1] Store authoritative coarse lifecycle state and apply owner/version/date/ledger-guarded mutations atomically in `apps/api/src/journal/journal-repository.ts` and `apps/api/src/journal/journal-service.ts`
- [X] T019 [US1] Implement offline local recycle/restore transactions and durable outbox intent in `apps/web/src/db/journal-repository.ts` and `apps/web/src/sync/journal-sync.ts`
- [X] T020 [US1] Filter recycled/deleting entries from list, dashboard, streak, summary, and crisis-plan prerequisite inputs in `apps/web/src/features/journal/JournalPage.tsx`, `apps/web/src/features/journal/JournalListPage.tsx`, `apps/web/src/features/journal/JournalDashboardPage.tsx`, and `apps/web/src/features/journal/journal-list-model.ts`
- [X] T021 [US1] Add touch/keyboard-accessible Move to recycle bin confirmation and restore controls in `apps/web/src/features/journal/JournalEntryEditor.tsx` and `apps/web/src/features/journal/JournalRecycleBinPage.tsx`
- [X] T022 [US1] Reserve recycled dates and guide attempted duplicate-date creation to the recycled entry in `apps/web/src/features/journal/JournalPage.tsx` and `apps/web/src/features/journal/JournalEntryEditor.tsx`

**Checkpoint**: US1 works independently online and offline with no permanent-delete capability.

---

## Phase 4: User Story 2 - Review and Manage Recycled Notes (Priority: P2)

**Goal**: Browse an unlocked, newest-removal-first recycle bin and permanently delete one selected
entry through an online authoritative, resumable workflow.

**Independent Test**: Recycle multiple entries, verify ordering and locked-state protection,
permanently delete one with entry-specific confirmation, and verify every other entry remains.

### Tests for User Story 2

- [ ] T023 [P] [US2] Add failing contract/security tests for Journal UUID preview/delete, owner-only access, recycled-state validation, token binding, and offline refusal in `tests/contract/journal-permanent-deletion.contract.test.ts` and `tests/security/journal-permanent-deletion.security.test.ts`
- [ ] T024 [P] [US2] Add failing integration tests for checkpoint resume, unprocessed-batch retry, workflow-start failure, feed-history purge, atomic ledger finalization, and stale-client rejection in `tests/integration/journal-permanent-deletion.test.ts`
- [ ] T025 [P] [US2] Add failing responsive UI tests for locked bin, ordering, restore, destructive confirmation, failure, and progress states in `apps/web/test/features/journal/journal-recycle-bin.test.tsx`

### Implementation for User Story 2

- [ ] T026 [US2] Extend deletion schemas for `journalEntry` UUIDs, safe preview/job outcomes, and content-free ledger records in `packages/domain/src/deletion.ts`
- [ ] T027 [US2] Implement Journal deletion preview and confirmation routing with ownership, lifecycle, version, HMAC, and idempotency checks in `apps/api/src/deletion/handlers.ts` and `apps/api/src/deletion/deletion-preview-service.ts`
- [ ] T028 [US2] Implement the Journal-specific checkpointed purge, bounded feed-history cleanup, safe failed/resume state, and atomic entry/date/ledger/tombstone finalization in `apps/api/src/deletion/journal-deletion-service.ts`, `apps/api/src/deletion/deletion-service.ts`, and `apps/api/src/deletion/deletion-repository.ts`
- [ ] T029 [US2] Harden workflow dispatch and DynamoDB batch retry behavior so pending jobs cannot strand silently in `apps/api/src/deletion/workflow-handler.ts`, `apps/api/src/deletion/handlers.ts`, and `apps/api/src/deletion/deletion-repository.ts`
- [ ] T030 [US2] Add the `/journal/recycle-bin` route before generic entry routing, newest-removal sorting, locked-state protection, restore, deletion preview/confirmation/progress/error UI in `apps/web/src/features/journal/JournalPage.tsx` and `apps/web/src/features/journal/JournalRecycleBinPage.tsx`
- [ ] T031 [US2] Extend the web deletion client for Journal UUID preview, confirmation, idempotent status/resume, and online gating in `apps/web/src/features/deletion/deletion-client.ts` and `apps/web/src/features/deletion/PermanentDeletionDialog.tsx`
- [ ] T032 [US2] Wire Journal deletion permissions, Step Functions metrics, stranded/timed-out/aborted alarms, and protected log settings in `infra/lib/deletion-stack.ts`, `infra/lib/api-stack.ts`, and `infra/test/foundation.test.ts`

**Checkpoint**: US2 independently proves only a recycled owner entry can be hard-deleted and that
success is withheld until ciphertext removal and non-resurrection evidence are verified.

---

## Phase 5: User Story 3 - Preserve Recovery Across Offline Use and Failures (Priority: P3)

**Goal**: Make lifecycle intent durable across offline use, reconnect, conflicts, stale devices,
and infrastructure restore.

**Independent Test**: Recycle/restore offline, reconnect through retry and conflict cases, delete
online, reconnect a stale profile, and remediate an isolated pre-deletion recovery point.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add failing end-to-end sync tests for offline recycle/restore, reconnect retry, conflict preservation, and tombstone dominance in `tests/integration/journal-lifecycle-sync.test.ts`
- [ ] T034 [P] [US3] Add failing restore tests that detect and remediate ledger-matched Journal entry, date, and feed ciphertext in `tests/restore/journal-permanent-deletion-ledger.test.ts`
- [ ] T035 [P] [US3] Add failing telemetry tests that reject Journal identifiers, dates/date tokens, plaintext, ciphertext, keys, and tokens in `tests/security/journal-lifecycle-telemetry.security.test.ts`

### Implementation for User Story 3

- [ ] T036 [US3] Make hard-deletion evidence authoritative during all Journal mutations and publish/apply content-free tombstones in `apps/api/src/journal/journal-service.ts`, `apps/api/src/journal/journal-repository.ts`, and `apps/web/src/sync/journal-sync.ts`
- [ ] T037 [US3] Implement Journal-specific conflict retention/resolution and visible pending/failure retry state in `apps/web/src/db/journal-repository.ts`, `apps/web/src/components/ConflictResolutionDialog.tsx`, and `apps/web/src/features/journal/JournalPage.tsx`
- [ ] T038 [US3] Add protected-ledger remediation and post-purge Journal invariants to isolated restore validation in `apps/api/src/crypto-recovery/deletion-ledger-validator.ts`, `apps/api/src/crypto-recovery/restore-testing-validator.ts`, and `apps/api/src/crypto-recovery/journal-restore-validator.ts`
- [ ] T039 [US3] Emit allowlisted lifecycle/deletion telemetry and safe metrics without protected Journal values in `apps/api/src/journal/telemetry.ts`, `apps/api/src/deletion/journal-deletion-service.ts`, and `packages/observability/src/`

**Checkpoint**: All three stories work under online, offline, retry, conflict, stale-client, and
restore conditions without silent loss or resurrection.

---

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Complete browser, performance, operational, documentation, and final-review gates.

- [ ] T040 [P] Add the 1,000-entry recycle-bin model benchmark and enforce the 2-second/5-second targets in `tests/performance/journal-recycle-bin.test.ts`
- [ ] T041 Add one representative Chromium/WebKit Journal recycle/restore journey to `tests/e2e/journal.spec.ts`, then record post-change count/time and hosted-check duration evidence in `specs/013-journal-recycle-bin/validation.md`
- [ ] T042 [P] Keep exhaustive desktop/iPhone/iPad lifecycle and permanent-delete journeys in `tests/e2e/journal.spec.ts` and non-required browser projects configured by `playwright.config.ts`
- [ ] T043 [P] Document user behavior, hard-delete warnings, recovery operations, ledger remediation, cost drivers, and safe telemetry in `docs/journal.md` and `docs/operations/journal-recovery.md`
- [ ] T044 Run the focused suites, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e:quick`, and applicable full Chromium/WebKit gates; record results in `specs/013-journal-recycle-bin/validation.md`
- [ ] T045 Re-review the final diff for authorization, encryption boundaries, lost-update/resurrection windows, idempotency, retry/observable failure, browser accessibility, AWS cost, comments, and documentation accuracy against `specs/013-journal-recycle-bin/spec.md`

---

## Dependencies and Execution Order

- Phase 1 establishes runtime evidence and contract ownership.
- Phase 2 blocks every user story because lifecycle controls cannot be trusted until Journal
  pull/bootstrap and pending-row handling are correct.
- US1 is the MVP and supplies lifecycle semantics used by US2 and US3.
- US2 depends on US1's recycled state; its UI can be developed in parallel with server deletion
  work after lifecycle schemas stabilize.
- US3 depends on US1 sync semantics and US2 tombstone/ledger behavior.
- Phase 6 follows all selected stories.

## Parallel Opportunities

- T003 can run alongside the contract-version audit.
- T004-T006 are independent failing-test tracks.
- T013-T015, T023-T025, and T033-T035 are parallel test tracks within their stories.
- In US2, T030-T031 UI/client work can proceed against the contract while T027-T029 implement the
  server workflow; T032 infrastructure follows stable routes/metrics.
- T040 and T043 can proceed in parallel once behavior is stable.

## Implementation Strategy

1. Complete Phase 1 and Phase 2; validate that the missing-data sync class is closed.
2. Deliver US1 as the smallest safe recycle/restore increment, with hard delete absent.
3. Add US2 permanent deletion only after lifecycle authorization and ciphertext purge tests pass.
4. Add US3 stale-device and restore non-resurrection safeguards before production release.
5. Add exactly one representative journey to required quick validation only if measured runtime
   remains below the ten-minute hosted target; retain the exhaustive matrix in release gates.
