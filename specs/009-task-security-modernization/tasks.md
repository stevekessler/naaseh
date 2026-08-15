# Tasks: Task Security and Experience Modernization

**Input**: Design documents from `/specs/009-task-security-modernization/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Automated unit, integration, contract, security, restore, performance, and Playwright Chromium/WebKit coverage is required by the constitution. Within each user story, add the listed tests first and confirm that they fail for the intended missing behavior before implementation.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently. Requirement and success-criterion IDs are included to make coverage auditable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel after its phase prerequisites because it changes different files and does not depend on another incomplete task in the same group.
- **[Story]**: User story from `spec.md`.
- Every task names the concrete file(s) it changes or validates.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish dependency, fixture, and validation baselines before feature tests change.

- [X] T001 Record the current `test:e2e:quick` test count and `/usr/bin/time -p npm run test:e2e:quick` baseline in `docs/testing/task-security-modernization-validation.md` before adding required browser tests (NFR-006)
- [X] T002 Add and lock the selected TOTP, Downshift, Lexical, and dnd-kit dependencies with verified React 19/Node 24 peer compatibility in `apps/api/package.json`, `apps/web/package.json`, and `package-lock.json`
- [X] T003 [P] Add reusable TFA users, recovery operator inputs, timer clocks, 1,000-reference, 10,000-row, legacy due-time, and `extra_low` fixtures in `tests/fixtures/task-security-modernization.ts`
- [X] T004 [P] Add shared Chromium/WebKit desktop, iPhone, and iPad journey helpers for modal focus, offline transitions, touch, zoom, and reduced motion in `tests/e2e/task-security-modernization-helpers.ts`
- [X] T005 [P] Add adversarial memo paste and 56-column CSV fixture builders in `tests/fixtures/task-security-modernization-content.ts` (FR-012, FR-031, FR-032)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish only the shared version-negotiation registry and transactional migration scaffolding needed by multiple stories. Each user story owns its feature schemas, persistence, telemetry, tests, and behavior.

**⚠️ CRITICAL**: Complete this phase before any user-story implementation. Tests in later story phases may be authored in parallel, but implementation must use these foundations.

- [X] T006 [P] Add failing tests for the feature-version registry, supported-version ranges, migration ordering, idempotent resume, and fail-closed unknown versions in `packages/domain/src/feature-version.test.ts`
- [X] T007 [P] Add failing contract tests for API/sync version negotiation, compatibility rejection, and retry-safe migration-version reporting in `tests/contract/task-security-modernization-version.contract.test.ts`
- [X] T008 [P] Add failing Dexie version 11 scaffold tests proving a no-op upgrade preserves encrypted records, keys, settings, outbox identity/order, and conflicts and can resume an interrupted story migration in `apps/web/test/db/task-security-modernization-schema-migration.test.ts`
- [X] T009 Define and export the feature-version registry and ordered migration-step contract without any story-owned entity schemas in `packages/domain/src/feature-version.ts` and `packages/domain/src/index.ts`
- [X] T010 Implement API/sync supported-version negotiation and compatibility errors without adding story request/result fields in `packages/contracts/src/openapi.ts` and `packages/domain/src/sync.ts`
- [X] T011 Add the shared transactional Dexie version 11 upgrade runner, checkpoint/resume hook, and rollback-safe failure boundary without adding story stores in `apps/web/src/db/database.ts` and `apps/web/src/db/schema.ts`
- [X] T012 Wire the shared server/browser migration registries, ordered execution, bounded migration status, and fail-closed deployment gate in `apps/api/src/migrations/feature-migration-registry.ts`, `apps/web/src/db/feature-migration-registry.ts`, and `infra/lib/migration-stack.ts`

**Checkpoint**: Version negotiation and resumable migration scaffolding are available; all feature schemas and behavior remain owned by their user stories.

---

## Phase 3: User Story 1 - Use Secure Accounts with TFA Recovery (Priority: P1) 🎯 MVP

**Goal**: Add optional user TOTP, mandatory administrator TOTP, PIN password reset, session revocation, and separately authorized audited administrator-factor recovery while preserving the existing opaque session format and using `sessionEpoch` revocation after every password or factor security-boundary change.

**Independent Test**: Sign in as users/admins with and without TFA in Chromium/WebKit, enroll and use TOTP/recovery codes, reset a password using valid/invalid PINs, invoke recovery as authorized/unauthorized operators, and prove that no device-bound or partially authenticated application session exists.

### Tests for User Story 1

- [X] T013 [P] [US1] Add failing API contract tests for login next steps, enrollment, challenge, profile security, recovery-code rotation, TFA disablement, password change, PIN reset, unchanged opaque-session format, and explicit epoch revocation in `tests/contract/auth.contract.test.ts` (FR-001–FR-007)
- [X] T014 [P] [US1] Add failing unit/integration tests for TOTP windows/replay, one-use recovery codes, five-minute login transactions, generic failures, rate limits, username-pointer consistency, and session revocation after password reset/change, TFA enrollment/disablement, recovery-code rotation, and factor recovery in `apps/api/test/auth/tfa.test.ts` and `apps/api/test/auth/password-reset.test.ts`
- [X] T015 [P] [US1] Add failing security tests for admin zero-bypass, KMS context/IAM least privilege, no-store/no-cache/no-log guarantees, and password/PIN-only recovery denial in `tests/security/tfa-password-reset.security.test.ts` (SC-001, SC-002)
- [X] T016 [P] [US1] Add failing recovery-operator idempotency, authorization, immutable audit, CloudTrail attribution, session revocation, and no-decrypt tests in `tests/security/admin-tfa-recovery.security.test.ts`
- [X] T017 [P] [US1] Add failing Chromium/WebKit TFA enrollment/challenge/recovery-code/PIN-reset/admin-gate journeys in `tests/e2e/auth-tfa-reset.spec.ts` (SC-001, SC-002, SC-007)
- [X] T018 [P] [US1] Add failing restore tests that force restored administrator factors to `recovery_required` and advance session epochs before access in `tests/restore/auth-factor-restore.test.ts`
- [X] T019 [P] [US1] Add failing web startup/reconnect tests for revoked-session detection, immediate protected-cache lock, atomic authorized-data purge, offline-safe messaging, and purge-failure recovery in `apps/web/test/features/session-revalidation.test.tsx` and `apps/web/test/db/revoked-session-purge.test.ts`

### Implementation for User Story 1

- [X] T020 [P] [US1] Define the TFA summary, login-transaction, and session-security domain fields, then replace duplicated username user records with authoritative lookup pointers and an idempotent compatibility migration in `packages/domain/src/user.ts`, `packages/domain/src/session.ts`, `apps/api/src/auth/user-repository.ts`, and `apps/api/src/auth/user-lookup-migration.ts`
- [X] T021 [P] [US1] Implement KMS-context TOTP seed encryption, RFC 6238 verification, counter replay protection, and recovery-code digest helpers in `apps/api/src/auth/tfa-crypto.ts`
- [X] T022 [P] [US1] Implement TFA factor and five-minute login-transaction repositories with conditional consumption and TTL in `apps/api/src/auth/tfa-repository.ts` and `apps/api/src/auth/login-transaction-repository.ts`
- [X] T023 [US1] Implement enrollment, challenge, factor-change step-up, recovery-code rotation, admin enforcement, and explicit `sessionEpoch` revocation after every password/factor boundary while issuing a fresh initiating session only after required TFA in `apps/api/src/auth/tfa-service.ts` (depends on T020–T022)
- [X] T024 [P] [US1] Implement online-only generic PIN password reset with Argon2/dummy verification and account/source throttles in `apps/api/src/auth/password-reset-service.ts` and `apps/api/src/auth/rate-limit.ts`
- [X] T025 [US1] Enforce authoritative enabled TFA and the current session epoch on every protected API request in `apps/api/src/auth/authorizer.ts` and `apps/api/src/auth/session-service.ts`
- [X] T026 [US1] Add login next-step, TFA enrollment/challenge/profile security/factor mutation, password change, and password-reset handlers with `Cache-Control: no-store` in `apps/api/src/auth/handler.ts` and `apps/api/src/auth/handlers.ts`
- [X] T027 [US1] Wire public/authenticated auth routes, scoped WAF controls, KMS context permissions, and no-cache behavior in `infra/lib/auth-stack.ts`, `infra/lib/api-stack.ts`, and `infra/lib/edge-stack.ts`
- [X] T028 [P] [US1] Implement the no-store TFA/password-reset web client without IndexedDB/outbox/service-worker persistence in `apps/web/src/features/auth/security-client.ts` and `apps/web/src/features/auth/session.ts`
- [X] T029 [US1] Implement login challenge, mandatory admin enrollment, recovery-code, and PIN-reset UI with one-time-code semantics in `apps/web/src/features/auth/Login.tsx`, `apps/web/src/features/auth/LoginPage.tsx`, and `apps/web/src/features/auth/TfaChallenge.tsx`
- [X] T030 [US1] Add the authenticated `/profile` security shell and TFA/recovery-code/password controls in `apps/web/src/features/profile/ProfilePage.tsx`, `apps/web/src/features/profile/SecuritySettings.tsx`, and `apps/web/src/app/router.tsx`
- [X] T031 [P] [US1] Implement the idempotent IAM-invoked administrator TFA recovery handler with no KMS decrypt permission in `apps/api/src/admin/admin-tfa-recovery-handler.ts` and `infra/lib/admin-stack.ts`
- [X] T032 [US1] Add safe auth/recovery structured events, metrics, alarms, 90-day retention, and CloudTrail Lambda data-event coverage in `apps/api/src/auth/telemetry.ts` and `infra/lib/observability-stack.ts` (NFR-005, NFR-007)
- [X] T033 [US1] Implement authenticated startup and reconnect revalidation that locks protected UI before validation, atomically purges revoked authorized caches/outbox dependencies, and preserves an actionable retry state when purge fails in `apps/web/src/features/auth/session.ts`, `apps/web/src/app/App.tsx`, and `apps/web/src/sync/privacy-purge.ts` (depends on T019, T025)
- [X] T034 [US1] Implement restored-authentication recovery that advances all user session epochs, sets every administrator factor to `recovery_required`, invalidates login transactions, validates the result before reopening access, and wires the step into the recovery workflow in `apps/api/src/crypto-recovery/restore-testing-validator.ts`, `apps/api/src/crypto-recovery/auth-restore-handler.ts`, and `infra/lib/restore-workflow-stack.ts` (required for T018)
- [X] T035 [US1] Document user TFA/password reset, recovery-operator invocation, CloudTrail audit lookup, rollout ordering, and restored-factor recovery in `docs/user/account-security.md` and `docs/operations/admin-tfa-recovery.md`

**Checkpoint**: User Story 1 is deployable as the security MVP; administrators have no password/PIN-only bypass and existing sessions remain opaque cookies.

---

## Phase 4: User Story 2 - Edit Complete Task Details in Context (Priority: P1)

**Goal**: Provide atomic modal task editing with accessible searchable parent/group references, limited structured memo formatting, browser-local date/time semantics, five-minute choices, and empty undated display.

**Independent Test**: From each primary task representation, edit every field online/offline in a focus-safe modal, cancel dirty input, round-trip all allowed memo formats, choose/clear authorized parents, preserve legacy due instants/off-grid values, change browser zones, and verify no undated placeholder.

### Tests for User Story 2

- [X] T036 [P] [US2] Add failing domain tests for MemoDocument normalization/projection, hidden payload v1/v2 compatibility, due-kind invariants, DST rejection, and no-rounding behavior in `packages/domain/src/task.test.ts` and `packages/domain/src/crypto/hidden-memo-package.test.ts` (FR-011–FR-015)
- [X] T037 [P] [US2] Add failing task API tests for atomic patch validation, parent authorization/cycle prevention, rich memo sanitization, and concurrent conflicts in `apps/api/test/tasks/task-edit-modernization.test.ts`
- [X] T038 [P] [US2] Add failing component accessibility tests for dialog focus/dirty dismissal, Downshift parent/group controls, rich-text toolbar, five-minute choices, and empty dates in `apps/web/test/features/task-edit-dialog.test.tsx`
- [X] T039 [P] [US2] Add failing hidden-memo/search tests for structured encrypted payload, unsupported paste stripping, lock/purge, projection indexing, and export-safe behavior in `apps/web/test/crypto/hidden-memo-rich-text.test.ts`
- [X] T040 [P] [US2] Add failing Chromium/WebKit desktop/iPhone/iPad edit journeys covering online/offline, keyboard/touch, VoiceOver semantics, zone changes, DST, legacy off-grid time, conflict, and cancel in `tests/e2e/task-edit-modal.spec.ts` (SC-003, SC-007, SC-010, SC-012)
- [X] T041 [P] [US2] Add cached modal/editor and 1,000-option combobox performance assertions in `tests/performance/task-edit-modernization.test.ts` (NFR-006)
- [X] T042 [P] [US2] Add focused Google regression tests proving task due UI/schema changes preserve existing import, merge, publish, date-boundary, DST, and legacy `dueTimeZone` behavior in `tests/integration/google-sync-import.test.ts`, `tests/integration/google-sync-merge.test.ts`, and `tests/integration/google-sync-publish.test.ts` (FR-015, FR-035)

### Implementation for User Story 2

- [X] T043 [P] [US2] Implement versioned MemoDocument, deterministic plain projection, date-only/timed due semantics, and task validation in `packages/domain/src/task.ts` and `packages/domain/src/memo-document.ts`
- [X] T044 [P] [US2] Implement hidden memo v2 document/text encryption with v1 read compatibility in `packages/domain/src/crypto/hidden-memo-package.ts` and `apps/web/src/crypto/hidden-memo.ts`
- [X] T045 [US2] Extend task create/patch/snapshot contracts and mutable-field allowlists for memo document and due semantics in `packages/contracts/src/openapi.ts` and `apps/api/src/tasks/task-policy.ts`
- [X] T046 [US2] Persist and independently validate atomic memo/due/parent changes and version conflicts in `apps/api/src/tasks/task-service.ts` and `apps/api/src/tasks/task-repository.ts`
- [X] T047 [P] [US2] Add shared browser-zone conversion, five-minute option, off-grid preservation, and DST round-trip utilities in `apps/web/src/features/tasks/due-value.ts` and `packages/domain/src/due-date.ts`
- [X] T048 [P] [US2] Implement the lazy constrained Lexical editor and safe React renderer without HTML injection in `apps/web/src/features/memos/MemoEditor.tsx` and `apps/web/src/features/memos/MemoDocumentView.tsx`
- [X] T049 [P] [US2] Implement the reusable bounded Downshift `ReferenceCombobox` with authorized ID-only selection, clear/no-result/offline states, and duplicate-label context in `apps/web/src/components/ReferenceCombobox.tsx`
- [X] T050 [US2] Implement native `showModal()` task editing, latest-durable initialization, atomic save, focus restoration, busy state, and dirty-dismiss confirmation in `apps/web/src/features/tasks/TaskEditDialog.tsx`
- [X] T051 [US2] Integrate memo, parent combobox, due-kind/date/time controls, validation, and unchanged off-grid behavior in `apps/web/src/features/tasks/TaskForm.tsx`
- [X] T052 [US2] Replace editable detail-aside actions with the shared dialog across list, subtask, stack, and post-it representations in `apps/web/src/features/tasks/TaskListPage.tsx`, `apps/web/src/features/tasks/TaskRow.tsx`, `apps/web/src/features/stacks/StackRow.tsx`, and `apps/web/src/features/postit/PostItNote.tsx`
- [X] T053 [US2] Extend encrypted local task/revision/outbox/conflict persistence for memo documents and due fields in `apps/web/src/db/task-repository.ts`, `apps/web/src/sync/sync-engine.ts`, and `apps/web/src/sync/conflict-resolution.ts`
- [X] T054 [US2] Integrate rich hidden memo rendering/search/copy and prevent plaintext indexing/logging in `apps/web/src/features/memos/HiddenMemoEditor.tsx`, `apps/web/src/search/task-index.ts`, and `apps/web/src/search/hidden-memo-index.ts`
- [X] T055 [US2] Keep Google synchronization behavior unchanged; add only the minimum compatibility adapter required by the new task due schema when T042 demonstrates a concrete regression in `apps/api/src/google-sync/import-service.ts`, `apps/api/src/google-sync/merge-service.ts`, and `apps/api/src/google-sync/publish-service.ts`
- [X] T056 [US2] Remove `Someday`/no-date placeholders, add compact responsive dialog/editor/combobox styles, and refresh local display on zone changes in `apps/web/src/features/tasks/TaskRow.tsx`, `apps/web/src/features/postit/PostItNote.tsx`, and `apps/web/src/styles/app.css`
- [X] T057 [US2] Document the modal, supported memo semantics, due-date meanings, browser-zone behavior, legacy compatibility, and offline conflicts in `docs/user/task-editing.md` and `docs/operations/task-data-modernization.md`

**Checkpoint**: User Story 2 is independently usable offline and across supported browsers without changing timer, ranking, or reporting behavior.

---

## Phase 5: User Story 3 - Focus with a Repeating Task Timer (Priority: P1)

**Goal**: Deliver one owner-private, account-wide synchronized task timer with a ten-minute default, repeat, correct elapsed projection, offline durability, and visible cross-device conflicts.

**Independent Test**: Run all timer commands across navigation, reload, suspension, offline use, long repeat gaps, and two devices; verify timestamp-derived state, explicit switching, owner-only visibility, completion feedback once per active device and interval, no task `CompletionEvent`, no task completion mutation, and conflict convergence.

### Tests for User Story 3

- [X] T058 [P] [US3] Add failing TaskTimer state-machine/property tests for bounds, transitions, repeat arithmetic, clock anomalies, new runs, completion feedback once per active device and interval, no task `CompletionEvent`, and no task-completion side effect in `packages/domain/src/task-timer.test.ts` (FR-016–FR-019)
- [X] T059 [P] [US3] Add failing API repository/sync tests for deterministic uniqueness, base-version contention, receipts, owner feeds, authorization revocation, and safe conflict reasons in `apps/api/test/sync/task-timer-sync.test.ts`
- [X] T060 [P] [US3] Add failing Dexie tests for atomic optimistic timer/outbox writes, encrypted feedback checkpoints, restart recovery, and reapply/discard in `apps/web/test/db/task-timer-offline.test.ts`
- [X] T061 [P] [US3] Add failing timer component tests for ten-minute default, controls, switch confirmation, status announcements, and unavailable feedback in `apps/web/test/features/task-timer.test.tsx`
- [X] T062 [P] [US3] Add failing two-context Chromium/WebKit timer journeys for offline conflict, navigation/reload/background, repeat gaps, clock correction, and task-access purge in `tests/e2e/task-timer.spec.ts` (SC-004, SC-007, SC-012)
- [X] T063 [P] [US3] Add failing timer restore/invariant and zero-passive-AWS-request performance tests in `tests/restore/task-timer-restore.test.ts` and `tests/performance/task-timer.test.ts`

### Implementation for User Story 3

- [X] T064 [P] [US3] Implement the TaskTimer entity/schema, transition validator, effective-state projection, bounded repeat arithmetic, and feedback identity `{runId, intervalOrdinal}` in `packages/domain/src/task-timer.ts`
- [X] T065 [P] [US3] Add deterministic timer keys, current/revision/receipt persistence, and owner-feed transaction in `apps/api/src/shared/keys.ts` and `apps/api/src/timers/task-timer-repository.ts`
- [X] T066 [US3] Implement owner/task authorization, server-time normalization, semantic command execution, explicit switch, and revocation quarantine in `apps/api/src/timers/task-timer-service.ts`
- [X] T067 [US3] Extend sync version 5 dispatch/bootstrap/pull/results for `taskTimer` and safe problems in `apps/api/src/sync/types.ts`, `apps/api/src/sync/sync-service.ts`, and `apps/api/src/sync/handlers.ts`
- [X] T068 [P] [US3] Add the story-owned encrypted timer/checkpoint stores through the shared migration runner and implement the local timer projection, feedback checkpoint, and atomic outbox repository in `apps/web/src/db/database.ts`, `apps/web/src/db/schema.ts`, and `apps/web/src/db/task-timer-repository.ts`
- [X] T069 [US3] Integrate timer v5 pull/push, server offset, typed conflicts, revocation purge, and reapply/discard in `apps/web/src/sync/sync-engine.ts`, `apps/web/src/sync/conflict-resolution.ts`, and `apps/web/src/sync/privacy-purge.ts`
- [X] T070 [P] [US3] Implement monotonic live ticking and timestamp-based recovery without background correctness dependence in `apps/web/src/features/timers/useTaskTimer.ts`
- [X] T071 [US3] Implement responsive accessible timer controls, task association, repeat feedback, switch confirmation, and pending/conflict states in `apps/web/src/features/timers/TaskTimer.tsx` and `apps/web/src/features/tasks/TaskActions.tsx`
- [X] T072 [US3] Add timer structured events, metrics, alarms, dashboards, and invariant restore checks in `apps/api/src/timers/telemetry.ts`, `infra/lib/observability-stack.ts`, and `apps/api/src/crypto-recovery/task-timer-restore-validator.ts`
- [X] T073 [US3] Document timer privacy, state transitions, offline/cross-device conflict resolution, feedback limits, recovery, and cost behavior in `docs/user/task-timer.md` and `docs/operations/task-timer.md`

**Checkpoint**: User Story 3 is owner-private, offline capable, and synchronizes without schedulers or silent command loss.

---

## Phase 6: User Story 4 - Rank Tasks Efficiently at Any Size (Priority: P2)

**Goal**: Enhance personal stack ranking with pointer/touch drag while retaining equivalent keyboard controls, verify that no persisted Extra Low content exists, delete Extra Low from active code/contracts/UI, and provide compact accessible priority marks.

**Independent Test**: Reorder filtered/unfiltered overall/project stacks with pointer, touch, and keyboard; verify identical owner-only rank results and feedback; prove the pre-deployment data inventory contains zero Extra Low records, reject any unexpected value without mutation, delete the value from active code, and inspect priority badges in dense responsive layouts.

### Tests for User Story 4

- [X] T074 [P] [US4] Add failing domain/contract tests that delete `extra_low` from active schemas, imports, filters, reports, and exports and reject it as invalid input in `packages/domain/src/__tests__/urgency.test.ts`, `packages/domain/src/task.test.ts`, and `packages/contracts/src/urgency-stack-ranking-openapi.test.ts` (FR-020–FR-023)
- [X] T075 [P] [US4] Add failing read-only pre-deployment inventory tests that scan task, list, completion/report/workload, stack snapshot, and current backup fixtures, require a zero `extra_low` count, and abort without mutation if any value is found in `tests/integration/extra-low-removal-guard.test.ts`
- [X] T076 [P] [US4] Add failing Dexie upgrade tests that require zero encrypted/current/pending `extra_low` values and preserve every record, rank, outbox entry, key, setting, and conflict while removing obsolete schema branches in `apps/web/test/db/extra-low-removal.test.ts`
- [X] T077 [P] [US4] Add failing component accessibility tests for drag handles, invalid targets, keyboard parity, live announcements, reduced motion, and compact priority glyphs in `apps/web/test/features/stack-drag-priority.test.tsx`
- [X] T078 [P] [US4] Add failing Chromium/WebKit pointer/touch/keyboard filtered-ranking and dense priority journeys in `tests/e2e/personal-stack-drag.spec.ts` (SC-005, SC-006, SC-007)
- [X] T079 [P] [US4] Add failing restore/security/performance tests for universal `extra_low` rejection, zero persisted values, owner-rank isolation, and 200 ms feedback in `tests/restore/extra-low-removal-restore.test.ts`, `tests/security/urgency-rank-exports.test.ts`, and `tests/performance/urgency-stack-ranking.test.ts`

### Implementation for User Story 4

- [X] T080 [P] [US4] Delete `extra_low` from the central urgency enum/default/parser and active task/list/contracts so only `low|medium|high|critical` remain in `packages/domain/src/urgency.ts`, `packages/domain/src/task.ts`, `packages/domain/src/list.ts`, and `packages/contracts/src/urgency-stack-ranking-openapi.ts`
- [X] T081 [US4] Implement a read-only, fail-closed pre-deployment inventory that reports bounded counts for every persisted active location and permits deletion rollout only when all `extra_low` counts are zero in `apps/api/src/projects/extra-low-inventory-handler.ts`, `infra/lib/migration-stack.ts`, and `scripts/operations/verify-no-extra-low.sh`
- [X] T082 [US4] Delete Extra Low branches from completion events, work views, workload projections, counters, import/export inputs, and stack filters without rewriting data or rank in `apps/api/src/reporting/completion-event-repository.ts`, `apps/api/src/reporting/work-view-repository.ts`, `apps/api/src/reporting/workload-projection-repository.ts`, and `apps/api/src/ranking/stack-repository.ts`
- [X] T083 [US4] Remove Extra Low compatibility branches from Dexie schemas, filters, and pending-mutation validation while aborting the upgrade if the T075/T076 zero-data invariant is violated in `apps/web/src/db/database.ts`, `apps/web/src/db/schema.ts`, and `apps/web/src/db/outbox.ts`
- [X] T084 [P] [US4] Implement full/compact `UrgencyBadge` modes with distinct fixed glyph/shape, contrast, and accessible names in `apps/web/src/components/UrgencyBadge.tsx` and `apps/web/src/styles/app.css`
- [X] T085 [P] [US4] Implement dnd-kit pointer/touch sensors, collision/autoscroll, valid visible targets, and textual feedback in `apps/web/src/features/stacks/StackList.tsx` and `apps/web/src/features/stacks/StackRow.tsx`
- [X] T086 [US4] Translate valid drops into the existing filtered personal move operation while retaining move-up/down/to-position controls and focus return in `apps/web/src/features/stacks/PersonalStackPage.tsx` and `apps/web/src/features/stacks/StackMoveControls.tsx`
- [X] T087 [US4] Complete the Extra Low file inventory and delete every active UI/filter/legend/report/CSV/style occurrence, including priority controls and fixtures, in `apps/web/src/components/PriorityFilter.tsx`, `apps/web/src/features/tasks/TaskForm.tsx`, `apps/web/src/search/task-filters.ts`, `apps/web/src/features/reports/CompletionDashboard.tsx`, `apps/web/src/styles/app.css`, and `tests/fixtures/urgency-stack-ranking.ts`
- [X] T088 [US4] Emit a safe deployment-blocked metric/alarm when the read-only inventory is nonzero and remove obsolete backfill configuration in `apps/api/src/projects/extra-low-inventory-handler.ts`, `infra/lib/observability-stack.ts`, and `apps/api/src/projects/migration-config.ts`
- [X] T089 [US4] Reject `extra_low` in both current and restored active/immutable records and verify zero occurrences after restoration in `tests/restore/full-restore.test.ts`, `apps/api/src/crypto-recovery/restore-testing-validator.ts`, and `apps/api/src/crypto-recovery/personal-stack-restore-validator.ts`
- [X] T090 [US4] Document drag/keyboard ranking, compact priority meaning, the zero-data precondition, removal guard, abort procedure, and restoration verification in `docs/user/urgency-stack-ranking.md` and `docs/operations/urgency-stack-ranking.md`

**Checkpoint**: User Story 4 provides equivalent pointer/touch/keyboard ranking and deletes Extra Low only after the read-only inventory proves that no persisted value requires migration.

---

## Phase 7: User Story 5 - Separate Personal Settings from Administration (Priority: P2)

**Goal**: Separate personal profile settings from system administration, present users in a bounded responsive table, and require authorized group dropdowns everywhere.

**Independent Test**: Use `/profile` as an ordinary user, invoke `/admin` as admin/non-admin, page a 10,000-user fixture, operate table actions responsively/accessibly, and use every group field without arbitrary values.

### Tests for User Story 5

- [X] T091 [P] [US5] Add failing admin-page contract tests for opaque cursor/100-row limits, stable identity, safe TFA summary, bounded group summary, and authorized group IDs in `tests/contract/admin.contract.test.ts` (FR-024–FR-027)
- [X] T092 [P] [US5] Add failing API authorization/pagination/version/self/last-admin tests in `apps/api/test/admin/user-table.test.ts` and `tests/security/admin.security.test.ts`
- [X] T093 [P] [US5] Add failing component tests for profile/admin separation, semantic table structure, responsive actions, and shared group combobox behavior in `apps/web/test/features/profile-admin.test.tsx`
- [X] T094 [P] [US5] Add failing Chromium/WebKit desktop/iPhone/iPad profile discovery, admin denial, user-table, and group-selector journeys in `tests/e2e/profile-admin.spec.ts` (SC-007, SC-008)
- [X] T095 [P] [US5] Add failing 10,000-user bounded initial-result performance test in `tests/performance/admin-user-table.test.ts` (NFR-006)

### Implementation for User Story 5

- [X] T096 [US5] Complete `/profile` with reminder, sound, Google setup, password, TFA, and personal settings panels in `apps/web/src/features/profile/ProfilePage.tsx`, `apps/web/src/features/reminders/ReminderSettings.tsx`, `apps/web/src/features/tasks/CompletionSoundSetting.tsx`, and `apps/web/src/features/google-sync/GoogleSyncPage.tsx`
- [X] T097 [US5] Separate and role-gate `/profile`, `/admin`, and compatibility `/google` navigation without relying on UI-only authorization in `apps/web/src/app/router.tsx` and `apps/web/src/app/App.tsx`
- [X] T098 [US5] Implement stable username/ID ordered admin-user pagination with opaque cursors, bounded group summaries, and safe account state in `apps/api/src/admin/handler.ts` and `apps/api/src/admin/user-admin-service.ts`
- [X] T099 [US5] Render the administrator user list as a semantic responsive paged table with accessible version-aware row actions in `apps/web/src/features/admin/UsersAdminPage.tsx` and `apps/web/src/features/admin/admin-client.ts`
- [X] T100 [US5] Record the group-ID control inventory (the raw `groupId` input in `TaskForm` and native group select in `ListVisibilityControl`) and replace those two controls with the shared authorized `ReferenceCombobox` in `apps/web/src/features/tasks/TaskForm.tsx` and `apps/web/src/features/lists/ListVisibilityControl.tsx`; keep `apps/web/src/features/groups/JoinGroupDialog.tsx` unchanged because it accepts only the PIN for an already selected group
- [X] T101 [US5] Add server-side group-ID authorization, admin denial telemetry, safe paging metrics, and responsive table styles in `apps/api/src/groups/group-service.ts`, `apps/api/src/admin/admin-authorization.ts`, `infra/lib/observability-stack.ts`, and `apps/web/src/styles/app.css`
- [X] T102 [US5] Document profile/admin navigation, user table actions, group dropdown semantics, and authorization boundaries in `docs/user/profile-and-administration.md` and `docs/security/authorization-model.md`

**Checkpoint**: User Story 5 cleanly separates personal and privileged surfaces while retaining server enforcement.

---

## Phase 8: User Story 6 - Add and Manage List Items without Admin Clutter (Priority: P2)

**Goal**: Capture an optional signed amount during initial list-item creation and move global reusable-item administration to a separate established-permission destination.

**Independent Test**: Add no-amount, positive, and cost items online/offline in one operation; reject invalid values without partial creation; verify totals; and manage global items only from `/directory` while list linking/reset remains available.

### Tests for User Story 6

- [X] T103 [P] [US6] Add failing repository/integration tests for atomic name+amount create, idempotent retry, invalid amount, totals, and offline outbox preservation in `apps/web/test/db/list-item-initial-amount.test.ts` and `tests/integration/list-repository.test.ts` (FR-028)
- [X] T104 [P] [US6] Add failing component tests for retained valid input, signed amount semantics, immediate totals, and absence of global CRUD on list pages in `apps/web/test/features/list-add-directory.test.tsx`
- [X] T105 [P] [US6] Add failing Chromium/WebKit list amount/offline retry and separate directory journeys in `tests/e2e/list-item-amount-directory.spec.ts` (SC-011, SC-012)
- [X] T106 [P] [US6] Add failing security tests that preserve existing global-directory authorization and deny stale/revoked permissions in `tests/security/directory-authorization.security.test.ts` (FR-025, FR-029)

### Implementation for User Story 6

- [X] T107 [US6] Extend the local list-item create signature to accept parsed `amountMinor` and atomically persist item plus outbox mutation in `apps/web/src/db/list-repository.ts`
- [X] T108 [US6] Add name, optional amount, and positive/cost controls using the existing money parser with field-level validation in `apps/web/src/features/lists/ListItems.tsx` and `apps/web/src/features/lists/ListItemValueEditor.tsx`
- [X] T109 [P] [US6] Create the authorized `/directory` page around existing global reusable-item controls in `apps/web/src/features/lists/GlobalDirectoryPage.tsx` and `apps/web/src/app/router.tsx`
- [X] T110 [US6] Remove global directory CRUD from individual list views while retaining linked-item selection/reset in `apps/web/src/features/lists/ListPage.tsx`, `apps/web/src/features/lists/GlobalDirectory.tsx`, and `apps/web/src/features/lists/ListItemRow.tsx`
- [X] T111 [US6] Preserve immediate signed totals and actionable pending/failure/conflict feedback for initial amount creation in `apps/web/src/features/lists/ListTotal.tsx` and `apps/web/src/features/lists/useEffectiveListItems.ts`
- [X] T112 [US6] Document initial amount entry, signed meaning, offline behavior, directory routing, and unchanged permissions in `docs/user/lists-and-global-directory.md`

**Checkpoint**: User Story 6 captures complete list-item input atomically and removes global administration clutter without a permission change.

---

## Phase 9: User Story 8 - Choose a Post-it Color while Editing (Priority: P3)

**Goal**: Let users choose a fixed accessible per-task post-it color override in the edit modal and synchronize it atomically.

**Independent Test**: Select every color by pointer/keyboard/touch, save and cancel online/offline, resolve a conflict, and verify explicit/category/default precedence with non-color meaning and no unrelated field changes.

### Tests for User Story 8

- [X] T113 [P] [US8] Add failing domain/contract/repository tests for the fixed color enum, optional override, atomic task patch, revision, and sync conflict in `packages/domain/src/task.test.ts` and `apps/api/test/tasks/post-it-color.test.ts` (FR-034)
- [X] T114 [P] [US8] Add failing component tests for labeled radio swatches, checked state, category/default precedence, cancel/failure/conflict, and contrast in `apps/web/test/features/post-it-color.test.tsx`
- [X] T115 [P] [US8] Add failing Chromium/WebKit pointer/keyboard/touch modal color journeys in `tests/e2e/post-it-color.spec.ts` (SC-007, SC-011)
- [X] T116 [P] [US8] Add failing offline/restart/sync-conflict preservation test in `apps/web/test/db/post-it-color-offline.test.ts` (SC-012)

### Implementation for User Story 8

- [X] T117 [US8] Add optional `postItColor` to task create/patch/revision/sync persistence with fixed-enum server validation in `packages/domain/src/task.ts`, `packages/contracts/src/openapi.ts`, and `apps/api/src/tasks/task-service.ts`
- [X] T118 [US8] Add labeled color radio swatches to the existing atomic task edit transaction in `apps/web/src/features/tasks/TaskForm.tsx` and `apps/web/src/features/tasks/TaskEditDialog.tsx`
- [X] T119 [US8] Implement centralized explicit-task → category → yellow resolution with an audited accessible palette in `apps/web/src/styles/category-color.ts`, `apps/web/src/features/postit/PostItNote.tsx`, and `apps/web/src/features/postit/PostItBoard.tsx`
- [X] T120 [US8] Document post-it color meanings, precedence, accessibility, offline behavior, and conflict outcomes in `docs/user/post-it-colors.md`

**Checkpoint**: User Story 8 adds the requested visual override without arbitrary CSS or color-only meaning.

---

## Phase 10: User Story 7 - Export Complete Tasks without Time-Zone Controls (Priority: P2)

**Goal**: Remove report time-zone controls and provide a server-generated, snapshot-consistent, fully documented and authorized completed-task CSV with integrity and spreadsheet-safety guarantees.

**Independent Test**: Filter across zone/DST boundaries, request self/admin-confirmed exports, validate the exact 56-column schema against 10,000 rows and adversarial content, interrupt generation, revoke authorization, and prove no partial/secret-bearing result is downloadable.

### Tests for User Story 7

- [X] T121 [P] [US7] Add failing completion-export API contract tests for browser zone, `asOf`, idempotency, self/all-user confirmation, job status, and owner-authorized result in `tests/contract/completion-reporting.contract.test.ts` (FR-030–FR-033)
- [X] T122 [P] [US7] Add failing exact-header/56-field, RFC 4180, deterministic JSON, formula-neutralization, Unicode/RTL/newline, hidden-memo, attachment, and legacy-priority fixtures in `tests/integration/export-transformer.test.ts` (SC-009)
- [X] T123 [P] [US7] Add failing snapshot/idempotency/interruption/checksum/row-count/result-authorization workflow tests in `tests/integration/completion-export-workflow.test.ts`
- [X] T124 [P] [US7] Add failing self/all-user row-and-field authorization, confirmation audit, private-object, factor/session, and encrypted-data exclusion tests in `tests/security/completion-export.security.test.ts`
- [X] T125 [P] [US7] Add failing report component tests for no zone control, obsolete preference removal, browser-zone refresh, job progress, and no partial Blob in `apps/web/test/features/completion-export.test.tsx`
- [X] T126 [P] [US7] Add failing Chromium/WebKit zone/DST filter and complete export download journeys in `tests/e2e/completion-export.spec.ts` (SC-007, SC-009, SC-010)
- [X] T127 [P] [US7] Add failing 10,000-row bounded presentation/export throughput and interruption recovery tests in `tests/performance/completion-export.test.ts` (NFR-006)

### Implementation for User Story 7

- [X] T128 [P] [US7] Extend the versioned export-job domain with completion scope, normalized filters, browser zone, snapshot, integrity, and schema metadata in `packages/domain/src/export-job.ts`
- [X] T129 [P] [US7] Add completion-export request/job/result schemas and exact v1 CSV header constants in `packages/contracts/src/archive-project-reporting-openapi.ts` and `packages/contracts/src/completed-task-csv.ts`
- [X] T130 [US7] Remove user-supplied time-zone filters, accept/validate silent `browserTimeZone`, ignore obsolete saved zone values, and calculate browser-local boundaries in `apps/api/src/reporting/handlers.ts` and `apps/api/src/reporting/completion-report-service.ts`
- [X] T131 [US7] Hydrate and independently authorize every completed task/subtask field and related reminder/Google/attachment/rank metadata at `asOf` in `apps/api/src/reporting/completion-event-repository.ts` and `apps/api/src/exports/completion-export-service.ts`
- [X] T132 [US7] Implement the exact stable CSV schema, safe empty/repeated encodings, formula neutralization, and protected-field exclusions in `apps/api/src/exports/csv-transformer.ts`
- [X] T133 [US7] Implement idempotent completion export coordination, resumable snapshot workflow, and post-generation header/row/checksum validation in `apps/api/src/exports/coordinator-handler.ts`, `apps/api/src/exports/workflow-handler.ts`, and `apps/api/src/exports/result-service.ts`
- [X] T134 [US7] Wire completion-export routes, Step Functions/S3/KMS permissions, private lifecycle, admin confirmation audit, and no partial result access in `infra/lib/reporting-stack.ts`, `infra/lib/export-stack.ts`, and `infra/lib/api-stack.ts`
- [X] T135 [P] [US7] Remove report zone UI/preference, derive current browser zone at confirmation, and add export job polling/download validation in `apps/web/src/features/reports/CompletionFilters.tsx`, `apps/web/src/features/reports/report-client.ts`, and `apps/web/src/features/reports/CompletionDashboard.tsx`
- [X] T136 [US7] Add safe export lifecycle/failure/integrity metrics, alarms, correlation, retention, and admin-scope audit events in `apps/api/src/reporting/telemetry.ts` and `infra/lib/observability-stack.ts` (NFR-005)
- [X] T137 [US7] Extend full restore validation for export job ownership/integrity and priority/memo exclusions in `tests/restore/full-restore.test.ts`
- [X] T138 [US7] Document report browser-zone behavior, exact CSV v1 schema, field authorization/exclusions, operator failure recovery, retention, and cost in `docs/user/completed-task-export.md` and `docs/operations/completion-export.md`

**Checkpoint**: User Story 7 exports complete authorized records safely and never presents an interrupted partial artifact as success.

---

## Phase 11: Polish & Cross-Cutting Quality Gates

**Purpose**: Verify the integrated feature against constitution, performance, browser, recovery, observability, cost, and required-validation constraints.

- [X] T139 Recount tests and rerun `/usr/bin/time -p npm run test:e2e:quick`, compare with T001, keep only representative high-value journeys, and record results in `docs/testing/task-security-modernization-validation.md`
- [X] T140 [P] Run and record the exhaustive Chromium/WebKit desktop/iPhone/iPad matrix, accessibility scan, zoom, touch, reduced-motion, and background limitations in `docs/testing/task-security-modernization-browser-report.md` (SC-007)
- [X] T141 [P] Validate every NFR-006 latency/scale target under representative mobile and degraded-network profiles and record evidence in `docs/testing/task-security-modernization-performance-report.md`
- [X] T142 [P] Run the integrated online/offline/restart/reconnect/conflict matrix for task, memo, timer, rank, list amount, and color changes and record zero-silent-loss evidence in `docs/testing/task-security-modernization-offline-report.md` (SC-012)
- [X] T143 [P] Complete the final authentication, authorization, hidden-data, timer privacy, CSV, dependency, and no-device-binding threat review in `docs/security/task-security-modernization-review.md` (NFR-001)
- [X] T144 [P] Run backup/PITR/full-restore/migration recovery drills for factor, timer, task, priority, and export invariants and update `docs/operations/restore-test-report.md` (NFR-002)
- [X] T145 [P] Validate CloudWatch safe fields, protected-data exclusions, retention, dashboards, metrics, alarms, and estimated cardinality/cost in `docs/operations/observability-review.md` (NFR-005)
- [X] T146 [P] Synthesize CDK and review KMS/IAM/WAF/CloudTrail/S3/Step Functions/DynamoDB serverless cost and scaling assumptions in `docs/operations/task-security-modernization-aws-review.md` (NFR-007)
- [X] T147 [P] Update architecture, setup, support, and feature navigation documentation in `README.md` and `docs/architecture/task-security-modernization.md`
- [X] T148 Re-review the final diff for correctness, unnecessary complexity, security, durability, errors, logs, tests, browser support, comments, and documentation; record disposition in `docs/reviews/task-security-modernization-final-review.md`
- [X] T149 Run `npm run validate`, `npm run test:e2e`, `npm run validate:pre-aws:browsers`, `npm run test:performance`, `npm run test:observability`, and `npm run cdk:synth`, recording commands and results in `docs/testing/task-security-modernization-validation.md`
- [X] T150 Confirm the hosted required PR check remains at or below ten minutes with workflow timeout headroom and record the run link/duration in `docs/testing/task-security-modernization-validation.md`
- [X] T151 Verify ownership, sharing, invitation, revocation, cached purge, and collaboration boundaries remain enforced for tasks while timers/factors stay private in `tests/security/task-security-modernization-boundaries.security.test.ts`
- [X] T152 Execute every scenario in `specs/009-task-security-modernization/quickstart.md` and record any N/A gate with rationale in `docs/testing/task-security-modernization-validation.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependency; T001 must finish before required browser tests are expanded.
- **Foundational (Phase 2)**: Depends on Setup and blocks user-story implementation.
- **US1 (Phase 3)**: Depends on Foundation; security MVP and `/profile` security shell.
- **US2 (Phase 4)**: Depends on Foundation; can proceed independently of US1 except final navigation integration.
- **US3 (Phase 5)**: Depends on Foundation; independent of US1/US2 at domain/API level.
- **US4 (Phase 6)**: Depends on Foundation; the read-only zero-data inventory must pass before Extra Low code deletion is deployed.
- **US5 (Phase 7)**: Depends on Foundation and integrates the `/profile` security shell from US1 plus `ReferenceCombobox` from US2.
- **US6 (Phase 8)**: Depends on Foundation; independent of other stories except shared routing conventions.
- **US8 (Phase 9)**: Depends on Foundation and the task edit dialog from US2. It executes before US7 despite its P3 product priority because its field must exist before the all-fields CSV schema is frozen.
- **US7 (Phase 10)**: Depends on Foundation and consumes the final task fields from US2/US8 and the four-value priority contract from US4 for complete v1 output.
- **Polish (Phase 11)**: Depends on every story included in the release.

