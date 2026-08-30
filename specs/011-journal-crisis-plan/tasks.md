---

description: "Dependency-ordered implementation tasks for Journal Crisis Plans"
---

# Tasks: Journal Crisis Plans

**Input**: Design documents from `/specs/011-journal-crisis-plan/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and the implemented Feature 010 encrypted Journal foundation

**Tests**: Automated tests are required. Within every user-story phase, write the listed tests first and confirm that they fail for the expected missing behavior before implementing the story.

**Organization**: Tasks are grouped by user story so each increment has an explicit goal and independent acceptance test. Feature 010 remains a hard prerequisite; this task list does not duplicate its implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other ready tasks because it changes different files and has no unmet dependency
- **[Story]**: Maps the task to a user story from `spec.md`
- Every task names the exact file or files it changes

## Phase 1: Setup

**Purpose**: Establish the feature boundary, fixtures, and exports without changing production behavior.

- [X] T001 Verify that Feature 010's encrypted Journal, JMK recovery, Lexical editor, offline outbox, sync-v5, and journal-entry APIs are implemented and passing; record the commands and evidence in `specs/011-journal-crisis-plan/quickstart.md`, and block all later tasks if any prerequisite is absent
- [X] T002 [P] Add reusable owner, recipient, encrypted-plan, and journal-entry fixture builders in `tests/fixtures/crisis-plan.ts`
- [X] T003 [P] Add the Crisis Plan contract-module export placeholder in `packages/contracts/src/index.ts` and `packages/contracts/src/crisis-plan-openapi.ts`
- [X] T004 [P] Add the Crisis Plan observability-module export placeholder in `packages/observability/src/index.ts` and `packages/observability/src/crisis-plan.ts`
- [X] T005 [P] Before any change to `tests/e2e/journal.spec.ts`, `playwright.quick.config.ts`, `package.json`, or `.github/workflows/validate.yml`, list the required quick-test count and measure `/usr/bin/time -p npm run test:e2e:quick`; record the baseline in `specs/011-journal-crisis-plan/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared data, contract, storage, sync, and telemetry foundations used by every story.

**CRITICAL**: No user-story implementation begins until this phase passes its tests.

