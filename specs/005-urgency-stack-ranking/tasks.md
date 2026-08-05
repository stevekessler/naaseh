---

description: "Implementation tasks for urgency levels, personal overall/Project stack ranking, urgency filtering, and urgency-aware reporting"
---

# Tasks: Urgency Levels and Personal Stack Ranking

**Input**: Design documents from `/specs/005-urgency-stack-ranking/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/urgency-stack-ranking.openapi.yaml`, `quickstart.md`

**Tests**: Automated unit, integration, contract, security, performance, restore, and Playwright Chromium/WebKit coverage is required by the constitution. Write each story's tests first and confirm they fail before implementing that story.

**Organization**: Tasks are grouped by user story so urgency, personal ranking, filtering, and reporting can each be implemented and validated as an independently useful increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no unfinished dependency
- **[Story]**: Maps the task to a user story from `spec.md`
- Every task names the exact repository file or directory it changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish feature-specific modules, fixtures, and contract wiring without changing runtime behavior.

- [X] T001 Create reusable five-level urgency, mixed Task/List, user, Project, and completion fixtures in `tests/fixtures/urgency-stack-ranking.ts`
- [X] T002 [P] Add feature contract module scaffolding and public exports in `packages/contracts/src/urgency-stack-ranking-openapi.ts` and `packages/contracts/src/index.ts`
- [X] T003 [P] Add ranking API and web feature barrel scaffolding in `apps/api/src/ranking/index.ts` and `apps/web/src/features/stacks/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reconcile shared persistence and protocol foundations required before story work begins.

**⚠️ CRITICAL**: Complete this phase before implementing any user story.

- [X] T004 Add a failing migration test that preserves settings, encryption keys, sync cursor, outbox records, and conflicts across the feature schema upgrade in `apps/web/test/db/urgency-stack-schema-migration.test.ts`
- [X] T005 Reconcile the existing Dexie schema-version mismatch, bump the encrypted database once, and define empty upgrade-safe urgency and personal-stack stores in `apps/web/src/db/schema.ts`, `apps/web/src/db/database.ts`, and `apps/web/src/db/sync-cursor.ts`
- [X] T006 [P] Define shared contract-version-4 mutation result, retry, and conflict envelopes while retaining compatible reads of supported older envelopes in `packages/domain/src/sync.ts` and `apps/api/src/sync/types.ts`
- [X] T007 [P] Implement and export the runtime Zod/OpenAPI feature schemas corresponding to `specs/005-urgency-stack-ranking/contracts/urgency-stack-ranking.openapi.yaml` in `packages/contracts/src/urgency-stack-ranking-openapi.ts`, `packages/contracts/src/openapi.ts`, and `packages/contracts/src/index.ts`
- [X] T008 Add protected-field redaction for urgency-linked records, position/order tokens, filter bases, bulk work identifiers, user/Project identifiers, and report totals in `packages/observability/src/redaction.ts` and its regression coverage in `packages/observability/test/logger.test.ts`

**Checkpoint**: Schema migration, sync envelopes, feature contracts, and safe logging are ready for story implementation.

---

## Phase 3: User Story 1 - Set Work Urgency (Priority: P1) 🎯 MVP

**Goal**: Authorized editors can assign Extra Low, Low, Medium, High, or Critical to every Task, subtask, and List; omitted urgency defaults to Medium; changes enter revision history; active and archived UI uses accessible text labels.

**Independent Test**: Create and edit work at every urgency, omit urgency to verify Medium, inspect revision history, and confirm consistent text-labeled display in active and archived views without changing rank.

### Tests for User Story 1 (REQUIRED) ⚠️

> Write these tests first and verify they fail before implementation.

- [X] T009 [P] [US1] Add unit tests for the five wire values, stable display order, labels, Medium default, and rejection of numeric/comparative semantics in `packages/domain/src/__tests__/urgency.test.ts`
- [X] T010 [P] [US1] Add contract tests for Task/List create, patch, read, defaulting, optimistic conflicts, and revision payloads with urgency in `tests/contract/urgency-work.contract.test.ts`
- [X] T011 [P] [US1] Add API integration tests for Task, subtask, and List urgency persistence, authorization, defaulting, revision history, archive/restore, and rank independence in `tests/integration/urgency-work.test.ts`
- [X] T012 [P] [US1] Add encrypted local database and outbox tests for offline urgency edits, restart durability, reconnect replay, and conflict recovery in `apps/web/test/db/urgency-offline.test.ts`
- [X] T013 [P] [US1] Add component accessibility tests for full urgency text, keyboard selection, screen-reader names, and non-color-only cues in `apps/web/test/features/urgency-field.test.tsx`
- [X] T014 [P] [US1] Add Chromium/WebKit coverage for online and offline Task/subtask/List urgency creation, edits, sync, archive display, and revision history in `tests/e2e/urgency.spec.ts`

### Implementation for User Story 1

- [X] T015 [P] [US1] Implement the categorical urgency schema, ordered values, labels, default, and zero-filled count helper in `packages/domain/src/urgency.ts` and export it from `packages/domain/src/index.ts`
- [X] T016 [US1] Add required urgency with Medium input defaulting to Task/subtask and List domain schemas, mutation payloads, and revision field allowlists in `packages/domain/src/task.ts`, `packages/domain/src/list.ts`, and `packages/domain/src/revision.ts`
- [X] T017 [US1] Persist urgency on Task/subtask create and update, enforce existing edit permissions, and record urgency revisions in `apps/api/src/tasks/task-service.ts`, `apps/api/src/tasks/task-repository.ts`, and `apps/api/src/tasks/handler.ts`
- [X] T018 [P] [US1] Persist urgency on List create and update, enforce existing edit permissions, and record urgency revisions in `apps/api/src/lists/list-service.ts`, `apps/api/src/lists/list-repository.ts`, and `apps/api/src/lists/handler.ts`
- [X] T019 [US1] Extend API request/response validation and sync serialization for Task/List urgency without modifying personal stack positions in `packages/contracts/src/openapi.ts`, `apps/api/src/sync/sync-service.ts`, and `apps/api/src/sync/handler.ts`
- [X] T020 [US1] Extend encrypted local Task/List records, repositories, and outbox mutation creation to store and sync urgency with Medium defaulting in `apps/web/src/db/task-repository.ts`, `apps/web/src/db/list-repository.ts`, and `apps/web/src/db/outbox.ts`
- [X] T021 [P] [US1] Add reusable accessible urgency select and badge components with full text labels and semantic non-color cues in `apps/web/src/components/UrgencyField.tsx` and `apps/web/src/components/UrgencyBadge.tsx`
- [X] T022 [US1] Integrate urgency selection into Task/subtask/List forms and text-labeled badges into active rows in `apps/web/src/features/tasks/TaskForm.tsx`, `apps/web/src/features/tasks/TaskRow.tsx`, `apps/web/src/features/lists/ListForm.tsx`, and `apps/web/src/features/lists/ListIndexPage.tsx`
- [X] T023 [P] [US1] Display current urgency and urgency revision entries in archived work and history views in `apps/web/src/features/archive/ArchivePage.tsx` and `apps/web/src/features/tasks/RevisionLog.tsx`
- [X] T024 [US1] Preserve Na'aseh urgency through Google Tasks publish/merge and assign Medium only to newly imported Google Tasks in `apps/api/src/google-sync/publish-service.ts`, `apps/api/src/google-sync/merge-service.ts`, and `apps/api/src/google-sync/import-service.ts`

**Checkpoint**: User Story 1 is independently usable and verifiable across online, offline, synced, active, and archived work.

---

## Phase 4: User Story 2 - Stack Rank Work Independently (Priority: P1)

**Goal**: Every user privately ranks all authorized active Tasks/subtasks/Lists in an overall stack and in independent per-Project stacks, with urgency never constraining position and with safe offline/conflict behavior.

**Independent Test**: Put Extra Low above Critical, give one item Project position 1 and overall position 5, give two users different orders, reload/sync, reorder a filtered view, and verify hidden positions and authorization boundaries remain unchanged.

### Tests for User Story 2 (REQUIRED) ⚠️

> Write these tests first and verify they fail before implementation.

- [X] T025 [P] [US2] Add domain tests for overall/Project scope identity, membership epochs, implicit tail order, move replay, snapshot replay, and exact occupied-slot filtered permutation in `packages/domain/src/__tests__/personal-stack.test.ts`
- [X] T026 [P] [US2] Add contract tests for overall/Project stack reads, reorder writes, operation status, contract-v4 sync mutations, pagination, idempotency, and typed conflicts in `tests/contract/personal-stack.contract.test.ts`
- [X] T027 [P] [US2] Add repository integration tests for chunked manifests/payloads, 250 KB compressed limits, atomic receipts, snapshots, compaction, pagination, and replay recovery in `tests/integration/personal-stack-repository.test.ts`
- [X] T028 [P] [US2] Add service integration tests for independent users/scopes, urgency-independent order, membership tails/re-entry, stale simple-move rebasing, filtered/overlapping conflicts, and same-user serialization in `tests/integration/personal-stack-service.test.ts`
- [X] T029 [P] [US2] Add security tests proving rank is owner-only, admin reports cannot request another user's rank, rank grants no authorization, revoked/hard-deleted work disappears, and logs remain redacted in `tests/security/personal-stack-isolation.test.ts`
- [X] T030 [P] [US2] Add encrypted local repository and sync tests for atomic reorder/outbox writes, restart recovery, pending acknowledgement, owner-feed pulls, reconnect replay, conflict repair, and privacy purge in `apps/web/test/db/personal-stack-offline.test.ts`
- [X] T031 [P] [US2] Add component accessibility tests for scope selection, position announcements, keyboard Move up/down/to-position controls, focus restoration, and touch alternatives in `apps/web/test/features/personal-stack-page.test.tsx`
- [X] T032 [P] [US2] Add Chromium/WebKit end-to-end scenarios for independent overall/Project/user orders, Extra Low above Critical, filtered occupied-slot movement, offline reorder, reload, sync, and conflict resolution in `tests/e2e/personal-stack.spec.ts`
- [X] T033 [P] [US2] Add restore tests for canonical operation continuity, chunk/hash/pointer validation, user-scope boundaries, snapshot rebuild, and deterministic final order in `tests/restore/personal-stack-restore.test.ts`

### Implementation for User Story 2

- [X] T034 [P] [US2] Implement WorkReference, scope, membership epoch, filter basis, operation, conflict, snapshot, and replay schemas in `packages/domain/src/personal-stack.ts` and export them from `packages/domain/src/index.ts`
- [X] T035 [US2] Implement deterministic simple-move and exact occupied-slot filtered-permutation algorithms plus operation/snapshot replay in `packages/domain/src/personal-stack.ts`
- [X] T036 [P] [US2] Add DynamoDB keys for owner-private overall/Project metadata, operations, chunks, receipts, snapshots, and audit/feed entries in `apps/api/src/shared/keys.ts`
- [X] T037 [US2] Implement paginated stack metadata, compressed operation chunk, immutable receipt, snapshot chunk, and atomic transaction persistence in `apps/api/src/ranking/stack-repository.ts`
- [X] T038 [US2] Implement membership derivation from current active authorized work, deterministic tail admission, membership re-entry epochs, and overall/Project scope validation in `apps/api/src/ranking/stack-service.ts`
- [X] T039 [US2] Implement idempotent reorder acceptance, per-user/per-scope serialization, safe stale simple-move rebasing, filtered/overlap conflict detection, and durable pending acknowledgements in `apps/api/src/ranking/stack-service.ts`
- [X] T040 [US2] Implement owner-only overall/Project read, reorder, and operation-status handlers with signed cursors and actionable problem responses in `apps/api/src/ranking/handler.ts`
- [X] T041 [US2] Route contract-v4 personalStackOperation pushes and owner-only stack feed records through sync without exposing ranks in shared feeds in `apps/api/src/sync/sync-service.ts`, `apps/api/src/sync/change-feed-repository.ts`, and `apps/api/src/sync/handler.ts`
- [X] T042 [P] [US2] Implement asynchronous compaction, snapshot checksums, safe pointer advancement, retry/idempotency, and canonical-log retention in `apps/api/src/ranking/stack-compactor.ts`
- [X] T043 [US2] Wire membership invalidation/tail admission to Task/List create, restore, archive, delete, Project reassignment, and authorization-change flows in `apps/api/src/lifecycle/task-lifecycle-service.ts`, `apps/api/src/lifecycle/list-lifecycle-service.ts`, and `apps/api/src/projects/project-service.ts`
- [X] T044 [US2] Provision pay-per-use ranking/compaction Lambdas, API routes, least-privilege table/KMS access, and asynchronous compaction invocation in `infra/lib/api-stack.ts`
- [X] T045 [P] [US2] Add stack operation logs, latency/conflict/failure/compaction metrics, bounded dimensions, retention, alarms, and protected-data exclusions in `apps/api/src/ranking/telemetry.ts` and `infra/lib/observability-stack.ts`
- [X] T046 [US2] Extend backup and restore workflows so operations are canonical, snapshots are rebuildable, and corrupt/version-gapped scopes fail validation in `infra/lib/backup-stack.ts` and `infra/lib/restore-workflow-stack.ts`
- [X] T047 [US2] Implement encrypted local stack metadata, membership, operation, snapshot, pending, and conflict repositories in `apps/web/src/db/personal-stack-repository.ts` using the stores introduced by T005
- [X] T048 [P] [US2] Implement the shared occupied-slot filtered permutation and stable rank-overlay selectors for offline/local reads in `apps/web/src/features/stacks/filtered-permutation.ts` and `apps/web/src/features/stacks/stack-selectors.ts`
- [X] T049 [US2] Extend the sync engine to atomically queue scope reorders, pull owner-private operations, acknowledge pending operations, serialize same-user scope writes, and surface repairable conflicts in `apps/web/src/sync/sync-engine.ts` and `apps/web/src/sync/conflict-resolution.ts`
- [X] T050 [US2] Purge private stack state on logout/account switch and remove revoked/hard-deleted memberships without leaking their former position in `apps/web/src/sync/privacy-purge.ts` and `apps/web/src/db/personal-stack-repository.ts`
- [X] T051 [P] [US2] Build the overall/Project scope picker, virtualized mixed-work stack, rank row, text urgency badge, and accessible move controls in `apps/web/src/features/stacks/StackScopePicker.tsx`, `apps/web/src/features/stacks/StackList.tsx`, `apps/web/src/features/stacks/StackRow.tsx`, and `apps/web/src/features/stacks/StackMoveControls.tsx`
- [X] T052 [US2] Assemble the Personal Stack page with durable pending/conflict states, keyboard/touch movement, aria-live results, focus restoration, and route/navigation integration in `apps/web/src/features/stacks/PersonalStackPage.tsx`, `apps/web/src/app/router.tsx`, and `apps/web/src/app/App.tsx`

**Checkpoint**: Personal overall and per-Project stacks are independent across scopes and users, durable offline, authorization-safe, and not constrained by urgency.

---

## Phase 5: User Story 3 - Filter by Urgency (Priority: P2)

**Goal**: Users filter active, archived, overall-stack, and Project-stack work by one or more urgency levels in combination with every existing filter while preserving personal stack order and offline behavior.

**Independent Test**: Exercise each urgency alone and representative multi-level combinations together with date, assignee, Category, Project, lifecycle, content type, and search filters from a warmed offline cache.

### Tests for User Story 3 (REQUIRED) ⚠️

> Write these tests first and verify they fail before implementation.

- [X] T053 [P] [US3] Add unit tests for single/multi urgency predicates, stable personal-order preservation, URL round-tripping, invalid values, and combination with every existing filter in `apps/web/test/search/urgency-filters.test.ts`
- [X] T054 [P] [US3] Add API contract/integration tests for existing plus urgency filters and bounded server-side pagination across overall stack, Project stack, archive, workload, and drilldown reads, covering match-count limits, sparse short/empty pages with non-null cursors, exact-once stable traversal, 1 MB boundaries, multi-audience merge/deduplication, and 400/409/410 cursor failures for tampering, cross-user/route/filter/order reuse, expiry, and changed access/source context in `tests/contract/urgency-filters.contract.test.ts` and `tests/integration/urgency-filters.test.ts`
- [X] T055 [P] [US3] Add component tests for five accessible multi-checkboxes, selected summaries, clear/reset behavior, saved URL state, and zero-result messaging in `apps/web/test/features/task-filters-urgency.test.tsx`
- [X] T056 [P] [US3] Add Chromium/WebKit scenarios for single/multi-level filters combined with date, assignee, Category, Project, lifecycle, content type, and search online/offline, including continuation through short/empty pages and actionable retry/restart UI for invalid, expired, stale-context, timeout, and failed filtered reads in `tests/e2e/urgency-filtering.spec.ts`

### Implementation for User Story 3

- [X] T057 [P] [US3] Implement normalized urgency-set parsing, serialization, validation, and shared predicates in `packages/domain/src/urgency.ts` and `apps/web/src/search/task-filters.ts`
- [X] T058 [US3] Extend search state and URL persistence for multi-select urgency without changing existing filter semantics in `apps/web/src/features/search/search-state.ts` and `apps/web/src/search/task-search.ts`
- [X] T059 [P] [US3] Add the accessible five-option urgency checkbox group, selected summary, and reset control to active-work filters in `apps/web/src/features/search/TaskFilters.tsx`
- [X] T060 [US3] Apply urgency alongside all existing filters while preserving overall/Project personal order in `apps/web/src/features/stacks/stack-selectors.ts` and `apps/web/src/features/stacks/PersonalStackPage.tsx`
- [X] T061 [US3] Add urgency filters to encrypted offline Task/List/archive selectors and archived-work UI in `apps/web/src/db/task-repository.ts`, `apps/web/src/db/list-repository.ts`, `apps/web/src/db/archive-repository.ts`, and `apps/web/src/features/archive/ArchivePage.tsx`
- [X] T062 [US3] Implement bounded personal-stack pagination that counts authorized matches, resumes after the last examined canonical candidate, batch-hydrates and re-authorizes work, enforces candidate/page/deadline bounds, returns short or empty continuation pages correctly, binds encrypted inline cursors to actor/access epoch/scope/filter/order/stack context, and returns actionable 400/409/410 restart errors in `apps/api/src/ranking/filtered-stack-reader.ts`, `apps/api/src/shared/pagination-cursor.ts`, `apps/api/src/ranking/handler.ts`
- [X] T093 [US3] Implement transactionally maintained owner/public/group/administrator work-view pointers partitioned by lifecycle/scope/urgency with monotonic source epochs; merge, deduplicate, hydrate, and re-authorize permitted audience streams without table scans; preserve existing archive/workload/drilldown filters; store encrypted owner-scoped TTL cursor vectors when multi-source state exceeds the inline-token budget; and invalidate changed-source traversals with actionable restart responses in `apps/api/src/reporting/work-view-repository.ts`, `apps/api/src/lifecycle/archive-repository.ts`, `apps/api/src/lifecycle/task-lifecycle-service.ts`, `apps/api/src/lifecycle/list-lifecycle-service.ts`, `apps/api/src/shared/pagination-cursor.ts`, `apps/api/src/lifecycle/handlers.ts`, and `apps/api/src/reporting/handlers.ts`

**Checkpoint**: Urgency filtering composes with every existing filter online and offline without re-sorting personal stacks.

---

## Phase 6: User Story 4 - Report on Urgency (Priority: P2)

**Goal**: Every existing workload, completion, Category, Project, archive, dashboard, drilldown, and export surface exposes zero-filled urgency breakdowns/filters; completion uses the captured historical urgency and current detail rows expose only the viewer's own ranks.

**Independent Test**: Populate all five levels, complete work, later change its urgency, then verify totals, zero-filled breakdowns, filters, current-vs-historical semantics, viewer-only rank overlays, and CSV fields across every report surface.

### Tests for User Story 4 (REQUIRED) ⚠️

> Write these tests first and verify they fail before implementation.

- [X] T063 [P] [US4] Add domain tests for immutable urgency-at-completion snapshots, reversal retention, and zero-filled urgency breakdowns in `packages/domain/src/__tests__/completion-urgency.test.ts`
- [X] T064 [P] [US4] Extend completion report contract tests for preserved week-start/assignment/user filters, urgency filters/counts, `asOf`, no raw events by default, separate authorized paginated completion drilldown, reversal-at-`asOf`, short/empty continuation pages, cursor failures, and all-five zero filling in `tests/contract/completion-reporting.contract.test.ts`
- [X] T065 [P] [US4] Add integration tests proving completion reports use urgency at completion while workload/archive reports use current urgency, including reversal and post-completion edits in `tests/integration/urgency-reporting.test.ts`
- [X] T066 [P] [US4] Add projection/reconciliation tests across Category, Project, unassigned, owner/public/group/administrator audiences, create, urgency edit, assignment and audience changes, archive, restore, and delete; verify all-five urgency counters, atomic removal and replacement of obsolete lifecycle/scope/urgency pointers, exactly-once advancement of every affected partition's source epoch, multi-audience merge/deduplication, cursor invalidation after epoch changes, idempotent stream retry/duplicate delivery without double counts or extra epoch advances, stale/missing/orphan pointer detection and repair from canonical work, authorization rechecks during repair, and actionable bucketed reconciliation telemetry in `tests/integration/workload-urgency-projections.test.ts`
- [X] T067 [P] [US4] Add export/security tests for urgency plus viewer-only overallRank/projectRank, absence of other users' ranks, archived rank omission, and authorized row scope in `tests/security/urgency-rank-exports.test.ts`
- [X] T068 [P] [US4] Add web unit/component tests for completion dashboard, organization tree, drilldown, archive, and export urgency filters/breakdowns/labels, including overallRank/projectRank sorting and constraints, previously synchronized offline reads, locally pending urgency changes, stale-cache messaging, invalid/expired/context-changed cursor recovery, report calculation failures, retries, and reconnect refresh in `apps/web/test/features/urgency-reporting.test.tsx`
- [X] T069 [P] [US4] Add Chromium/WebKit end-to-end reporting scenarios covering five-level data, zero buckets, current/historical semantics, ordering eligible detail rows by overall and Project rank, drilldown pagination, CSV rank overlays, offline cached report access after browser restart, pending urgency changes, failure/retry/restart states, and reconciliation after reconnect in `tests/e2e/urgency-reporting.spec.ts`

### Implementation for User Story 4

- [X] T070 [P] [US4] Add required immutable `urgencyAtCompletion` and five-level breakdown schemas to completion events and workload counts in `packages/domain/src/completion-event.ts` and `packages/domain/src/workload.ts`
- [X] T071 [US4] Capture current urgency atomically when completing Task/subtask/List work and retain the snapshot through reversal in `apps/api/src/reporting/completion-event-repository.ts`, `apps/api/src/lifecycle/task-lifecycle-service.ts`, and `apps/api/src/lifecycle/list-lifecycle-service.ts`
- [X] T072 [US4] Query completion aggregates through the user/timestamp index, atomically maintain per-user completion-detail pointers, apply urgency-at-completion and preserved report filters, return `asOf`, zero-fill all levels, and expose raw events only through the authorized paginated completion drilldown with reversal-at-`asOf` semantics in `apps/api/src/reporting/completion-event-repository.ts`, `apps/api/src/reporting/completion-report-service.ts`, and `apps/api/src/reporting/handlers.ts`
- [X] T073 [US4] Extend the T093 work-view projection with current-urgency counters and Category, Project, and unassigned pointer scopes, and reconcile counters, pointers, source epochs, and canonical work after every lifecycle, urgency, assignment, authorization, or stream-retry transition in `apps/api/src/reporting/workload-projection-repository.ts` and `apps/api/src/reporting/projection-reconciliation-handler.ts`
- [X] T074 [US4] Return zero-filled current-urgency breakdowns/filters in organization trees and authorized drilldowns, overlay only the viewer's ranks, support stable `orderBy=overallRank` and single-Project `orderBy=projectRank`, reject inapplicable Project-rank requests, and preserve full-stack positions without filter renumbering in `apps/api/src/reporting/organization-tree-service.ts` and `apps/api/src/reporting/handlers.ts`
- [X] T075 [P] [US4] Extend archive reports with current urgency labels/filters and guarantee rank fields are omitted for inactive records in `apps/api/src/lifecycle/archive-service.ts` and `apps/api/src/lifecycle/handlers.ts`
- [X] T076 [US4] Add urgency, overallRank, and projectRank columns to authorized CSV exports, sourcing ranks only for the requesting viewer and leaving archived ranks blank in `apps/api/src/exports/csv-transformer.ts` and `apps/api/src/exports/export-service.ts`
- [X] T077 [P] [US4] Add report latency, urgency-total consistency, projection reconciliation, cursor expiry/context restart, filtered-read amplification/short-page, read-unit/byte, failure/retry, and export metrics with bounded dimensions and protected-data exclusions in `apps/api/src/reporting/telemetry.ts` and `infra/lib/observability-stack.ts`
- [X] T078 [US4] Extend encrypted local completion/workload models and selectors with urgency snapshots, zero-filled current counts, cache freshness/pending state, and previously synchronized offline report reads in `apps/web/src/db/completion-event-repository.ts` and `apps/web/src/db/workload-selector.ts`
- [X] T079 [US4] Add urgency filters, zero-filled breakdowns, historical-snapshot wording, accessible labels, cached/offline freshness state, continuation loading, and actionable calculation/cursor failure retry or restart controls to the completion dashboard in `apps/web/src/features/reports/CompletionDashboard.tsx`, `apps/web/src/features/reports/CompletionFilters.tsx`, and `apps/web/src/features/reports/completion-bucketing.ts`
- [X] T080 [US4] Display current urgency breakdowns and viewer-only rank overlays in Category/Project tree, drilldown, archive, and export controls; add overall/Project rank sorting with inapplicable-state guidance plus continuation, retry, and restart handling in `apps/web/src/features/projects/ProjectTree.tsx`, `apps/web/src/features/projects/useWorkloadTree.ts`, and `apps/web/src/features/archive/ArchivePage.tsx`

**Checkpoint**: All existing report and export surfaces expose correct urgency dimensions and never reconstruct or disclose another user's historical/current ranks.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Prove scale, recovery, security, accessibility, observability, cost, and release readiness across all stories.

- [X] T081 [P] Build deterministic 50,000-item overall and 10,000-item Project stack/report fixtures with all urgency levels in `tests/performance/fixtures/urgency-stack-ranking.ts`
- [X] T082 Validate warmed synced-cache read/reorder durability targets, operation chunk limits, replay/compaction, filter/report latency, 500-to-4,000 candidate evaluation bounds, four-page source-read cap, sparse short/empty pages, multi-audience merge, cursor-state size/TTL, and no-scan archive/drilldown access under target scale in `tests/performance/urgency-stack-ranking.test.ts`
- [X] T083 [P] Add infrastructure assertions for pay-per-use capacity, encryption, least-privilege rank/pointer/cursor access, cursor TTL, streams/PITR, Lambda concurrency/timeouts, log retention, pagination metrics, and alarms in `infra/test/urgency-stack-ranking.test.ts`
- [X] T084 Validate Chrome and Safari/WebKit behavior at desktop, iPhone, and iPad viewports, including keyboard, touch, focus, and screen-reader announcements, using `tests/e2e/urgency.spec.ts`, `tests/e2e/personal-stack.spec.ts`, `tests/e2e/urgency-filtering.spec.ts`, and `tests/e2e/urgency-reporting.spec.ts`
- [X] T085 Validate same-user multi-device offline/reconnect ordering, authorization changes, hard deletion, lifecycle transitions, and conflict recovery using `apps/web/test/db/personal-stack-offline.test.ts` and `tests/integration/personal-stack-service.test.ts`
- [X] T086 Complete end-to-end backup/restore validation for operations, urgency fields, completion snapshots, snapshots-as-derived-data, corrupt chunks, and urgency total reconciliation in `tests/restore/personal-stack-restore.test.ts` and `infra/test/restore-workflow-stack.test.ts`
- [X] T087 Review serverless alternatives, cost drivers, scaling assumptions, operation/snapshot retention, compression choices, and cheaper alternatives; record any corrected decisions in `specs/005-urgency-stack-ranking/plan.md`
- [X] T088 Audit CloudWatch detail, cursor/pointer redaction, retention, bounded dimensions, filtered-read amplification, restart/failure alerts, and expected cost; correct configuration in `apps/api/src/ranking/telemetry.ts`, `apps/api/src/reporting/telemetry.ts`, and `infra/lib/observability-stack.ts`
- [X] T089 [P] Write the user guide explaining all five urgency levels, urgency versus personal execution order, overall versus Project positions and report sorting, filtering, short-page continuation, accessible controls, offline/pending/conflict states, retry/restart recovery, report semantics, and rank privacy in `docs/user/urgency-stack-ranking.md`
- [X] T090 [P] Write the operations runbook covering stack storage and compaction, filtered pagination, audience pointers/source epochs, encrypted cursor TTL/state, protected logging, metrics/alarms, failure diagnosis, retry/restart behavior, backup/restore, replay validation, projection reconciliation, cost drivers, and recovery procedures in `docs/operations/urgency-stack-ranking.md`
- [X] T091 Run every scenario and release command in `specs/005-urgency-stack-ranking/quickstart.md`, recording verified results and any environment-specific exceptions in that file
- [X] T092 Re-review the final feature diff for correctness, unnecessary complexity, authorization/privacy boundaries, data-loss risks, comments, generated contract drift, and documentation; record remaining findings in `specs/005-urgency-stack-ranking/tasks.md`

### Final Review Findings

- **Resolved — durable runtime composition (2026-08-05)**: ranking and contract-v4 sync now compose
  the DynamoDB-backed personal-stack repository, reconstruct canonical order after Lambda recycling,
  persist idempotency/conflict outcomes, and asynchronously invoke the authorized compactor for
  durable pending acknowledgements. Cold-start recovery and atomic-write coverage lives in
  `apps/api/test/ranking/runtime.test.ts`.
- **Resolved — report rank overlay composition (2026-08-05)**: the deployed reporting handler now
  installs the owner-private durable stack adapter. Drill-down rows receive the viewer's overall and
  applicable Project positions; `apps/api/test/reporting/rank-overlay.test.ts` covers an item that is
  first within its Project and third overall.
- **Resolved — bounded multi-source production reads (2026-08-05)**: deployed archive and workload
  drill-down detail paths now query audience/lifecycle/scope/urgency pointer partitions through the
  bounded reader, batch-hydrate and reauthorize candidates, stop after four source pages or the
  candidate budget, and persist encrypted owner-scoped multi-source continuation state behind a
  signed opaque reference. Inline/persisted round trips plus cross-owner, expiry, and tamper failures
  are covered by `apps/api/test/shared/persistent-pagination-cursor.test.ts`; reporting receives only
  cursor-prefix write permission.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T002 and T003 can proceed in parallel after task ownership is clear.
- **Foundational (Phase 2)**: Depends on Setup and blocks story implementation; T006 and T007 can proceed together, while T005 follows the failing T004 migration test.
- **User Story 1 (Phase 3)**: Depends only on Foundational and is the recommended MVP.
- **User Story 2 (Phase 4)**: Depends only on Foundational; it consumes urgency labels when US1 is present but ranking semantics remain independently testable with fixture urgency values.
- **User Story 3 (Phase 5)**: Depends on Foundational plus the urgency model from T015; stack-filter integration T060 and personal-stack pagination T062 additionally depend on US2 ordering/replay tasks T034-T041 and selector T048. Work-view projection task T093 follows the shared cursor foundation in T062 but does not depend on another user's ranking semantics.
- **User Story 4 (Phase 6)**: Depends on Foundational plus the urgency model from T015 and work-view projection task T093; viewer-rank sorting/overlays T074/T076/T080 additionally depend on the US2 ranking service and selectors.
- **Polish (Phase 7)**: Depends on every story selected for release.

### User Story Dependencies

- **US1 (P1)**: No story dependency; delivers the independently shippable urgency MVP.
- **US2 (P1)**: No functional dependency on US1 ordering rules; urgency is display metadata and never determines rank.
- **US3 (P2)**: Core urgency filtering depends on US1; filtering ranked stacks and their server pages also depends on US2.
- **US4 (P2)**: Urgency reporting depends on US1 and the T093 filtered work-view projection; viewer-only rank sorting/overlays depend on US2.

### Within Each User Story

- Write the story's automated tests first and verify the expected failures.
- Implement domain schemas and deterministic algorithms before repositories and services.
- Implement repositories before service orchestration, and services before handlers/UI integration.
- Keep urgency categorical; never derive rank, score, or comparison from urgency.
- Validate online, offline, reconnect, authorization, lifecycle, and recovery paths before declaring the story complete.

### Parallel Opportunities

- Setup scaffolds T002 and T003 are independent.
- Foundation contract/sync work T006-T007 can proceed independently after Setup.
- Within US1, tests T009-T014 can be authored in parallel; Task and List service work T017-T018 is file-isolated.
- Within US2, tests T025-T033 can be authored in parallel; domain, key, compactor, telemetry, restore, selector, and UI component tasks marked `[P]` are file-isolated after their named prerequisites.
- Within US3, test tasks T053-T056 and parsing/UI work T057/T059 can proceed in parallel; T093 follows the shared cursor foundation from T062.
- Within US4, test tasks T063-T069 and schema/archive/telemetry work marked `[P]` can proceed in parallel.
- After Foundation, US1 and US2 may be developed concurrently; US3 and US4 can begin once their explicit US1/US2 dependencies are available.

---

## Parallel Examples

### User Story 1

```text
T009 domain urgency tests
T010 API contract tests
T011 API integration tests
T012 offline database tests
T013 accessibility component tests
T014 Chromium/WebKit tests
```

### User Story 2

```text
T025 deterministic domain/replay tests
T026 endpoint and sync contract tests
T027 repository/chunk tests
T028 service/concurrency tests
T029 privacy and authorization tests
T030 offline/reconnect tests
T031 accessibility component tests
T032 Chromium/WebKit tests
T033 restore tests
```

### User Story 3

```text
T053 local predicate and URL tests
T054 API contract/integration tests
T055 filter component tests
T056 Chromium/WebKit filter tests
```

### User Story 4

```text
T063 completion snapshot domain tests
T064 completion contract tests
T065 historical/current integration tests
T066 projection tests
T067 export privacy tests
T068 report component tests
T069 Chromium/WebKit report tests
```

---

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete User Story 1, including all failing-first tests.
3. Stop and validate every urgency level, Medium defaulting, permissions, revision history, offline sync, and active/archive accessibility.
4. Ship/demo urgency as the first independently valuable increment.

### Incremental Delivery

1. Deliver US1 for shared urgency.
2. Deliver US2 for private overall and per-Project stacks, validating that urgency never dictates order.
3. Deliver US3 for composable urgency filters over the now-ranked work views.
4. Deliver US4 for urgency-aware reports, historical completion snapshots, and viewer-only rank overlays.
5. Run Phase 7 gates before production release.

### Suggested First Implementation Slice

Complete T001-T024. This slice adds the complete urgency vocabulary and editing journey without requiring ranking, filtering, or reporting to ship simultaneously.

---

## Notes

- `[P]` means different files and no unfinished dependency; tasks sharing a mutable core file are intentionally sequential.
- T093 is intentionally placed directly after T062 in execution order so the split preserves all previously assigned task IDs.
- Personal rank is private to its owner and never grants visibility or edit authority.
- Overall and per-Project positions are separate; an item may be Project #1 and overall #5.
- Filtered reorders permute matching items only within their already occupied positions.
- There are no legacy work items or completion events to backfill at rollout, but upgrade migrations must preserve existing encrypted local metadata and pending sync state.
- Commit after each task or coherent task group and stop at story checkpoints for independent validation.