### User-story completion graph

```text
Setup → Foundation ─┬→ US1 ───────────┐
                    ├→ US2 ─┬→ US5    │
                    │       ├→ US8 ─┐ │
                    ├→ US3  │       │ │
                    ├→ US4 ─────────┼→ US7
                    └→ US6          │ │
                                    └─┴→ Polish
```

US8 executes before US7 solely to make the post-it color field available before the completed-task CSV v1 schema and integration fixtures are frozen. US5 and US8 remain independently testable increments once their explicitly reused UI primitive/dialog exists.

### Within each user story

- Write the story's listed tests first and confirm the intended failures.
- Complete domain/schema and persistence before services/handlers.
- Complete server authorization and idempotency before UI integration.
- Complete offline/conflict behavior before marking task-data stories done.
- Pass the story's independent test and applicable Chromium/WebKit journeys before advancing its checkpoint.

## Parallel Opportunities

- **Setup**: T003–T005 can run in parallel after T001/T002 scope is understood.
- **Foundation**: T006–T008 can run in parallel; T009–T012 then implement only version negotiation and migration scaffolding. Story schema, persistence, and telemetry work stays in US1–US8.
- **US1**: T013–T019 tests can be authored in parallel; T020–T024/T028/T031 implement separate boundaries before T033/T034 integration.
- **US2**: T036–T042 tests can run in parallel; T043/T044/T047–T049 can be implemented concurrently before dialog integration.
- **US3**: T058–T063 tests can run in parallel; domain, server persistence, local persistence, and hook work split across T064/T065/T068/T070.
- **US4**: T074–T079 tests can run in parallel; priority badge and drag UI (T084–T086) can proceed alongside zero-data inventory and removal work (T080–T083).
- **US5**: T091–T095 tests can run in parallel; API paging and profile composition can proceed before final UI integration.
- **US6**: T103–T106 tests can run in parallel; directory routing and amount persistence/UI can split until integration.
- **US7**: T121–T127 tests can run in parallel; domain/contracts and client filter/job UI can proceed alongside server workflow implementation.
- **US8**: T113–T116 tests can run in parallel; persistence and palette/rendering can split before dialog integration.
- **Polish**: T140–T147 can run in parallel after all desired stories, followed by final review and complete validation.