- [X] T006 [P] Add failing domain tests for Crisis Plan identifiers, ciphertext envelopes, generations, optimistic versions, recipient limits, rotation-required state, and the no-delete invariant in `packages/domain/test/crisis-plan.test.ts`
- [X] T007 [P] Add failing contract-schema tests for sync-v6 plan changes, owner/shared summaries, actionable errors, and protected-field exclusion in `tests/contract/crisis-plan.contract.test.ts`
- [X] T008 [P] Add failing Dexie migration tests for schema v13 owner-plan, outbox, and owner-only key stores without recipient plaintext or key persistence in `apps/web/test/db/crisis-plan-database.test.ts`
- [X] T009 Define Crisis Plan domain entities, branded identifiers, encrypted envelopes, share records, and invariants in `packages/domain/src/crisis-plan.ts` and export them from `packages/domain/src/index.ts`
- [X] T010 Define and export the OpenAPI-derived request, response, sync-v6, and error schemas in `packages/contracts/src/crisis-plan-openapi.ts` and `packages/contracts/src/index.ts`
- [X] T011 Advance Journal feature negotiation to sync protocol v6 while retaining compatible v5 journal-entry handling in `packages/domain/src/journal.ts` and `apps/web/src/sync/sync-engine.ts`
- [X] T012 Implement the Dexie v13 migration and owner-only Crisis Plan/outbox/key tables in `apps/web/src/db/database.ts`
- [X] T013 [P] Add failing telemetry tests that reject plan HTML, ciphertext, wrapped keys, user search text, recipient identifiers, and journal answers from logs or metrics in `apps/api/test/journal/crisis-plan-telemetry.test.ts`
- [X] T014 Implement the Crisis Plan event allowlist, safe correlation fields, metric names, and protected-data redaction in `apps/api/src/journal/telemetry.ts` and `packages/observability/src/crisis-plan.ts`
- [X] T015 Add the shared Crisis Plan route constants and client-facing error mapping without exposing protected payloads in `apps/web/src/app/router.tsx` and `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T016 Add API route dispatch and authenticated request-context wiring for the Crisis Plan contract surface in `apps/api/src/journal/crisis-plan-handler.ts` and `apps/api/src/index.ts`
- [X] T017 Extend backup inventory and restore-test fixtures to recognize encrypted Crisis Plan records, share generations, and rotation flags in `tests/restore/fixtures/crisis-plan-backup.ts` and `infra/lib/journal-stack.ts`

**Checkpoint**: Domain and wire contracts agree, schema v13 migrates safely, sync v6 negotiates, and protected Crisis Plan data is excluded from telemetry.

---

## Phase 3: User Story 1 - Create a Crisis Plan Before Journaling (Priority: P1) MVP

**Goal**: A user creates one encrypted, single-field WYSIWYG Crisis Plan before their first journal entry; the server independently enforces the prerequisite.

**Independent Test**: With a new account, attempt to create a journal entry and observe the Crisis Plan gate; create and save a rich-text plan, reload it successfully, then create the entry. A direct entry API request before plan creation must fail with the documented actionable error.

### Tests for User Story 1

- [X] T018 [P] [US1] Add failing crypto unit tests for random 256-bit CPK generation, AES-256-GCM plan encryption, JMK-derived owner wrapping, nonce uniqueness, tamper rejection, and plaintext exclusion in `apps/web/test/crypto/crisis-plan-crypto.test.ts`
- [X] T019 [P] [US1] Add failing local-repository tests for encrypted owner-plan persistence, atomic plan/outbox writes, crash recovery, and the absence of plaintext HTML in IndexedDB in `apps/web/test/db/crisis-plan-repository.test.ts`
- [X] T020 [P] [US1] Add failing API contract tests for owner plan create/get and the `CRISIS_PLAN_REQUIRED` journal-entry creation response in `tests/contract/crisis-plan.contract.test.ts`
- [X] T021 [P] [US1] Add failing API service tests for plan creation, legacy-entry behavior, authorization, validation, idempotent retry, and actionable failures in `apps/api/test/journal/crisis-plan-service.test.ts`
- [X] T022 [P] [US1] Add failing editor tests for every supported format, formatting-only documents, raw HTML, scripts, event attributes, embedded media, unknown Lexical nodes, malformed links, unsafe protocols, oversized content, and safe round-trip rendering in `apps/web/test/features/crisis-plan-editor.test.tsx`
- [X] T023 [P] [US1] Add failing integration tests proving plan creation is idempotent and journal-entry creation is rejected until the same owner has a current plan in `tests/integration/crisis-plan-sync.test.ts`
- [X] T024 [P] [US1] Add a failing browser test for the first-entry gate, single WYSIWYG plan field, save/reload, and successful subsequent journal creation in `tests/e2e/journal.spec.ts`

### Implementation for User Story 1

- [X] T025 [P] [US1] Implement CPK generation, plan-body encryption/decryption, JMK-derived owner key wrapping, authenticated metadata, and zeroizable buffers in `apps/web/src/crypto/crisis-plan-crypto.ts`
- [X] T026 [P] [US1] Implement encrypted owner-plan reads, atomic plan/outbox writes, and recovery-safe pending states in `apps/web/src/db/crisis-plan-repository.ts`
- [X] T027 [US1] Implement owner plan create/get persistence with conditional single-plan semantics and ciphertext-only records in `apps/api/src/journal/crisis-plan-repository.ts`
- [X] T028 [US1] Implement owner plan creation validation, idempotency, version assignment, and plan-required entry authorization in `apps/api/src/journal/crisis-plan-service.ts` and `apps/api/src/journal/crisis-plan-authorization.ts`
- [X] T029 [US1] Expose owner plan create/get endpoints and enforce the plan prerequisite on new journal-entry creation while allowing updates to legacy entries in `apps/api/src/journal/crisis-plan-handler.ts` and `apps/api/src/journal/journal-entry-handler.ts`
- [X] T030 [US1] Add sync-v6 upload/download ordering so a pending Crisis Plan is acknowledged before its dependent first journal entry in `apps/web/src/sync/sync-engine.ts`
- [X] T031 [US1] Build the single-field Lexical Crisis Plan editor with accessible save, retry, validation, and unsaved-change states in `apps/web/src/features/journal/CrisisPlanEditor.tsx`
- [X] T032 [US1] Build the owner Crisis Plans tab and create flow in `apps/web/src/features/journal/CrisisPlanPage.tsx` and register `/journal/crisis-plans` in `apps/web/src/app/router.tsx`
- [X] T033 [US1] Gate first-entry creation on a locally or remotely confirmed Crisis Plan while retaining every structured journal field and its designated WYSIWYG fields in `apps/web/src/features/journal/JournalEntryEditor.tsx` and `apps/web/src/features/journal/crisis-plan-client.ts`

**Checkpoint**: User Story 1 passes independently and is the deployable MVP.

---

## Phase 4: User Story 2 - View and Update My Crisis Plan (Priority: P1)

**Goal**: The owner can revisit and replace the current plan content at any time, with conflict-safe saves and no delete operation.

**Independent Test**: Open an existing plan from the Crisis Plans tab, edit rich text, save, and reload the replacement. Simulate a stale version and verify a recoverable conflict; verify no UI or API supports deletion.

### Tests for User Story 2

- [X] T034 [P] [US2] Add failing domain and API tests for current-generation replacement, optimistic version conflicts, rich-text size limits, and rejection of delete/tombstone operations in `packages/domain/test/crisis-plan.test.ts` and `tests/contract/crisis-plan.contract.test.ts`
- [X] T035 [P] [US2] Add failing repository integration tests for atomic content/version replacement, idempotent retries, stale writes, and retained prior ciphertext on failure in `tests/integration/crisis-plan-sync.test.ts`
- [X] T036 [P] [US2] Add failing component tests for loading, editing, retrying, conflict recovery, navigation warnings, and the absence of a delete control in `apps/web/test/features/crisis-plan-page.test.tsx`

### Implementation for User Story 2

- [X] T037 [P] [US2] Add replace-current-plan request validation and response schemas, intentionally omitting DELETE, in `packages/contracts/src/crisis-plan-openapi.ts`
- [X] T038 [US2] Implement conditional owner plan replacement with monotonic versions, preserved prior ciphertext on transaction failure, and no deletion method in `apps/api/src/journal/crisis-plan-repository.ts`
- [X] T039 [US2] Implement owner-only update authorization, content-size enforcement, conflict errors, and idempotent retry handling in `apps/api/src/journal/crisis-plan-service.ts` and `apps/api/src/journal/crisis-plan-handler.ts`
- [X] T040 [US2] Implement local optimistic updates, rollback, outbox retry, and conflict reconciliation for owner edits in `apps/web/src/db/crisis-plan-repository.ts` and `apps/web/src/sync/sync-engine.ts`
- [X] T041 [US2] Extend the editor and page with current-plan loading, save-state feedback, retry, stale-version recovery, and navigation protection in `apps/web/src/features/journal/CrisisPlanEditor.tsx` and `apps/web/src/features/journal/CrisisPlanPage.tsx`
- [X] T042 [US2] Add the Journal main-menu item and nested Crisis Plans tab while preserving deep-link and back-navigation behavior in `apps/web/src/app/App.tsx` and `apps/web/src/app/router.tsx`

**Checkpoint**: User Stories 1 and 2 support the full owner create/view/update lifecycle without deletion.

---

## Phase 5: User Story 3 - Show the Crisis Plan for Crisis-Related Answers (Priority: P1)

**Goal**: Selecting “yes” for either suicidal behaviors or self-harm behaviors immediately shows the user's current Crisis Plan inline without discarding journal answers.

**Independent Test**: In the journal editor, toggle each trigger independently and together; the current plan appears inline, remains visible while either answer is yes, disappears when both are no, preserves every answer, and offers an actionable recovery state if the plan cannot be decrypted.

### Tests for User Story 3

- [X] T043 [P] [US3] Add failing component tests for both trigger fields, combined trigger truth table, answer preservation, accessibility focus, and decrypt/load failure recovery in `apps/web/test/features/triggered-crisis-plan.test.tsx`
- [X] T044 [P] [US3] Extend the failing journal browser journey to cover suicidal-behavior and self-harm triggers without creating a second required quick-test journey in `tests/e2e/journal.spec.ts`
- [X] T045 [P] [US3] Add failing privacy tests proving trigger values and displayed plan content never enter client analytics, API logs, or notification payloads in `tests/security/crisis-plan.security.test.ts`

### Implementation for User Story 3

- [X] T046 [P] [US3] Build the accessible inline read-only plan renderer with safe rich-text rendering, focus announcement, retry, and edit-plan link in `apps/web/src/features/journal/TriggeredCrisisPlan.tsx`
- [X] T047 [US3] Integrate the trigger truth table into new and existing journal-entry editing without mutating structured answers or designated rich-text fields in `apps/web/src/features/journal/JournalEntryEditor.tsx`
- [X] T048 [US3] Load the owner's current decrypted plan from local storage first and reconcile it with the server without blocking already-entered journal answers in `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T049 [US3] Add safe trigger-render and decrypt-failure metrics with protected-data exclusions in `apps/api/src/journal/telemetry.ts` and `packages/observability/src/crisis-plan.ts`
- [X] T050 [US3] Validate responsive inline display and keyboard/screen-reader behavior at desktop, iPhone, and iPad viewports in `tests/e2e/journal.spec.ts`

