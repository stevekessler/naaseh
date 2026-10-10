# Tasks: Native Apple Applications

**Input**: Design documents from `/specs/012-native-apple-apps/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, parity-matrix.md, contracts/,
quickstart.md

**Tests**: Automated unit, integration, contract, UI, Chromium/WebKit, migration, authorization,
failure-path, and recovery tests are required by the project constitution. Physical-device and
exhaustive platform matrices remain release gates where hosted automation cannot represent the
behavior reliably.

**Organization**: Tasks are grouped by user story. P1 stories are ordered before P2 stories even
where the original story number is higher. Every story ends with an independently verifiable
checkpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on an
  incomplete task in the same phase
- **[Story]**: Maps the task to its original user story in `spec.md`
- Every task includes an exact file or directory path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the Swift workspace, targets, modules, configuration, and repeatable local
build entry points without connecting a development build to production by default.

- [X] T001 Create `apps/apple/Naaseh.xcworkspace` and `apps/apple/Naaseh.xcodeproj` with a universal iOS/iPadOS 27 app target, a native arm64 macOS 27 app target, shared system-extension targets, and no Catalyst or older-OS destinations
- [X] T002 Create the shared Swift 6.4 package and module skeleton in `packages/apple/Package.swift` and `packages/apple/Sources/ModuleManifest.swift`
- [X] T003 [P] Add checked-in non-secret Debug, TestFlight, bundle identifier, API-origin, callback, and feature-flag settings in `apps/apple/Config/Debug.xcconfig` and `apps/apple/Config/TestFlight.xcconfig`
- [X] T004 [P] Add iOS, iPadOS, macOS, App Group, notification, associated-domain, and Siri capabilities with least-privilege entitlements in `apps/apple/Entitlements/Naaseh-iOS.entitlements` and `apps/apple/Entitlements/Naaseh-macOS.entitlements`
- [X] T005 [P] Add the existing logo, semantic color tokens, app icons, launch assets, and accessible asset metadata in `apps/apple/SharedAssets.xcassets/Contents.json`
- [X] T006 [P] Create language-neutral Apple contract and cryptographic fixtures with provenance metadata in `packages/test-fixtures/fixtures/apple/manifest.json`
- [X] T007 Vendor the pinned Argon2 reference source, license, upstream commit, checksum, and update notes in `packages/apple/Sources/CArgon2/argon2.c`, `packages/apple/Sources/CArgon2/VENDORED.md`, and `packages/apple/THIRD_PARTY_NOTICES.md`
- [X] T008 [P] Add deterministic clocks, ID generators, mock transports, temporary stores, and fixture loaders in `packages/apple/Sources/NaasehTestSupport/TestSupport.swift`
- [X] T009 Add repeatable Swift test, unsigned iOS simulator build, arm64 Mac build, archive, and release-gate commands without changing required CI in `tools/run-apple-validation.sh` and `package.json`
- [X] T010 Document Xcode 27 setup, local configuration, signing boundaries, simulator/device builds, and troubleshooting in `docs/operations/apple-development.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared contracts, cryptography, persistence schema, networking, app shells, safe
errors, and compatibility controls that every user story requires.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

- [X] T011 [P] Add Swift decoding, invalid-boundary, and semantic re-encoding tests for every shared JSON fixture in `packages/apple/Tests/NaasehContractsTests/GoldenContractTests.swift`
- [X] T012 [P] Add TypeScript fixture validation and round-trip tests for the same Apple JSON cases in `packages/contracts/src/apple-fixtures.test.ts`
- [X] T013 [P] Add cross-language AES-GCM, HKDF, RSA-OAEP-SHA256, Argon2id, base64url, nonce, tag, and AAD vector tests in `packages/apple/Tests/NaasehCryptoTests/CryptoInteropTests.swift`
- [X] T014 Implement versioned `Codable` wire models, the closed API problem envelope (`type`, `title`, `status`, `code`, `message`, `correlationId`), lossless dates/times/decimals, and sync contract v4 envelopes in `packages/apple/Sources/NaasehContracts/WireContracts.swift`
- [X] T015 Implement AES-GCM/HKDF/SHA-256 primitives, RSA-OAEP recovery wrapping, Argon2id PIN derivation, secure buffers, and explicit protected-data exclusions in `packages/apple/Sources/NaasehCrypto/NaasehCrypto.swift`
- [X] T016 [P] Add SwiftData schema, account partitions, encrypted records, outbox rows, cursors, conflicts, migration journal, scenes, alerts, and compatibility models in `packages/apple/Sources/NaasehPersistence/Models/PersistenceModels.swift`
- [X] T017 Implement App Group `ModelContainer`, single storage actor, staged schema migration framework, protected file attributes, and fail-closed store opening in `packages/apple/Sources/NaasehPersistence/PersistenceController.swift`
- [X] T018 [P] Add tests for telemetry redaction, closed-schema encoding, the encrypted 100-event ring buffer, overflow, missing-key memory-only fallback, authenticated flushing, bounded retry, and no-recursion behavior in `packages/apple/Tests/NaasehServicesTests/NativeTelemetryTests.swift`
- [X] T019 Implement the production-host-locked ephemeral URLSession transport, cookie parsing hooks, origin/CSRF header policy, redirect rejection, retries, upload/download streaming, and response limits in `packages/apple/Sources/NaasehServices/APIClient.swift`
- [X] T020 [P] Add compatibility and telemetry endpoint contract tests for supported/expired/unavailable clients, authentication, Origin/CSRF, closed fields, 1-50 event batches, the 32 KiB limit, bounded metrics, and browser-unchanged behavior in `apps/api/test/client/native-compatibility.test.ts` and `apps/api/test/client/native-telemetry.test.ts`
- [X] T021 Implement the additive native compatibility endpoint and authenticated, schema-limited telemetry ingestion in the same handler in `apps/api/src/client/compatibility-handler.ts`, `apps/api/src/client/compatibility.ts`, and `apps/api/src/client/native-telemetry.ts`
- [X] T022 Wire both routes into the existing HTTP API/Lambda/log group and add assertions that no telemetry table, log group, or managed service is created in `infra/lib/api-stack.ts` and `infra/test/native-client-infrastructure.test.ts`
- [X] T023 [P] Create semantic SwiftUI styles, controls, loading/empty/error states, accessibility helpers, and platform-neutral status banners in `packages/apple/Sources/NaasehDesignSystem/NaasehDesignSystem.swift`
- [X] T024 Create the shared application dependency graph, session/store lifecycle states, scene router, and redacted restoration model in `packages/apple/Sources/NaasehFeatures/AppCore/AppCore.swift`
- [X] T025 [P] Create the iPhone `NavigationStack` shell and locked/signed-out/offline/migrating launch states after T024 in `apps/apple/iOSApp/Phone/PhoneRootView.swift`
- [X] T026 [P] Create the iPad adaptive `NavigationSplitView`, scene entry point, and compact-width fallback after T024 in `apps/apple/iOSApp/Pad/PadRootView.swift`
- [X] T027 [P] Create the native Mac `WindowGroup`, commands, menus, toolbar, sidebar, inspector, and locked launch state after T024 in `apps/apple/macOSApp/MacRootView.swift`
- [X] T028 Implement typed actionable errors, safe correlation IDs, schema-limited diagnostics, the separately encrypted 100-event telemetry ring buffer, and authenticated best-effort uploader in `packages/apple/Sources/NaasehServices/Diagnostics/NativeDiagnostics.swift` and `packages/apple/Sources/NaasehServices/Diagnostics/NativeTelemetryBuffer.swift`