## Parallel Examples by User Story

```text
US1: T013 auth contracts | T014 auth integration | T015 security | T016 operator | T017 browser | T018 restore | T019 reconnect purge
US2: T036 domain | T037 API | T038 components | T039 hidden memo | T040 browser | T041 performance | T042 Google regression
US3: T058 state machine | T059 sync | T060 Dexie | T061 component | T062 browser | T063 restore/performance
US4: T074 schema | T075 server inventory guard | T076 Dexie removal guard | T077 component | T078 browser | T079 restore/security/performance
US5: T091 contract | T092 API/security | T093 component | T094 browser | T095 performance
US6: T103 persistence | T104 component | T105 browser | T106 security
US7: T121 contract | T122 transformer | T123 workflow | T124 security | T125 component | T126 browser | T127 performance
US8: T113 domain/API | T114 component | T115 browser | T116 offline
```

## Implementation Strategy

### MVP first

1. Complete Setup and Foundation.
2. Deliver US1 alone as the security MVP.
3. Deploy and validate the recovery-operator path before enabling mandatory administrator TFA.
4. Confirm administrator zero-bypass, session revocation, restore safety, and supported-browser sign-in before adding experience features.

### Incremental delivery

1. Add US2 modal editing and US3 timer as separate P1 increments.
2. Add US4 ranking/priority, US5 profile/admin, and US6 list refinements as P2 increments.
3. Complete US8 color before freezing US7's all-fields CSV v1 schema.
4. Complete integrated Polish gates and the measured required-validation check.

### Completion rule

No story is complete until its independent test passes, applicable online/offline conflicts are visible, required Chromium/WebKit classes pass, security/data-loss paths are covered, CloudWatch behavior is safe, and its documentation is current.