**Checkpoint**: All P1 user stories work together, and crisis answers surface the plan without data loss or protected-data leakage.

---

## Phase 6: User Story 4 - Share My Crisis Plan Selectively (Priority: P2)

**Goal**: An owner can grant immediate view access to selected active users; recipients see shared plans on the Crisis Plans tab only while online, and revocation becomes cryptographically effective through key rotation.

**Independent Test**: Share a seeded plan with one active user, confirm it appears immediately in that recipient's Crisis Plans tab and nowhere else, reject an unauthorized user, revoke access and confirm the recipient can no longer decrypt it, then remove access as the recipient and confirm the owner's plan is marked for rotation.

### Tests for User Story 4

- [X] T051 [P] [US4] Add failing browser crypto tests for signed sharing-key registry verification, identity-bound CPK grant creation, one-use recipient wrapping, wrong-user rejection, and tamper rejection in `apps/web/test/crypto/crisis-plan-crypto.test.ts`
- [X] T052 [P] [US4] Add failing contract tests for active-user search, grants, owner share listing, recipient shared-plan summaries, key-broker requests, revoke, and recipient self-removal in `tests/contract/crisis-plan.contract.test.ts`
- [X] T053 [P] [US4] Add failing integration tests for the 90-recipient cap, duplicate grants, owner/recipient authorization, immediate visibility, owner-update/refocus/refresh delivery of only the latest committed plan, self-removal, and rotation-required mutation blocking in `tests/integration/crisis-plan-sharing.test.ts`
- [X] T054 [P] [US4] Add failing recipient-lifecycle tests proving that account deletion or deactivation immediately denies shared-list, refresh, direct-open, cached-link, and broker access without changing the owner's plan or other shares in `tests/integration/crisis-plan-recipient-lifecycle.test.ts`
- [X] T055 [P] [US4] Add failing security tests proving KMS only decrypts CPK grants, broker responses are one-use/no-store, unauthorized/cross-user access is denied, and recipient content or keys are never persisted in `tests/security/crisis-plan.security.test.ts`
- [X] T056 [P] [US4] Add failing security tests proving ordinary administrators, recovery administrators, reporting/export roles, and ordinary API roles cannot read plan/share/grant records, invoke broker decryption, call KMS decrypt, or obtain sensitive metadata in `tests/security/crisis-plan-admin-recovery.security.test.ts`
- [X] T057 [P] [US4] Add failing infrastructure tests for the RSA-3072 KMS key, signing registry, least-privilege broker role, explicit/effective denial for admin/recovery/API roles, API routes, throttles, and log exclusions in `infra/test/crisis-plan-sharing.test.ts`
- [X] T058 [P] [US4] Add failing broker unit tests for authorization, KMS failures, grant/binding validation, revocation races, one-use wrapping, response caching, and protected-data exclusion in `apps/api/test/journal/crisis-plan-key-broker.test.ts`
- [X] T059 [P] [US4] Add failing Select2 share-manager tests for search, keyboard/touch/assistive-technology interaction, unmount cleanup, immediate selection, offline pending state, and external-copy disclosure in revoke/remove confirmations in `apps/web/test/features/crisis-plan-share-manager.test.tsx`
- [X] T060 [P] [US4] Add failing multi-user Playwright coverage for immediate share visibility, shared-tab placement, owner update followed by recipient refocus/refresh of only the latest committed version, revoke, self-removal, and offline denial in `tests/e2e/crisis-plan-sharing.spec.ts`