**Checkpoint**: Both targets build; shared fixtures round-trip; crypto vectors match the web; local
configuration is safe; compatibility can fail closed; platform shells launch without production
credentials.

---

## Phase 3: User Story 1 - Securely Access the Same Work Everywhere (Priority: P1) 🎯 MVP

**Goal**: Sign in securely on every supported platform, retain only authorized encrypted data, work
offline, recover after termination, and converge with the web without silent loss.

**Independent Test**: Sign in on iPhone, iPad, and Mac; bootstrap an authorized account; go offline;
create and edit representative records; terminate and reopen; reconnect; and verify pending,
conflict, authorization-revocation, and web convergence behavior.

### Tests for User Story 1

- [X] T029 [P] [US1] Add native login, pre-auth, TFA, remembered-device, CSRF, expiry, redirect, and disabled-account contract tests in `packages/apple/Tests/NaasehServicesTests/AuthenticationServiceTests.swift`
- [X] T030 [P] [US1] Add Keychain access-control, non-synchronizing storage, biometric re-entry, missing-key, and secret-purge tests in `packages/apple/Tests/NaasehServicesTests/SecureAccountStoreTests.swift`
- [X] T031 [P] [US1] Add encrypted store atomicity, forced-termination migration, low-storage, corrupt-envelope, account-partition, and staged-rollback tests in `packages/apple/Tests/NaasehPersistenceTests/SecureStoreRecoveryTests.swift`
- [X] T032 [P] [US1] Add bootstrap, atomic outbox, duplicate replay, cursor atomicity, retry, conflict, revoked-access, and four-client fixture tests in `packages/apple/Tests/NaasehSyncTests/SyncEngineTests.swift`
- [X] T033 [P] [US1] Add API authorization-negative and native-header interoperability tests without changing browser behavior in `apps/api/test/sync/native-client-sync.test.ts`
- [X] T034 [P] [US1] Add iPhone/iPad/Mac XCUITest journeys for sign-in, lock, offline status, pending work, conflict resolution, and sign-out warnings in `apps/apple/UITests/AccessAndSyncUITests.swift`
- [X] T035 [P] [US1] Add Chromium/WebKit regression coverage for native-created records, contract compatibility, and web offline replay in `tests/e2e/native-sync-interop.spec.ts`

### Implementation for User Story 1

- [X] T036 [P] [US1] Implement non-synchronizing Keychain items, biometric/device-passcode access control, root-key derivation, session/pre-auth/trusted-device storage, and explicit zeroization in `packages/apple/Sources/NaasehServices/Security/SecureAccountStore.swift`
- [X] T037 [US1] Implement login, TFA enrollment/challenge, password reset/change, session validation, logout, trusted-device, and local-lock orchestration over the existing API in `packages/apple/Sources/NaasehServices/AuthenticationService.swift`
- [X] T038 [US1] Build AutoFill/password-manager-aware sign-in, TFA, recovery, local unlock, and actionable auth failure views after T037 in `packages/apple/Sources/NaasehFeatures/Authentication/AuthenticationViews.swift`
- [X] T039 [US1] Implement encrypted record transactions, atomic entity/outbox commits, cursor application, conflict persistence, account partitions, and store health state in `packages/apple/Sources/NaasehPersistence/SecureStore.swift`
- [X] T040 [US1] Implement bootstrap, sync v4 push/pull, deterministic batching, duplicate receipts, exponential backoff, manual refresh, connectivity restoration, and conflict resolution in `packages/apple/Sources/NaasehSync/SyncEngine.swift`
- [X] T041 [US1] Implement launch/foreground/manual compatibility and session validation, authenticated telemetry flushing, opportunistic background work, and no-background-correctness lifecycle coordination in `packages/apple/Sources/NaasehFeatures/AppCore/AppLifecycleCoordinator.swift`
- [X] T042 [US1] Build shared connectivity, freshness, pending-count, retry, rejected-operation, and conflict presentation after T040 in `packages/apple/Sources/NaasehFeatures/SyncStatus/SyncStatusViews.swift`
- [X] T043 [US1] Implement revoked-access cleanup, disabled-account lockout, sign-out/account-switch recovery-or-discard flow, alert/system-surface purge hooks, and next-account isolation in `packages/apple/Sources/NaasehFeatures/Authentication/AccountCleanupCoordinator.swift`
- [X] T044 [US1] Integrate authentication, secure-store unlock, bootstrap, sync, conflicts, and cleanup into all app composition roots in `apps/apple/iOSApp/NaasehIOSApp.swift` and `apps/apple/macOSApp/NaasehMacApp.swift`
- [X] T045 [US1] Add security, synchronization, migration, failure recovery, and local-data boundary documentation in `docs/architecture/native-apple-security-sync.md` and `docs/runbooks/native-store-recovery.md`

**Checkpoint**: User Story 1 is usable independently as the secure native foundation and MVP.

---

## Phase 4: User Story 2 - Manage Tasks with Full Product Parity (Priority: P1)

**Goal**: Deliver the complete task, subtask, memo, search, presentation, ranking, completion, undo,
restore, and archive workflow with consistent domain semantics on all platforms.

