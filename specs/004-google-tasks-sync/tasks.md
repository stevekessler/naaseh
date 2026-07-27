# Tasks: Bidirectional Google Tasks Sync

**Input**: Design documents from `/specs/004-google-tasks-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit, integration, contract, security, infrastructure, performance, and Playwright coverage
are required by the constitution for the state-changing provider integration.

**Organization**: Tasks are grouped by user story and ordered so each phase can be tested at its
checkpoint. Every provider effect must be idempotent and every failure visible before a task is
checked complete.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish feature modules and shared schemas without changing runtime behavior.

- [x] T001 Create Google synchronization domain schemas and exports in packages/domain/src/google-sync.ts and packages/domain/src/index.ts
- [x] T002 [P] Add Google synchronization HTTP contract schemas and exports in packages/contracts/src/google-sync-openapi.ts and packages/contracts/src/index.ts
- [x] T003 [P] Add Google synchronization feature module entry points in apps/api/src/google-sync/index.ts and apps/web/src/features/google-sync/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build secure provider, persistence, infrastructure, and telemetry foundations used by
all user stories.

**⚠️ CRITICAL**: No user story implementation begins until this phase passes focused tests.

- [x] T004 [P] Add domain validation and state-transition tests in packages/domain/test/google-sync.test.ts
- [x] T005 [P] Add strict Google OAuth/Tasks transport and malformed-response tests in apps/api/test/google-sync/google-client.test.ts
- [ ] T006 [P] Add owner authorization, OAuth state replay, token encryption-context, and redaction tests in tests/security/google-sync.security.test.ts
- [x] T007 Implement owner-scoped keys, conditional connection/link/operation/conflict/run persistence, leases, checkpoints, and OAuth-state TTL in apps/api/src/shared/keys.ts and apps/api/src/google-sync/repository.ts
- [x] T008 Implement strict bounded Google OAuth and Tasks REST transport, pagination, retries, timeout classification, and token refresh in apps/api/src/google-sync/google-client.ts
- [x] T009 Implement one-time OAuth state/PKCE, callback validation, KMS refresh-token encryption, secret loading, revocation, and reauthorization transitions in apps/api/src/google-sync/auth-service.ts
- [x] T010 Implement permanently redacted structured events and embedded metrics in apps/api/src/google-sync/telemetry.ts and packages/observability/src/redaction.ts
- [ ] T011 Create least-privilege OAuth secret, sync/reconciler and stream Lambda resources, five-minute schedule, stream filters, KMS grants, log retention, alarms, and outputs in infra/lib/secrets-stack.ts, infra/lib/google-sync-stack.ts, infra/lib/observability-stack.ts, infra/lib/api-stack.ts, and infra/lib/naaseh-stack.ts
- [ ] T012 Add CDK assertions for runtime separation, least privilege, schedule, stream filter, secret/KMS access, concurrency, log retention, metrics, and alarms in infra/test/google-sync.test.ts

**Checkpoint**: Provider calls, credentials, durable entities, leases, and operational signals are
isolated and testable; user-story work may begin.

---

## Phase 3: User Story 1 - Connect Google and Publish Dated Tasks (Priority: P1) 🎯 MVP

**Goal**: Connect one Google account/list and publish eligible dated Na'aseh tasks once with safe
date-only behavior.

**Independent Test**: Connect a stub Google account, preview/select a list, create and edit a dated
local task, and observe one corresponding Google task with preserved local time and no memo content.

### Tests for User Story 1

- [x] T013 [P] [US1] Add connect, callback, list, settings, preview, sharing-consent, and status contract tests in tests/contract/google-sync.contract.test.ts
- [x] T014 [P] [US1] Add initial preview, eligibility, publication, lost-insert-response, time preservation, and private-content boundary tests in tests/integration/google-sync-publish.test.ts
- [x] T015 [P] [US1] Add Chromium/WebKit connection-return, initial preview, responsive settings, private warning, offline status, focus, and live-announcement tests in tests/e2e/google-sync.spec.ts

### Implementation for User Story 1

- [x] T016 [US1] Implement eligibility, marker lookup, preview, list selection/creation, publication, update, and date-only conversion in apps/api/src/google-sync/publish-service.ts
- [x] T017 [US1] Implement authenticated status/connect/callback/task-list/preview/settings/private-sharing HTTP routes with CSRF, owner, version, and idempotency checks in apps/api/src/google-sync/handler.ts and infra/lib/api-stack.ts
- [x] T018 [US1] Implement task-stream deterministic operation enqueueing and provider-source echo suppression in apps/api/src/google-sync/stream-handler.ts
- [x] T019 [US1] Implement typed browser API client and full-page OAuth return handling in apps/web/src/features/google-sync/google-sync-client.ts
- [x] T020 [US1] Implement accessible responsive connection, list, preview, date-limit disclosure, private-consent, pause, and status UI in apps/web/src/features/google-sync/GoogleSyncPage.tsx and apps/web/src/features/google-sync/GoogleSyncPreview.tsx
- [x] T021 [US1] Add Google settings route/navigation and private-task sharing control integration in apps/web/src/app/router.tsx, apps/web/src/app/App.tsx, and apps/web/src/features/tasks/PrivacyControl.tsx

**Checkpoint**: Owner can connect and safely publish eligible dated local tasks exactly once.

---

## Phase 4: User Story 2 - Import and Reconcile Google Changes (Priority: P1)

**Goal**: Import dated Google tasks and apply remote edits, completion, reopening, and deletion through
existing Na'aseh lifecycle semantics.

**Independent Test**: Create/edit/complete/reopen/delete provider fixtures and confirm one local task,
one counted completion, correct reversal/archive, undated skip, checkpoint recovery, and no duplicate.

### Tests for User Story 2

- [x] T022 [P] [US2] Add remote import/update/complete/reopen/delete, undated-skip, pagination, overlap, and checkpoint recovery tests in tests/integration/google-sync-import.test.ts
- [x] T023 [P] [US2] Add duplicate delivery, lifecycle replay, feed propagation, and completion-count integrity tests in tests/integration/google-sync-lifecycle.test.ts

### Implementation for User Story 2

- [x] T024 [US2] Implement remote snapshot normalization, import defaults, undated skip, lifecycle attribution, and remote-delete archival in apps/api/src/google-sync/import-service.ts
- [x] T025 [US2] Implement paginated overlap reconciliation, per-item commit boundary, operation retry/quarantine, checkpoint advancement, and run lease in apps/api/src/google-sync/run-service.ts
- [x] T026 [US2] Implement scheduled/manual run entry points and safe bounded connection batching in apps/api/src/google-sync/scheduled-handler.ts and apps/api/src/google-sync/handler.ts
- [x] T027 [US2] Reuse task mutation, lifecycle, revision, completion-event, workload projection, and audience-feed transactions for Google-origin actions in apps/api/src/tasks/task-repository.ts and apps/api/src/lifecycle/task-lifecycle-service.ts
- [x] T028 [US2] Persist and surface imported task/source and run-summary changes through existing authorized synchronization in apps/api/src/sync/handler.ts and apps/web/src/sync/sync-engine.ts

**Checkpoint**: Supported Google changes converge into Na'aseh with durable lifecycle and reporting.

---

## Phase 5: User Story 3 - Resolve Concurrent Changes Safely (Priority: P1)

**Goal**: Three-way merge independent changes and make same-field divergence explicitly resolvable.

**Independent Test**: Change independent and identical fields on both sides, then create divergent
title/date/status fixtures and resolve each using local, Google, and edited values.

### Tests for User Story 3

- [x] T029 [P] [US3] Add exhaustive three-way field merge, date/time, status, deletion, stale resolution, and replay tests in tests/integration/google-sync-merge.test.ts
- [x] T030 [P] [US3] Add conflict authorization, encrypted value, administrator non-disclosure, and log-exclusion tests in tests/security/google-sync-conflicts.security.test.ts
- [x] T031 [P] [US3] Extend Chromium/WebKit tests for conflict list, keyboard/touch resolution, stale conflict, offline read, and reconnection in tests/e2e/google-sync.spec.ts

### Implementation for User Story 3

- [x] T032 [US3] Implement supported-field three-way merge, local-time preservation, conflict creation, and deterministic convergence decisions in apps/api/src/google-sync/merge-service.ts
- [x] T033 [US3] Implement owner-authorized conflict listing/resolution endpoints and versioned operation enqueueing in apps/api/src/google-sync/handler.ts and apps/api/src/google-sync/repository.ts
- [x] T034 [US3] Implement protected conflict client/cache and accessible local/Google/edited resolution UI in apps/web/src/features/google-sync/google-sync-client.ts and apps/web/src/features/google-sync/GoogleSyncConflicts.tsx
- [x] T035 [US3] Integrate conflict counts/details with existing offline synchronization and status surfaces in apps/web/src/features/google-sync/GoogleSyncPage.tsx and apps/web/src/db/database.ts

**Checkpoint**: No divergent supported-field edit is silently overwritten.

---

## Phase 6: User Story 4 - Control Privacy, Scope, and Disconnection (Priority: P2)

**Goal**: Provide deliberate privacy, pause/list-change, revocation, and safe disconnection controls.

**Independent Test**: Exercise owner/collaborator boundaries, private consent, pause, list migration
choices, revoked token, and both disconnect cleanup choices while proving local tasks remain.

### Tests for User Story 4

- [x] T036 [P] [US4] Add pause/resume, list-change preview, revoked-token, disconnect cleanup allowlist, and local-retention tests in tests/integration/google-sync-controls.test.ts
- [ ] T037 [P] [US4] Add collaborator, administrator, CSRF, open-redirect, token-revocation, backup/restore, and destructive-scope tests in tests/security/google-sync-controls.security.test.ts

### Implementation for User Story 4

- [x] T038 [US4] Implement pause/resume, reauthorization, list-change preview/migration modes, disconnect preview, origin-allowlisted cleanup, credential destruction, and link retirement in apps/api/src/google-sync/control-service.ts
- [x] T039 [US4] Implement versioned control and disconnect endpoints with preview confirmation in apps/api/src/google-sync/handler.ts
- [x] T040 [US4] Implement responsive pause, reconnect, list migration, cleanup preview, confirmation, and completion UI in apps/web/src/features/google-sync/GoogleSyncPage.tsx
- [ ] T041 [US4] Add restore-time credential invalidation and pre-restore operation cancellation validation in apps/api/src/crypto-recovery/restore-testing-validator.ts and docs/operations/recovery.md

**Checkpoint**: Provider access and exported content remain owner-controlled and safely reversible.

---

## Phase 7: User Story 5 - Monitor and Recover Synchronization (Priority: P2)

**Goal**: Make progress, lag, retry, quarantine and systemic failures visible and recoverable without
protected-content telemetry.

**Independent Test**: Inject throttling, revoked tokens, malformed records, partial pages and stalls;
verify status/retry/quarantine UI and redacted CloudWatch metrics/alarms.

### Tests for User Story 5

- [x] T042 [P] [US5] Add throttling/backoff, malformed quarantine, partial continuation, stall, manual retry, and safe status tests in tests/integration/google-sync-recovery.test.ts
- [x] T043 [P] [US5] Add 5,000-link/100-change progress and convergence performance fixtures in tests/performance/google-sync-performance.test.ts
- [x] T044 [P] [US5] Add telemetry field allowlist, protected-content fuzzing, metric, alarm, and retention tests in tests/security/google-sync-observability.security.test.ts and infra/test/google-sync.test.ts

### Implementation for User Story 5

- [x] T045 [US5] Implement retry classes, exponential jitter, quota suspension, item quarantine/retry, stale lease recovery, safe run progress, and checkpoint-stall detection in apps/api/src/google-sync/run-service.ts
- [x] T046 [US5] Implement owner-safe run/quarantine status and retry endpoints in apps/api/src/google-sync/handler.ts
- [x] T047 [US5] Implement progress, lag, actionable failure, quarantine, and retry UI with offline last-known state in apps/web/src/features/google-sync/GoogleSyncPage.tsx and apps/web/src/features/google-sync/google-sync-client.ts
- [x] T048 [US5] Complete CloudWatch metrics, alarms, dashboards, safe retention, and quota/stall dimensions in apps/api/src/google-sync/telemetry.ts, infra/lib/google-sync-stack.ts, and infra/lib/observability-stack.ts

**Checkpoint**: Users and operators can detect, understand and recover every scoped failure class.

---

## Phase 8: Polish & Cross-Cutting Validation

**Purpose**: Complete documentation, performance, browser, security, recovery, cost, and final-diff gates.

- [x] T049 [P] Write user setup, field mapping, date-only limitation, privacy, conflict, pause, and disconnect guidance in docs/user/google-tasks-sync.md
- [x] T050 [P] Write Google Cloud setup, secret rotation, consent verification, quota, alarms, incident response, revocation, restore, and teardown runbook in docs/operations/google-tasks-sync.md
- [ ] T051 Validate contract, unit, integration, security, performance, infrastructure, build, lint, and typecheck gates and record results in specs/004-google-tasks-sync/validation-results.md
- [x] T052 Validate Playwright Chromium/WebKit desktop, iPhone and iPad online/offline/reconnection journeys and record evidence in specs/004-google-tasks-sync/validation-results.md
- [ ] T053 Perform final security, data-boundary, data-loss, replay, backup/restore, provider-quota, serverless-cost, observability, comments, complexity, and documentation diff review in docs/reviews/google-tasks-sync-final-review.md
- [ ] T054 Execute specs/004-google-tasks-sync/quickstart.md against a disposable Google/AWS test environment and record external evidence or explicit release gates in specs/004-google-tasks-sync/validation-results.md

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks every story.
- US1 depends on Phase 2 and establishes connection/publication.
- US2 depends on the US1 connection/link foundation but remains independently testable with seeded links.
- US3 depends on the shared link snapshot and can be tested with seeded local/remote snapshots.
- US4 depends on connection/origin metadata but is independently testable with seeded connections.
- US5 depends on runs/operations and is independently testable with injected provider failures.
- Phase 8 depends on every included story.

### Within Each User Story

- Write and run the listed tests first; verify they fail for the intended missing behavior.
- Persistence and domain transitions precede services; services precede HTTP/UI integration.
- Provider effects follow durable intent and replay checks; checkpoints advance last.
- Complete the story checkpoint before moving to the next story.

### Parallel Opportunities

- T002 and T003 can run in parallel after T001's exported naming is agreed.
- T004–T006 are independent test files; T012 can be drafted while T007–T011 are implemented.
- Each story's distinct contract/integration/security/Playwright test files marked `[P]` can be written in parallel.
- US3, US4 and US5 service work can proceed in parallel after US1/US2 establish mappings and runs,
  provided shared `handler.ts`, `repository.ts`, `run-service.ts`, and UI files are serialized.
- Documentation T049 and T050 can run in parallel after behavior stabilizes.

## Parallel Example: User Story 3

```text
Task T029: Write three-way merge and replay integration tests.
Task T030: Write protected conflict authorization/security tests.
Task T031: Write browser conflict-resolution journeys.
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 connection and one-way safe publication.
3. Validate the US1 checkpoint without enabling production OAuth credentials.
4. Add US2 and US3 before calling the feature bidirectional or enabling it for production users.

### Full Requested Delivery

The requested outcome is complete only after US1–US5 and Phase 8. A deployment with only US1 is an
internal milestone, not the promised bidirectional feature.

## Notes

- `[P]` means different files and no incomplete dependency; shared files must still be serialized.
- All Google tests default to deterministic fakes. Live calls use only disposable accounts/lists.
- Never place OAuth values, provider bodies, task content, due dates, snapshots or conflict values in
  fixtures that assert logs or deployment outputs.
- Production activation remains gated on Google consent configuration/verification and disposable
  live-environment evidence even when all local implementation tasks pass.