### Implementation for User Story 4

- [X] T061 [P] [US4] Provision the dedicated RSA-3072 KMS sharing key, rotation policy, aliases, public-key registry signing material, and least-privilege grants in `infra/lib/crisis-plan-sharing-stack.ts`
- [X] T062 [P] [US4] Define share, active-user search, shared-summary, broker, revoke, rotation, and self-removal schemas in `packages/contracts/src/crisis-plan-openapi.ts`
- [X] T063 [US4] Implement signed sharing-key registry publication, retrieval, caching, and verification metadata in `apps/api/src/journal/sharing-key-registry.ts` and `apps/api/src/journal/crisis-plan-handler.ts`
- [X] T064 [US4] Implement identity-bound KMS grant encryption plus ephemeral browser RSA key-pair generation and broker-response unwrapping in `apps/web/src/crypto/crisis-plan-crypto.ts`
- [X] T065 [US4] Implement rate-limited, minimum-query-length active-user search with 20-result pagination, minimal identity fields, and active-account filtering for the Select2 data source in `apps/api/src/journal/crisis-plan-service.ts` and `apps/api/src/journal/crisis-plan-handler.ts`
- [X] T066 [US4] Implement share, recipient-index, generation, revocation, and rotation-required persistence operations in `apps/api/src/journal/crisis-plan-repository.ts`
- [X] T067 [US4] Implement owner grant validation, immediate share activation, 90-recipient enforcement, duplicate handling, shared-summary authorization, recipient self-removal, and current account-active checks that deny deleted/deactivated recipients while retaining the relationship for owner audit in `apps/api/src/journal/crisis-plan-service.ts` and `apps/api/src/journal/crisis-plan-authorization.ts`
- [X] T068 [US4] Implement share/search/list/revoke/self-remove endpoints with actionable errors and safe audit events in `apps/api/src/journal/crisis-plan-handler.ts` and `apps/api/src/journal/telemetry.ts`
- [X] T069 [US4] Implement the isolated key broker that validates session, active share, owner, recipient, generation, and one-use request; decrypts only the CPK grant through KMS; rewraps to the ephemeral recipient key; and returns `Cache-Control: no-store` in `apps/api/src/journal/crisis-plan-key-broker-handler.ts`
- [X] T070 [US4] Wire the broker Lambda, API route, reserved concurrency, throttling, alarms, and KMS/IAM permissions without DynamoDB plan-body read access in `infra/lib/crisis-plan-sharing-stack.ts` and `infra/lib/observability-stack.ts`
- [X] T071 [US4] Implement owner revocation as one DynamoDB transaction that rotates the CPK and body generation, replaces the owner wrap, recreates all remaining grants, and clears rotation-required state in `apps/api/src/journal/crisis-plan-repository.ts` and `apps/api/src/journal/crisis-plan-service.ts`
- [X] T072 [US4] Block owner content/share mutations after recipient self-removal until rekey succeeds, and expose the recoverable rotation workflow in `apps/api/src/journal/crisis-plan-service.ts` and `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T073 [US4] Implement browser clients for active-user search, share creation, shared summaries, broker decryption, revoke, rekey retry, and self-removal in `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T074 [US4] Add and pin Select2, its jQuery runtime, and required TypeScript declarations in `package.json` and `package-lock.json`, then build the owner share manager with a React lifecycle setup/cleanup adapter, accessible keyboard/touch behavior, direct-add confirmation, live recipient list, revoke/rekey status, duplicate/cap errors, truthful offline pending state, external-copy disclosure, and retry behavior in `apps/web/src/features/journal/CrisisPlanShareManager.tsx`
- [X] T075 [US4] Build the online-only shared-plan list and read-only viewer, including remove-my-access confirmation with external-copy disclosure, account-inactive/session-expiry handling, and immediate purge in `apps/web/src/features/journal/SharedCrisisPlanView.tsx` and `apps/web/src/features/journal/CrisisPlanPage.tsx`
- [X] T076 [US4] Register `/journal/crisis-plans/shared/{planId}` and ensure shared plans appear only on the Crisis Plans tab in `apps/web/src/app/router.tsx` and `apps/web/src/app/App.tsx`