**Independent Test**: Create, inspect, edit, rank, search, filter, complete, undo, restore, and archive
representative public/group/locked/private/hidden-memo tasks offline and online on each platform,
then verify records, revisions, and completion events in the web app.

### Tests for User Story 2

- [X] T046 [P] [US2] Add Swift task/default/validation/hierarchy/privacy/revision/completion fixture parity tests in `packages/apple/Tests/NaasehFeaturesTests/TaskDomainParityTests.swift`
- [X] T047 [P] [US2] Add command tests for atomic create/edit/complete/undo/restore/archive, duplicate completion, and conflict recovery in `packages/apple/Tests/NaasehFeaturesTests/TaskCommandServiceTests.swift`
- [X] T048 [P] [US2] Add hidden-memo unlock/edit/relock, wrong-PIN, RSA recovery, background-lock, and interoperability tests in `packages/apple/Tests/NaasehCryptoTests/HiddenMemoInteropTests.swift`
- [X] T049 [P] [US2] Add 10,000-record authorized search/filter/rank correctness and one-second performance tests in `packages/apple/Tests/NaasehFeaturesTests/TaskSearchPerformanceTests.swift`
- [X] T050 [P] [US2] Add task-list/post-it/detail/editor/ranking/keyboard/accessibility XCUITests in `apps/apple/UITests/TaskParityUITests.swift`

### Implementation for User Story 2

- [X] T051 [P] [US2] Implement Swift task, revision, completion, privacy, due date, urgency, and memo domain adapters over wire models in `packages/apple/Sources/NaasehFeatures/Tasks/TaskModels.swift`
- [X] T052 [US2] Implement shared task command service with ordinary defaults, hierarchy-cycle checks, authorization preconditions, immutable revisions, completion idempotency, undo, restore, and archive in `packages/apple/Sources/NaasehFeatures/Tasks/TaskCommandService.swift`
- [X] T053 [P] [US2] Implement in-memory authorized search and filter indexes that never persist protected terms in `packages/apple/Sources/NaasehFeatures/Tasks/TaskSearchIndex.swift`
- [X] T054 [P] [US2] Implement hidden-memo key derivation, recovery, editing, relock, snapshot redaction, and memory-lifetime controls in `packages/apple/Sources/NaasehFeatures/Tasks/HiddenMemoService.swift`
- [X] T055 [P] [US2] Implement personal overall/project stack reads, touch/pointer reorder commands, and accessible move/direct-position alternatives in `packages/apple/Sources/NaasehFeatures/Ranking/RankingService.swift`
- [X] T056 [US2] Build shared task list, post-it, search/filter, detail, editor, subtask, archive, and conflict views after T052-T055 in `packages/apple/Sources/NaasehFeatures/Tasks/Views/TaskViews.swift`
- [X] T057 [P] [US2] Compose touch-first phone task navigation, keyboard-safe editors, menus, sheets, and completion feedback after T056 in `apps/apple/iOSApp/Phone/PhoneTaskScene.swift`
- [X] T058 [P] [US2] Compose multi-column iPad task browser/editor, keyboard shortcuts, pointer actions, and visible drag alternatives after T056 in `apps/apple/iOSApp/Pad/PadTaskScene.swift`
- [X] T059 [P] [US2] Compose desktop task windows, sidebar, inspector, menus, commands, contextual actions, and drag alternatives after T056 in `apps/apple/macOSApp/Tasks/MacTaskScene.swift`
- [X] T060 [US2] Implement optional completion sound, reduced-motion-safe feedback, and exactly-once completion presentation across platforms in `packages/apple/Sources/NaasehFeatures/Tasks/CompletionFeedback.swift`

**Checkpoint**: User Story 2 works independently over the US1 secure foundation and matches the web
task lifecycle.

---

## Phase 5: User Story 3 - Receive Native Alerts and Run the Task Timer (Priority: P1)

**Goal**: Deliver generic-by-default native reminders and synchronized timer controls through app,
lock-screen/tablet, and desktop surfaces without duplicate effects or protected-data leakage.

**Independent Test**: Opt in to alerts, change and cancel reminders, run repeated work/rest cycles,
terminate the app, rotate APNs tokens, act from system surfaces on two devices, and verify privacy,
deduplication, authorization, and canonical timer convergence.

### Tests for User Story 3

- [X] T061 [P] [US3] Add native registration, token rotation, ownership, CSRF, preview-policy, invalid-token, and unregister API tests in `apps/api/test/notifications/native-notifications.test.ts`
- [X] T062 [P] [US3] Add APNs JWT, topic/environment, generic/private preview, retry classification, occurrence deduplication, and payload-size tests in `apps/api/test/notifications/apns.test.ts`
- [X] T063 [P] [US3] Add CDK assertions proving reuse of the existing Lambda/table/schedule/secret/log group and no SNS/new managed service in `infra/test/native-notification-infrastructure.test.ts`
- [X] T064 [P] [US3] Add local/remote reminder reconciliation, permission states, stale action, privacy purge, and duplicate occurrence tests in `packages/apple/Tests/NaasehServicesTests/AlertCoordinatorTests.swift`
- [X] T065 [P] [US3] Add timer anchor, clock-change, background/termination, repeated action, conflict, local feedback, and one-second convergence tests in `packages/apple/Tests/NaasehFeaturesTests/TimerCoordinatorTests.swift`
- [X] T066 [P] [US3] Add physical-device notification/Live Activity/Mac status-item validation cases in `docs/testing/native-alert-timer-matrix.md`

### Implementation for User Story 3