**Checkpoint**: Selective sharing is immediate, least-privilege, recipient-online-only, and cryptographically revoked.

---

## Phase 7: User Story 5 - Use Across Browsers and Connectivity States (Priority: P3)

**Goal**: Owners retain safe offline editing and reconnect behavior, while recipients require a live authorized session and leave no shared plaintext or key material behind.

**Independent Test**: As an owner, edit offline, restart, reconnect, and resolve a concurrent edit without losing either version. As a recipient, lose connectivity, hide/leave the tab, log out, and expire the session; shared content disappears and no recoverable recipient plaintext/key remains. Repeat in Chromium and WebKit at desktop and mobile/tablet viewports.

### Tests for User Story 5

- [X] T077 [P] [US5] Add failing offline/sync tests for owner restart recovery, reconnect ordering, idempotent retry, concurrent-version conflict, and retained recoverable content in `tests/integration/crisis-plan-sync.test.ts`
- [X] T078 [P] [US5] Add failing recipient teardown tests for offline transition, route leave, tab hide, logout, session invalidation, browser back/forward cache, and storage inspection in `tests/security/crisis-plan.security.test.ts`
- [X] T079 [P] [US5] Add failing offline sharing tests for encrypted pending share/revocation intents, truthful continued-access messaging, restart recovery, ordered reconnect processing, idempotent retry, and conflicts in `apps/web/test/features/crisis-plan-sharing-offline.test.tsx` and `tests/integration/crisis-plan-sharing.test.ts`
- [X] T080 [P] [US5] Add failing Chromium/WebKit desktop, iPhone, and iPad journeys for owner offline/reconnect and recipient online-only access in `tests/e2e/crisis-plan-connectivity.spec.ts`
- [X] T081 [P] [US5] Add performance tests measuring p95 local editor and trigger response under 100 milliseconds, ordinary-mobile view usability and save/share confirmation within 2 seconds, degraded-mobile usability within 5 seconds or an accurate pending/loading state, and small, maximum-body, 50-recipient, and 90-recipient fixtures without assuming higher-cost AWS capacity in `tests/performance/crisis-plan.test.ts`
- [X] T082 [P] [US5] Add failing backup/restore tests proving encrypted owner plans, generations, grants, and rotation-required state restore without plaintext exposure in `tests/restore/crisis-plan-restore.test.ts`

### Implementation for User Story 5

- [X] T083 [US5] Implement owner offline draft reopening, ordered reconnect flush, idempotent acknowledgements, and bounded retry/backoff in `apps/web/src/db/crisis-plan-repository.ts` and `apps/web/src/sync/sync-engine.ts`
- [X] T084 [US5] Persist encrypted owner share/revocation intents atomically with the outbox, drain them serially after plan mutations, retain failures/conflicts across restart, and expose local-pending versus remotely-effective access without claiming offline revocation success in `apps/web/src/db/crisis-plan-repository.ts`, `apps/web/src/sync/sync-engine.ts`, `apps/web/src/features/journal/CrisisPlanShareManager.tsx`, and `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T085 [US5] Implement explicit owner conflict resolution that preserves local and server encrypted versions until the user chooses a replacement in `apps/web/src/features/journal/CrisisPlanEditor.tsx` and `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T086 [US5] Implement recipient in-memory-only state and purge it on offline, route leave, visibility hide, pagehide, logout, session invalidation, and back/forward cache restore in `apps/web/src/features/journal/SharedCrisisPlanView.tsx` and `apps/web/src/features/journal/crisis-plan-client.ts`
- [X] T087 [US5] Add server-side expiry, retry, throttling, and conflict responses that preserve safe recovery semantics across browser restarts in `apps/api/src/journal/crisis-plan-service.ts` and `apps/api/src/journal/crisis-plan-key-broker-handler.ts`
- [X] T088 [US5] Add encrypted-record restore validation and operational recovery checks to the Journal backup configuration in `infra/lib/journal-stack.ts` and `tests/restore/crisis-plan-restore.test.ts`
- [X] T089 [US5] Tune browser work, indexes, payload bounds, pagination, broker concurrency, and retry budgets to satisfy the documented scale and performance targets using existing on-demand AWS services; require explicit user approval and measured justification before materially increasing recurring AWS cost or adding always-on capacity in `apps/web/src/features/journal/crisis-plan-client.ts`, `apps/api/src/journal/crisis-plan-repository.ts`, `apps/api/src/journal/crisis-plan-key-broker-handler.ts`, and `infra/lib/crisis-plan-sharing-stack.ts`

**Checkpoint**: Owner offline resilience and recipient online-only confidentiality pass across the required browsers and viewports.

---

## Phase 8: Polish and Cross-Cutting Validation

**Purpose**: Complete operational controls, documentation, regression validation, and the required-validation runtime guardrails.