- [X] T067 [US3] Extend the push registration model and API handler for native installations without regressing Web Push in `apps/api/src/notifications/handler.ts` and `packages/domain/src/reminder.ts`
- [X] T068 [P] [US3] Implement token-authenticated HTTP/2 APNs requests, JWT caching, bounded retries, invalid-token cleanup, topic checks, and redacted failures in `apps/api/src/notifications/apns.ts`
- [X] T069 [US3] Extend scheduled reminder delivery to recheck task authorization/privacy and fan out Web Push/APNs occurrence IDs in `apps/api/src/notifications/handler.ts`
- [X] T070 [US3] Add APNs configuration to the existing push secret and least-privilege notification Lambda environment/grants without new services in `infra/lib/notification-stack.ts` and `infra/lib/secrets-stack.ts`
- [X] T071 [P] [US3] Implement permission education, OS status mapping, token registration/rotation, device preview settings, and unregister behavior in `packages/apple/Sources/NaasehServices/Notifications/NativeNotificationService.swift`
- [X] T072 [US3] Implement offline local reminder scheduling, server occurrence reconciliation, cancellation, authorization recheck, generic content, and stale-action routing in `packages/apple/Sources/NaasehServices/Notifications/AlertCoordinator.swift`
- [X] T073 [P] [US3] Implement canonical timer derivation, server-time correction, pause/resume/reset/switch commands, local interval feedback, and conflict handling in `packages/apple/Sources/NaasehFeatures/Timer/TimerCoordinator.swift`
- [X] T074 [P] [US3] Build iPhone/iPad ActivityKit Live Activity views and App Intent controls with generic defaults after T073 in `apps/apple/SystemExtensions/TimerLiveActivity/TimerLiveActivity.swift`
- [X] T075 [P] [US3] Build native Mac timer window, menu commands, status item, accessible alternatives, and generic locked presentation after T073 in `apps/apple/macOSApp/Timer/MacTimerScene.swift`
- [X] T076 [US3] Add CloudWatch metrics/alarms for APNs status classes, invalid tokens, retry exhaustion, and bounded delivery outcomes in `infra/lib/observability-stack.ts` and `docs/runbooks/native-notification-delivery.md`

**Checkpoint**: User Story 3 independently proves alerts and timer behavior on native surfaces.

---

## Phase 6: User Story 4 - Create a Task with Siri AI (Priority: P1)

**Goal**: Create exactly one durable task through Na'aseh or GSD Siri AI requests with safe optional
project/date/time handling, ambiguity clarification, offline support, and authenticated continuation.

**Independent Test**: Invoke both names on every platform with complete, omitted-project, ambiguous,
unmatched, offline, locked, cancelled, unavailable-Siri, and repeated requests; verify one correct
task and outbox operation and eventual web convergence.

### Tests for User Story 4