- [X] T090 [P] Reconcile implemented routes, fields, errors, and security headers against every operation in `specs/011-journal-crisis-plan/contracts/crisis-plan.openapi.yaml` and update `packages/contracts/src/crisis-plan-openapi.ts` for any mismatch
- [X] T091 [P] Create or update the plaintext, key, log, cache, authorization, revocation, recovery, privacy, support, key-compromise, and restore checklists in `docs/security/crisis-plan-threat-model.md` and `docs/runbooks/crisis-plan-operations.md`
- [X] T092 Complete CloudWatch dashboards, alarms, retention, failure metrics, safe audit events, and expected-cost annotations in `infra/lib/observability-stack.ts` and `packages/observability/src/crisis-plan.ts`
- [X] T093 Verify with automated source/log scans that plaintext plan HTML, decrypted CPKs, wrapped keys, recipient query text, and crisis answers cannot cross persistence, log, metric, trace, cache, or notification boundaries in `tests/security/crisis-plan.security.test.ts`
- [X] T094 Run and fix focused unit, contract, integration, security, restore, infrastructure, and performance suites using the commands documented in `specs/011-journal-crisis-plan/quickstart.md`
- [X] T095 Run and fix the exhaustive Chromium/WebKit desktop, iPhone, and iPad Crisis Plan journeys outside the required quick suite using `tests/e2e/crisis-plan-sharing.spec.ts` and `tests/e2e/crisis-plan-connectivity.spec.ts`
- [X] T096 Audit that T005's required quick-test count and timing were recorded before the first required-validation change; if missing, measure the known pre-feature commit in a clean temporary worktree without modifying the active checkout, and document the commit, counts, timing, and comparison in `specs/011-journal-crisis-plan/quickstart.md`
- [X] T097 Keep exactly one representative Crisis Plan journey in the existing required Journal quick-test file `tests/e2e/journal.spec.ts`; place exhaustive sharing, browser, device, and connectivity cases only in `tests/e2e/crisis-plan-sharing.spec.ts` and `tests/e2e/crisis-plan-connectivity.spec.ts`
- [X] T098 After any required-validation change, list the resulting test count, rerun `/usr/bin/time -p npm run test:e2e:quick`, and record the before/after counts and timings in `specs/011-journal-crisis-plan/quickstart.md`; do not accept an expected hosted PR runtime above ten minutes without explicit approval and a documented reason
- [ ] T099 Run the complete repository validation and confirm the hosted PR check stays at or below ten minutes with reasonable headroom under the workflow timeout in `.github/workflows/validate.yml`; record the run link and duration in `specs/011-journal-crisis-plan/quickstart.md`
- [X] T100 Review the final diff for authorization gaps, cryptographic misuse, transaction limits, offline leakage, data-loss paths, actionable errors, unnecessary complexity, and comments/documentation drift, updating `specs/011-journal-crisis-plan/quickstart.md` with the final review result
- [ ] T101 Execute every acceptance scenario in `specs/011-journal-crisis-plan/spec.md`, every checkpoint in `specs/011-journal-crisis-plan/quickstart.md`, and mark the feature ready only when all results are recorded and passing in `specs/011-journal-crisis-plan/quickstart.md`
- [X] T102 Add failing broker tests for credential-safe active-user projection reads, conditional DynamoDB replay receipts with TTL, cold-start replay denial, and least-privilege IAM in `apps/api/test/journal/crisis-plan-key-broker.test.ts`, `apps/api/test/journal/crisis-plan-broker-repository.test.ts`, and `infra/test/crisis-plan-sharing.test.ts`
- [X] T103 Replace broker `userById` access with a minimal top-level active-user authorization projection, keep it synchronized on provision/status changes, and conditionally persist one-use request receipts in the existing DynamoDB table in `apps/api/src/auth/user-repository.ts`, `apps/api/src/admin/user-admin-service.ts`, `apps/api/src/journal/crisis-plan-broker-repository.ts`, `apps/api/src/journal/crisis-plan-broker-handler.ts`, and `apps/api/src/journal/crisis-plan-key-broker-handler.ts`
- [X] T104 Add a non-destructive production smoke journey for Journal/Crisis Plan routing, signed sharing-key registry, concealed broker denial, no-store headers, and repeated durable reads across distinct Lambda invocations in `tests/e2e/production-smoke.spec.ts` and `.github/workflows/deploy-production.yml`
- [X] T105 Remove safely redundant Crisis Plan infrastructure resources before stack splitting, synthesize the production stack, and record resource counts/candidates in the release documentation
- [X] T106 Audit and strengthen production release/deployment documentation for the feature branch/PR workflow, the staging-workflow prohibition, smoke-account prerequisites, KMS/revocation/log/alarm/backup checks, and an isolated restore test
- [ ] T107 Run focused broker/infrastructure/smoke tests and the complete `npm run validate:pre-aws:browsers` gate; then commit only intended files, open the PR, confirm the hosted required check remains below ten minutes, and record evidence

---

## Dependencies and Execution Order

### Hard Prerequisite

- Feature 010 must provide the encrypted Journal, JMK/recovery model, Lexical editor, journal entry APIs, offline outbox, and sync-v5 baseline. T001 is a stop/go gate; missing Feature 010 work must be completed in its own task list before this feature proceeds.

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately.
- **Phase 2 (Foundational)**: Depends on T001 and relevant setup exports/fixtures; blocks every user story.
- **Phase 3 (US1)**: Depends on Phase 2 and establishes the current owner plan used by later stories.
- **Phase 4 (US2)**: Depends on US1's current-plan lifecycle; independently testable with a seeded current plan.
- **Phase 5 (US3)**: Depends on US1 and Feature 010's journal editor; independently testable with a seeded owner plan.
- **Phase 6 (US4)**: Depends on US1's encrypted current plan; does not require US2's UI to be independently tested.
- **Phase 7 (US5)**: Owner offline behavior depends on US1/US2; recipient cleanup behavior depends on US4.
- **Phase 8 (Polish)**: Depends on every story selected for release.

### Within Each User Story

1. Write all listed tests and verify expected failures.
2. Implement cryptographic/data models before persistence services.
3. Implement persistence and authorization before endpoint/UI integration.
4. Complete failure, retry, recovery, logging, and protected-data checks.
5. Run the story's independent test before moving to the next release increment.

### Dependency Graph

```text
Feature 010 -> Setup -> Foundation -> US1 (MVP)
                                      |-> US2 -> owner portion of US5
                                      |-> US3
                                      `-> US4 -> recipient portion of US5
US2 + US3 + US4 + US5 ---------------------------> Polish
```

## Parallel Opportunities

- Setup tasks T002-T005 can run together after T001 completes because they touch separate fixture, contract, observability, and validation-evidence files.
- Foundational test tasks T006-T008 and T013 can run together; implementations follow their corresponding failing tests.
- US1 tests T018-T024 can run together; implementations T025 and T026 can then run together before the service/UI integration chain.
- US2 tests T034-T036 can run together; T037 can proceed alongside repository implementation after the tests fail.
- US3 tests T043-T045 can run together; T046 can proceed independently before journal-editor integration.
- US4 tests T051-T060 can run together; infrastructure T061 and contracts T062 can run together before registry, repository, service, broker, and UI integration.
- US5 tests T077-T082 can run together; T083 precedes T084 because both change owner persistence/sync, while recipient cleanup T086 can proceed independently once its tests fail.
- Polish contract reconciliation and documentation T090-T091 can run together; runtime measurements T096-T099 remain sequential.

## Parallel Examples

### User Story 1

```text
T018 apps/web/test/crypto/crisis-plan-crypto.test.ts
T019 apps/web/test/db/crisis-plan-repository.test.ts
T020 tests/contract/crisis-plan.contract.test.ts
T021 apps/api/test/journal/crisis-plan-service.test.ts
T022 apps/web/test/features/crisis-plan-editor.test.tsx
T023 tests/integration/crisis-plan-sync.test.ts
T024 tests/e2e/journal.spec.ts
```

### User Story 2

```text
T034 packages/domain/test/crisis-plan.test.ts + tests/contract/crisis-plan.contract.test.ts
T035 tests/integration/crisis-plan-sync.test.ts
T036 apps/web/test/features/crisis-plan-page.test.tsx
```

### User Story 3

```text
T043 apps/web/test/features/triggered-crisis-plan.test.tsx
T044 tests/e2e/journal.spec.ts
T045 tests/security/crisis-plan.security.test.ts
```

### User Story 4

```text
T051 apps/web/test/crypto/crisis-plan-crypto.test.ts
T052 tests/contract/crisis-plan.contract.test.ts
T053 tests/integration/crisis-plan-sharing.test.ts
T054 tests/integration/crisis-plan-recipient-lifecycle.test.ts
T055 tests/security/crisis-plan.security.test.ts
T056 tests/security/crisis-plan-admin-recovery.security.test.ts
T057 infra/test/crisis-plan-sharing.test.ts
T058 apps/api/test/journal/crisis-plan-key-broker.test.ts
T059 apps/web/test/features/crisis-plan-share-manager.test.tsx
T060 tests/e2e/crisis-plan-sharing.spec.ts
```

### User Story 5

```text
T077 tests/integration/crisis-plan-sync.test.ts
T078 tests/security/crisis-plan.security.test.ts
T079 apps/web/test/features/crisis-plan-sharing-offline.test.tsx + tests/integration/crisis-plan-sharing.test.ts
T080 tests/e2e/crisis-plan-connectivity.spec.ts
T081 tests/performance/crisis-plan.test.ts
T082 tests/restore/crisis-plan-restore.test.ts
```

## Implementation Strategy

### MVP First

1. Complete Setup and pass the Feature 010 gate.
2. Complete the Foundational phase.
3. Complete US1 only.
4. Stop and run US1's independent acceptance test plus focused security and regression tests.
5. Deploy/demo the mandatory-plan-before-first-entry workflow if the MVP is acceptable.

### Incremental Delivery

1. Add US2 for owner view/update and conflict safety.
2. Add US3 for crisis-answer plan display; this completes all P1 behavior.
3. Add US4 for selective online sharing and cryptographic revocation.
4. Add US5 for full browser/connectivity hardening.
5. Run Polish and cross-cutting validation before release.

### Scope Guardrails

- Crisis Plans remain one WYSIWYG field; Journal structured fields and their designated WYSIWYG fields remain unchanged.
- There is no Crisis Plan delete/tombstone operation.
- Owner plans may persist encrypted offline; recipient shared content and keys may not.
- Selecting a recipient grants immediate access with no invitation/acceptance state.
- Shared plans appear only on the Crisis Plans tab.
- The key broker may unwrap only a CPK grant and must never receive or return plan plaintext.
- Required PR validation remains representative and at or below the ten-minute target; exhaustive browsers and devices stay outside `test:e2e:quick`.