- [X] T077 [P] [US4] Add project resolution, omitted-project, ambiguous-authorized-only, date/time/default, lock, offline, and duplicate invocation tests in `packages/apple/Tests/NaasehFeaturesTests/VoiceTaskServiceTests.swift`
- [X] T078 [P] [US4] Add App Intents Testing coverage for parameter summaries, dialog/result privacy, errors, continuation, and stable identifiers in `apps/apple/SystemExtensions/Tests/CreateTaskIntentTests.swift`
- [X] T079 [P] [US4] Add compilation/privacy assertions proving there are no task/project/content Spotlight donations in `apps/apple/SystemExtensions/Tests/IntentPrivacyTests.swift`
- [ ] T080 [P] [US4] Create the versioned `en-US` Siri corpus and execute 240 complete requests (80 per platform, balanced across Na'aseh/GSD, project omission/selection, date/time, and filler phrasing) plus 60 ambiguous requests (20 per platform), recording recognition, parse, clarification, commit, and duplicate results in `packages/test-fixtures/fixtures/apple/siri-en-US-v1.json` and `docs/testing/siri-ai-task-results.md`

### Implementation for User Story 4

- [X] T081 [P] [US4] Implement an in-process authorized active-project query and ambiguity-safe display representation in `packages/apple/Sources/NaasehFeatures/Voice/AuthorizedProjectQuery.swift`
- [X] T082 [US4] Implement voice task validation, ordinary defaults, invocation-to-mutation deduplication, atomic offline commit, and safe outcome service in `packages/apple/Sources/NaasehFeatures/Voice/VoiceTaskService.swift`
- [X] T083 [US4] Implement `CreateTaskIntent`, parameters, summaries, confirmation/error dialogs, and foreground continuation after T082 in `apps/apple/SystemExtensions/AppIntents/CreateTaskIntent.swift`
- [X] T084 [P] [US4] Register App Shortcut phrases and product-name invocation examples in `apps/apple/SystemExtensions/AppIntents/NaasehShortcutsProvider.swift`
- [X] T085 [P] [US4] Configure Na'aseh display naming and GSD alternate spoken app naming without registering legacy SiriKit in `apps/apple/Config/Info-iOS.plist` and `apps/apple/Config/Info-macOS.plist`
- [X] T086 [US4] Implement encrypted short-lived recognized-parameter continuation and authenticated scene routing in `packages/apple/Sources/NaasehFeatures/Voice/VoiceContinuationStore.swift`
- [X] T087 [P] [US4] Add discoverable Siri education, availability status, and ordinary-create fallback UI in `packages/apple/Sources/NaasehFeatures/Voice/SiriEducationView.swift`
- [X] T088 [US4] Integrate intent dependencies with the same storage, task command, session-lock, and cleanup actors used by the app in `apps/apple/SystemExtensions/AppIntents/IntentDependencies.swift`

**Checkpoint**: User Story 4 works without content donation and never confirms before durable commit.

---

## Phase 7: User Story 6 - Use the Private Journal and Crisis Plans Safely (Priority: P1)

**Goal**: Provide full owner journal and Crisis Plan parity while preserving ciphertext, recovery,
sharing, online-recipient, no-delete, and system-surface privacy boundaries.

**Independent Test**: Configure/unlock a journal, create and edit entries online/offline, inspect
dashboard analysis, trigger a plan without losing a draft, share/revoke recipient access, and prove
unauthorized users, admins, logs, Siri, alerts, previews, and offline recipient storage see no data.

### Tests for User Story 6

- [X] T089 [P] [US6] Add journal/Crisis Plan ciphertext, signing, key rotation, RSA recovery, Argon2 PIN, and web fixture compatibility tests in `packages/apple/Tests/NaasehCryptoTests/JournalCrisisPlanInteropTests.swift`
- [X] T090 [P] [US6] Add owner/recipient/admin authorization, plan-before-entry, no-delete, offline recipient denial, share/revoke, and draft-preservation tests in `packages/apple/Tests/NaasehFeaturesTests/JournalCrisisPlanServiceTests.swift`
- [X] T091 [P] [US6] Add dashboard metric, comparison, contributor, time-boundary, offline edit, and sync-conflict tests in `packages/apple/Tests/NaasehFeaturesTests/JournalDashboardTests.swift`
- [X] T092 [P] [US6] Add snapshot, background lock, system-surface exclusion, accessibility, and trigger-display XCUITests in `apps/apple/UITests/JournalCrisisPlanPrivacyUITests.swift`
- [X] T093 [P] [US6] Add API negative tests proving native headers do not widen journal, recovery, or Crisis Plan authorization in `apps/api/test/journal/native-journal-authorization.test.ts`

### Implementation for User Story 6

- [X] T094 [P] [US6] Implement byte-compatible journal/profile/entry/plan crypto, key lifecycle, unlock, recovery, and in-memory zeroization in `packages/apple/Sources/NaasehFeatures/Journal/JournalCryptoService.swift`
- [X] T095 [US6] Implement journal configuration, filtering, entries, rich-text fields, task reflections, section settings, no-delete enforcement, offline commands, and conflicts in `packages/apple/Sources/NaasehFeatures/Journal/JournalService.swift`
- [X] T096 [P] [US6] Implement dashboard projections, comparisons, positive-only periods, metrics, and contributor presentation from authorized decrypted data in `packages/apple/Sources/NaasehFeatures/Journal/JournalDashboardService.swift`
- [X] T097 [US6] Implement Crisis Plan create/update/trigger/share/view/revoke flows, owner/recipient boundaries, online-only recipient cache policy, and no clinical/emergency automation in `packages/apple/Sources/NaasehFeatures/CrisisPlan/CrisisPlanService.swift`
- [X] T098 [P] [US6] Build shared journal setup/unlock/browser/editor/dashboard and draft-preserving trigger presentation after T095-T097 in `packages/apple/Sources/NaasehFeatures/Journal/Views/JournalViews.swift`
- [X] T099 [P] [US6] Build shared owner and recipient Crisis Plan views with online-state and revocation handling after T095-T097 in `packages/apple/Sources/NaasehFeatures/CrisisPlan/Views/CrisisPlanViews.swift`
- [X] T100 [P] [US6] Compose privacy-safe iPhone/iPad journal and plan scenes with snapshot redaction and adaptive columns after T098-T099 in `apps/apple/iOSApp/Journal/JournalScene.swift`
- [X] T101 [P] [US6] Compose native Mac journal and plan windows, commands, inspectors, and locked restoration behavior after T098-T099 in `apps/apple/macOSApp/Journal/MacJournalScene.swift`
- [X] T102 [US6] Document journal/Crisis Plan data boundaries, recovery, recipient cleanup, and prohibited system integrations in `docs/security/native-journal-crisis-plan.md`

**Checkpoint**: User Story 6 independently satisfies the most sensitive native data boundary.

---

## Phase 8: User Story 5 - Use Lists, Organization, Files, and Reports (Priority: P2)

**Goal**: Complete all remaining non-administrative product parity for lists, reusable items,
groups, projects, archive, reports/exports, and attachments. Google Tasks is retired product-wide.

**Independent Test**: Complete one representative end-to-end workflow in each area on phone,
tablet, and Mac, including failures and offline boundaries, then confirm authorization and data
parity in the web app.

### Tests for User Story 5

- [X] T103 [P] [US5] Add list/global-item/value/order/visibility/copy/archive fixture and command parity tests in `packages/apple/Tests/NaasehFeaturesTests/ListParityTests.swift`
- [X] T104 [P] [US5] Add tests for browsing and selecting authorized existing projects/categories, task assignment/removal, reports, archive/workload warnings, user-owned deletion, and the absence/denial of native project/category create/edit/archive/restore/delete operations in `packages/apple/Tests/NaasehFeaturesTests/OrganizationParityTests.swift`
- [X] T105 [P] [US5] Add attachment type/size, encrypted upload, progress, retry, scan, preview, export, security-scope, cancellation, and temporary cleanup tests in `packages/apple/Tests/NaasehServicesTests/FileWorkflowTests.swift`
- [X] T106 [P] [US5] Add completed-report/export date boundary, filter, totals, integrity, expiry, and plaintext cleanup tests in `packages/apple/Tests/NaasehFeaturesTests/ReportExportTests.swift`
- [X] T107 [P] [US5] Remove Google Tasks OAuth, API, worker, domain, contract, UI, and native service tests after the integration was retired product-wide
- [X] T108 [P] [US5] Add representative lists/files/reports phone, tablet, and desktop XCUITest journeys in `apps/apple/UITests/ProductParityUITests.swift`
- [X] T109 [P] [US5] Add Chromium/WebKit regressions for shared API additions, native-produced list/report data, and absence of retired Google controls in `tests/e2e/native-product-parity.spec.ts`

### Implementation for User Story 5

- [X] T110 [P] [US5] Implement list, item, global-item, value/credit, override/reset, order, completion, copy, visibility, and archive services in `packages/apple/Sources/NaasehFeatures/Lists/ListService.swift`
- [X] T111 [P] [US5] Implement group workflows, authorized read models for existing projects/categories, task assignment/removal, workload/report reads, and user-owned work archive/restore/delete while exposing no project/category lifecycle mutations in `packages/apple/Sources/NaasehFeatures/Organization/OrganizationService.swift`
- [X] T112 [P] [US5] Implement document/photo/camera pickers, protected staging, encrypted streaming upload, scan state, retry, Quick Look, share, download, and deterministic cleanup in `packages/apple/Sources/NaasehServices/Files/FileWorkflowService.swift`
- [X] T113 [P] [US5] Implement completed-task reports, date/filter/totals logic, export request/monitor/integrity verification, save/share, and plaintext expiry in `packages/apple/Sources/NaasehFeatures/Reports/ReportExportService.swift`
- [X] T114 [P] [US5] Remove Google Tasks runtime resources, routes, secrets, scheduled work, observability, local cache on upgrade, and profile/task controls across the application
- [X] T115 [US5] Build shared Lists/global-items/groups/existing-project-and-category selection/archive/report/export feature views after T110-T113 in `packages/apple/Sources/NaasehFeatures/ProductParityViews/ProductParityViews.swift`
- [X] T116 [P] [US5] Compose iPhone list, organization, file, and report workflows with touch-safe pickers/sheets after T115 in `apps/apple/iOSApp/Phone/PhoneProductParityScene.swift`
- [X] T117 [P] [US5] Compose iPad multi-column list/organization/report flows, Files drag/drop, keyboard/pointer alternatives, and OAuth scene return after T115 in `apps/apple/iOSApp/Pad/PadProductParityScene.swift`
- [X] T118 [P] [US5] Compose Mac desktop list/organization/report windows, file panels, drag/drop warnings, menus, and OAuth return after T115 in `apps/apple/macOSApp/ProductParity/MacProductParityScene.swift`
- [X] T119 [US5] Document file/export plaintext boundaries, online-only operations, cleanup recovery, and the retired integration production cleanup in `docs/security/native-files-integrations.md`, `docs/runbooks/native-file-cleanup.md`, and `docs/operations/native-production-readiness.md`

**Checkpoint**: User Story 5 closes non-administrative feature parity beyond tasks and journal.

---

## Phase 9: User Story 7 - Work Naturally on Phone, Tablet, and Desktop (Priority: P2)

**Goal**: Make all completed workflows intentional and accessible on iPhone, iPad, and Mac across
input methods, window sizes, multiple scenes, restoration, and deep-link entry.

**Independent Test**: Run primary journeys with touch, keyboard, pointer/trackpad, Pencil,
large text, reduced motion, multiple windows, rotation, constrained widths, external
display, and deep links without losing drafts, selection, focus, or accessible alternatives.

### Tests for User Story 7

- [X] T120 [P] [US7] Add iPhone safe-area, keyboard, rotation, Dynamic Type, VoiceOver order, reduced-motion, and state-preservation XCUITests in `apps/apple/UITests/PhoneExperienceUITests.swift`
- [X] T121 [P] [US7] Add iPad split-view, compact fallback, multitasking resize, external display, multiple scene, keyboard, pointer, Pencil-alternative, and restoration XCUITests in `apps/apple/UITests/PadExperienceUITests.swift`
- [X] T122 [P] [US7] Add Mac resizable/multiple-window, menu, command, focus, pointer/context, drag-alternative, file, and restoration XCUITests in `apps/apple/UITests/MacExperienceUITests.swift`
- [X] T123 [P] [US7] Add route authorization, stale record, alert, Siri continuation, search, and external-file routing tests in `packages/apple/Tests/NaasehFeaturesTests/SceneRouterTests.swift`

### Implementation for User Story 7

- [X] T124 [P] [US7] Finish phone-wide safe-area, keyboard, compact navigation, modal, rich-text toolbar, status banner, and accessible action conventions in `apps/apple/iOSApp/Phone/PhoneExperience.swift`
- [X] T125 [P] [US7] Finish iPad adaptive two/three-column layouts, inspectors, popovers, multiwindow coordination, external-display behavior, keyboard/pointer/Pencil alternatives, and state restoration in `apps/apple/iOSApp/Pad/PadExperience.swift`
- [X] T126 [P] [US7] Finish Mac resizable windows, sidebar/content/inspector composition, menus, commands, toolbars, status surfaces, focus rings, file workflows, and restorable placement in `apps/apple/macOSApp/MacExperience.swift`
- [X] T127 [P] [US7] Implement shared accessible labels/values/traits/order, focus restoration, status announcements, target sizing, contrast, and non-color/non-motion meaning in `packages/apple/Sources/NaasehDesignSystem/Accessibility/AccessibilitySupport.swift`
- [X] T128 [US7] Implement authorized multi-scene routing and stale-target handling for links, alerts, Siri, search, files, and restoration in `packages/apple/Sources/NaasehFeatures/AppCore/SceneRouter.swift`
- [X] T129 [US7] Implement version-aware encrypted drafts, selections, filters, scroll anchors, scene restoration, and local multiwindow edit-conflict handling in `packages/apple/Sources/NaasehFeatures/AppCore/SceneStateStore.swift`
- [X] T130 [P] [US7] Add platform interaction and accessibility guidance for every feature module in `docs/user/native-apple-accessibility.md`
- [ ] T131 [US7] Validate 250 ms physical-hardware reflow, no obscured controls, and keyboard/alternative-control primary journeys and record evidence in `docs/testing/native-platform-experience-results.md`; manual VoiceOver execution is optional

**Checkpoint**: User Story 7 proves the app is native to each form factor rather than merely present.

---

## Phase 10: User Story 8 - Manage Personal Settings without Native Administration (Priority: P2)

**Goal**: Provide personal profile, reminder, sound, password, and multifactor settings while
keeping all administration, provisioning, and operator recovery interfaces out of native apps.

**Independent Test**: Change every personal setting on all platforms, exercise online-only failures,
credential/session revocation, and an administrator account, and verify no system-admin route or
mutation exists.

### Tests for User Story 8

- [X] T132 [P] [US8] Add profile preference, reminder/sound, password, TFA, remembered-device, session-revocation, and offline-denial tests in `packages/apple/Tests/NaasehFeaturesTests/ProfileSettingsTests.swift`
- [X] T133 [P] [US8] Add route/module/binary assertions proving admin, provisioning, category/project administration, and recovery-operator UI are absent in `packages/apple/Tests/NaasehFeaturesTests/NativeAdminExclusionTests.swift`
- [X] T134 [P] [US8] Add personal-settings, AutoFill, one-time-code, validation, offline error, and accessibility XCUITests in `apps/apple/UITests/ProfileSettingsUITests.swift`
- [X] T135 [P] [US8] Add API negative tests confirming administrator sessions receive no native-only protected-data or admin capability expansion in `apps/api/test/auth/native-admin-boundary.test.ts`

### Implementation for User Story 8

- [X] T136 [P] [US8] Implement personal profile, device-scoped alert/sound, Google status, credential, TFA, remembered-device, and session settings services in `packages/apple/Sources/NaasehFeatures/Profile/ProfileService.swift`
- [X] T137 [US8] Enforce explicit online-only execution and actionable unsaved/no-change messaging for security and integration settings in `packages/apple/Sources/NaasehFeatures/Profile/OnlineSettingsCoordinator.swift`
- [X] T138 [US8] Build shared personal profile/security/integration settings views with Password AutoFill and one-time-code semantics after T136-T137 in `packages/apple/Sources/NaasehFeatures/Profile/Views/ProfileViews.swift`
- [X] T139 [P] [US8] Compose touch/tablet profile settings and platform permission links after T138 in `apps/apple/iOSApp/Profile/ProfileScene.swift`
- [X] T140 [P] [US8] Compose desktop profile settings, menus, and system-setting links after T138 in `apps/apple/macOSApp/Profile/MacProfileScene.swift`
- [X] T141 [US8] Document the native/web administrative boundary and supported self-service operations in `docs/user/native-profile-and-admin-boundary.md`

**Checkpoint**: User Story 8 provides self-service account controls with a demonstrably absent admin UI.

---

## Phase 11: User Story 9 - Install and Evaluate Complete TestFlight Builds (Priority: P2)

**Goal**: Produce gated, upgrade-safe iPhone/iPad and Mac TestFlight builds that use existing
production AWS, begin with the smoke account, collect safe feedback, and can be expired safely.

**Independent Test**: Install clean and upgrade builds on supported phone/tablet/Mac hardware,
preserve cached/pending work, run the complete smoke matrix, submit safe feedback, expire an unsafe
build, and verify compatibility controls prevent data corruption.

### Tests for User Story 9

- [X] T142 [P] [US9] Add release-configuration tests that require production origin and reject embedded secrets, debug endpoints, unsupported targets, Intel, and Catalyst in `apps/apple/BuildTests/ReleaseConfigurationTests.swift`
- [X] T143 [P] [US9] Add clean-install/upgrade/forced-termination/low-storage/missing-key/beta-expiry compatibility test plans and automation hooks in `apps/apple/UITests/TestFlightUpgradeUITests.swift`
- [X] T144 [P] [US9] Add server minimum-build, supported-contract-window, read-only preservation, outage, and unsafe-build expiry tests in `apps/api/test/client/native-release-compatibility.test.ts`
- [X] T145 [P] [US9] Add App Store archive/export/signing/entitlement/privacy-manifest validation script tests in `scripts/tests/test_validate_apple_archive.py`

### Implementation for User Story 9

- [X] T146 [P] [US9] Finalize version/build settings, privacy manifests, export-compliance declarations, app metadata templates, and non-sensitive screenshots fixtures in `apps/apple/Distribution/DistributionManifest.json`
- [X] T147 [P] [US9] Add deterministic iPhone/iPad and Mac archive/export validation without committed credentials in `scripts/validate_apple_archive.py`
- [X] T148 [US9] Implement client upgrade-required, beta-expired, temporary-outage, ordinary-offline, and unsupported-hardware/Siri states while preserving encrypted pending work in `packages/apple/Sources/NaasehFeatures/AppCore/CompatibilityCoordinator.swift`
- [ ] T149 [P] [US9] Configure the App Store Connect universal iPhone/iPad and native Mac records, bundle IDs, internal smoke group restricted to the dedicated smoke-account procedure, APNs environments, export compliance, feedback, and stop-testing controls, and capture non-secret configuration evidence in `docs/operations/apple-testflight.md`
- [X] T150 [P] [US9] Document clean install, upgrade, migration interruption, rollback, minimum-build, pending-work recovery, and beta-expiry runbooks in `docs/runbooks/apple-testflight-rollback.md`
- [X] T151 [P] [US9] Add a protected-content-safe TestFlight feedback screen and diagnostics export in `packages/apple/Sources/NaasehFeatures/Feedback/FeedbackView.swift`
- [X] T152 [US9] Create the signed smoke-account release evidence template covering every primary journey and CloudWatch/privacy/cost checks in `docs/testing/apple-testflight-smoke-template.md`
- [ ] T153 [US9] Archive, sign, validate, and upload the universal iPhone/iPad and native Mac builds; wait for TestFlight processing; assign only the internal smoke group; execute the smoke-account gate; and record build/source/upload/result evidence in `docs/testing/apple-testflight-smoke-results.md`

**Checkpoint**: User Story 9 is complete only after both TestFlight builds pass the production smoke gate.

---

## Phase 12: Polish & Cross-Cutting Quality Gates

**Purpose**: Validate complete-product performance, security, durability, browser interoperability,
cost, observability, documentation, and final review without weakening the required validation
runtime policy.

- [X] T154 [P] Add end-to-end 10,000-record warm launch, local mutation, search, Siri commit, and layout reflow benchmarks in `packages/apple/Tests/NaasehPerformanceTests/NativePerformanceTests.swift`
- [X] T155 [P] Add complete cross-language contract/crypto drift detection across Swift, TypeScript, Chromium, and WebKit in `tools/validate-apple-contract-interop.mjs`
- [X] T156 [P] Add exhaustive local native release-gate orchestration for device/window/accessibility/Siri/notification/failure matrices in `tools/run-apple-release-gates.sh`
- [X] T157 Run the four-client web/iPhone/iPad/Mac concurrency, offline replay, conflict, and revocation suite plus a deterministic 1,000-operation exactly-once workload replayed two to five times (200 voice, 200 alert, 200 sync, 150 completion, 150 timer, and 100 sharing IDs), requiring zero duplicate durable effects, and record evidence in `docs/testing/native-four-client-results.md`
- [X] T158 Run security and privacy inspection for local files, Keychain policy, snapshots, logs, crash reports, APNs payloads, Siri output, URLs, clipboard, temp files, and donations and record findings in `docs/reviews/native-apple-security-review.md`
- [X] T159 Run forced-termination, migration, low-storage, missing-key, corrupt-store, sign-out-pending, backup/restore, and recovery review and record findings in `docs/reviews/native-apple-data-durability-review.md`
- [X] T160 Validate authenticated native telemetry ingestion, client ring-buffer encryption/overflow/retry, existing CloudWatch log-group retention and cost, bounded dimensions, alarms, protected-data exclusions, and notification/sync/client-failure reconstruction in `docs/reviews/native-apple-observability-review.md`
- [X] T161 Validate current-scale and 1,000-user API, Lambda, DynamoDB, Scheduler, transfer, Secrets Manager, and CloudWatch cost assumptions and no-new-service architecture in `docs/reviews/native-apple-aws-cost-review.md`
- [X] T162 Run current Chrome and Safari/WebKit shared-contract, online/offline, and native-created-data regression suites and record results in `docs/testing/native-web-interoperability-results.md`
- [X] T163 Measure and record the existing required test count and `/usr/bin/time -p npm run test:e2e:quick` baseline before any required-validation edit in `docs/testing/native-required-validation-runtime.md`
- [X] T164 Select the smallest representative Swift test/build smoke slice, record its test count and local duration, and document why exhaustive matrices remain release-only in `docs/testing/native-required-validation-runtime.md`
- [X] T165 Update `.github/workflows/validate.yml` and `package.json` only if the measured combined expected hosted duration remains at or below ten minutes
- [X] T166 Confirm the resulting hosted PR check duration and append the run URL, total time, before/after counts, and headroom to `docs/testing/native-required-validation-runtime.md`
- [X] T167 [P] Update the architecture overview, user guide index, operations index, security index, and testing index for native apps in `docs/architecture/overview.md`, `docs/user/README.md`, `docs/operations/README.md`, `docs/security/README.md`, and `docs/testing/README.md`
- [X] T168 Validate every Native row and explicit Web-only exclusion in `specs/012-native-apple-apps/parity-matrix.md`, validate all measurable success criteria SC-001 through SC-015, and record pass/fail evidence and unresolved blockers in `docs/testing/native-apple-success-criteria.md`
- [X] T169 Re-review the final diff for correctness, unnecessary complexity, security, data durability, recovery, logging, tests, comments, platform support, browser compatibility, AWS cost, and documentation in `docs/reviews/native-apple-final-diff-review.md`
- [X] T170 Execute every applicable scenario in `specs/012-native-apple-apps/quickstart.md` and record the final verified commands and outcomes in `docs/testing/native-apple-quickstart-results.md`
- [X] T171 Retire Google Tasks synchronization across web, API, AWS infrastructure, domain/contracts, native clients, tests, documentation, and browser local-cache migration
- [X] T172 Replace SVG app-icon slots with a complete PNG set generated from the existing Na'aseh logo for iOS/iPadOS and macOS
- [X] T173 Preserve VoiceOver-ready semantics and accessible alternatives while making manual VoiceOver execution optional for the first TestFlight release
- [X] T174 Add current Apple Developer enrollment, App Store Connect, existing-production deployment confirmation, and managed APNs secret/key procedures in `docs/operations/apple-account-setup.md`, `docs/operations/native-production-readiness.md`, and `docs/runbooks/native-notification-delivery.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **US1 (Phase 3)**: Depends on Foundational and provides authentication, secure storage, and sync
  required by all other stories.
- **US2 (Phase 4)**: Depends on US1 and supplies the task command path reused by Siri and alerts.
- **US3 (Phase 5)**: Depends on US1 and US2 for authorized reminder/task/timer state.
- **US4 (Phase 6)**: Depends on US1 and US2 for secure local task creation.
- **US6 (Phase 7)**: Depends on US1; it may proceed in parallel with US2-US4 after US1, but must
  preserve shared crypto and routing contracts.
- **US5 (Phase 8)**: Depends on US1; task-linked reports/files also integrate with US2.
- **US7 (Phase 9)**: Depends on the product workflows being adapted (US2-US6) and completes their
  cross-form-factor presentation.
- **US8 (Phase 10)**: Depends on US1 and notification settings from US3.
- **US9 (Phase 11)**: Depends on all stories intended for the first full-parity TestFlight build.
- **Polish (Phase 12)**: Depends on the complete release scope.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 Secure Access/Sync
                         ├──> US2 Tasks ──┬──> US3 Alerts/Timer
                         │               ├──> US4 Siri
                         │               └──> US5 Product Parity
                         ├──> US6 Journal/Crisis Plan
                         └──> US5 Product Parity

US2 + US3 + US4 + US5 + US6 -> US7 Platform Experience
US1 + US3 + US5             -> US8 Personal Settings
US1-US8                     -> US9 TestFlight -> Polish/Release Gates
```

### Within Each User Story

- Write the listed tests first and confirm they fail for the missing behavior.
- Implement models/crypto/storage before services, services before views/system surfaces, and shared
  behavior before target composition.
- Persist state before reporting success; verify failure, termination, retry, and recovery paths.
- Recheck authorization before presenting or mutating from links, Siri, alerts, or restored scenes.
- Complete the independent test and checkpoint before considering the story done.

## Parallel Opportunities

- Setup tasks T003-T006 and T008 can run in parallel after the workspace/package skeleton exists.
- Foundational contract, crypto, persistence-model, telemetry tests, design-system, and platform-shell
  files can be developed in parallel only after their named prerequisites, then integrate through
  T017-T028.
- After US1, US6 can proceed in parallel with US2; US3 and US4 can proceed in parallel after US2.
- Within US5, Lists, Organization, Files, and Reports are separate parallel streams.
- Phone, iPad, and Mac composition tasks are parallel once the shared-view prerequisite named in
  each task is complete.
- Test tasks marked [P] should be written together before their associated implementations.

## Parallel Examples

### User Story 1

```text
T029 Authentication contract tests
T030 Keychain/biometric tests
T031 Store migration/recovery tests
T032 Sync durability tests
T033 API authorization tests
T034 Native UI journeys
T035 Browser interoperability
```

### User Story 3

```text
T061 Registration API tests
T062 APNs provider tests
T063 Infrastructure assertions
T064 Client alert tests
T065 Timer tests
T066 Physical-device matrix
```

### User Story 5

```text
T110 Lists module
T111 Organization module
T112 Files module
T113 Reports/exports module
T114 Retired integration removal
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 secure access/offline sync.
3. Stop and independently validate US1 on iPhone, iPad, Mac, and web.
4. This is a technical MVP proving that production data can be handled safely; it is not yet the
   requested full-parity TestFlight release.

### P1 Native Product Increment

1. Add US2 task parity.
2. Add US3 alerts/timer and US4 Siri after the shared task command path is stable.
3. Add US6 journal/Crisis Plan security in parallel where practical.
4. Stop and validate all P1 journeys, especially privacy, offline durability, and duplicate effects.

### Complete First TestFlight Release

1. Add US5 remaining product parity.
2. Complete US7 platform-wide adaptation and US8 personal settings/admin exclusion.
3. Complete US9 release controls and smoke-account TestFlight gate.
4. Run Phase 12 quality gates; do not promote on a failed security, durability, compatibility,
   validation-runtime, or migration result.

## Notes

- `[P]` means separate files and no dependency on an unfinished task in that phase.
- User-story labels preserve the numbering from `spec.md`; US6 intentionally precedes US5 because
  it is P1.
- No task creates a staging AWS environment, SNS mobile push, always-on provider, or other new paid
  service.
- Before T165, T163 and T164 are mandatory; required validation cannot be expanded without measured
  before/after counts and runtime.
- Commit after each task or coherent tested group, and keep protected values out of commits,
  fixtures, logs, screenshots, and review artifacts.
