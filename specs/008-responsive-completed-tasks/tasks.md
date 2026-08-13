# Tasks: Responsive Completed Tasks Experience

**Input**: Design documents from `/specs/008-responsive-completed-tasks/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md),
[quickstart.md](quickstart.md)

**Tests**: Automated tests are required by the project constitution. Tests in each story phase must
be written first and observed failing for the intended reason before implementation begins.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as
an independent increment. No API, database, synchronization-schema, or AWS infrastructure task is
included because the approved design keeps those contracts unchanged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it uses different files and has no incomplete dependency
- **[Story]**: Maps the task to US1, US2, US3, or US4 from [spec.md](spec.md)
- Every task names the exact file or files it changes

## Phase 1: Setup (Shared Evidence and Test Infrastructure)

**Purpose**: Establish the auditable page/state inventory and reusable responsive assertions before
changing product behavior.

- [X] T001 [P] Create the FR-009 page/state/viewport audit matrix with owners and required evidence in specs/008-responsive-completed-tasks/responsive-audit.md
- [X] T002 [P] Add reusable Playwright assertions for document overflow, container containment, unintended rectangle intersections, 44×44 targets, focus clipping, and safe-area reachability in tests/e2e/responsive-assertions.ts
- [X] T003 [P] Record baseline failing reproductions for the three supplied screenshots, current focused command results, and the pre-existing dirty-worktree boundary in specs/008-responsive-completed-tasks/validation.md

---

## Phase 2: Foundational (Blocking Shared Layout Rules)

**Purpose**: Provide common layout and test foundations required by every story.

**⚠️ CRITICAL**: Complete this phase before beginning any user-story implementation.

- [X] T004 [P] Add shared control-size, field-gap, content-width, dynamic-viewport, and single-application safe-area tokens in apps/web/src/styles/tokens.css and apps/web/src/styles/global.css
- [X] T005 Normalize shared button/input/select/textarea sizing, `min-width: 0`, overflow wrapping, focus-visible treatment, disabled-state treatment, and bounded main-content behavior without blanket full-width desktop buttons in apps/web/src/styles/app.css
- [X] T006 [P] Extend signed-in setup and navigation helpers for deterministic report, stack, dialog, long-content, offline, and pending-state journeys in tests/e2e/enhanced-helpers.ts

**Checkpoint**: Shared tokens, control rules, geometry assertions, and audit inventory are ready; all
four user-story phases may now begin.

---

## Phase 3: User Story 1 — Focus the Completed Tasks Report on Meaningful Activity (Priority: P1) 🎯 MVP

**Goal**: Rename the report to Completed Tasks, hide nonpositive daily/weekly/monthly periods in every
source/sync state, and show accurate empty or invalid states without changing raw reports, totals,
exports, routes, or synchronization.

**Independent Test**: Open `/dashboard` with mixed, all-zero, filtered-empty, invalid, pending,
offline, stale, local, network, and encrypted-cache reports; verify the Completed Tasks terminology,
positive-only ordered chart, unchanged totals/details/export, independent status, and recovery paths.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Add failing pure-selector tests for mixed, all-zero, zero-to-positive, positive-to-zero, duplicate, negative, non-integer, non-finite, daily, weekly, monthly, order, and unchanged-input cases in apps/web/test/features/completion-presentation.test.ts
- [X] T008 [P] [US1] Add failing component tests for local and remote positive-only charts, filtered/unfiltered empty copy, invalid recovery, unchanged totals/detail rows, and concurrent pending/offline/stale status in apps/web/test/features/urgency-reporting.test.tsx
- [ ] T009 [P] [US1] Add failing Chromium/WebKit journeys for Completed Tasks naming, stable `/dashboard`, mixed/all-zero periods, pending sync, warmed-cache offline behavior, and retry/restart states in tests/e2e/completion-dashboard.spec.ts and tests/e2e/urgency-reporting.spec.ts
- [X] T010 [P] [US1] Strengthen the regression contract proving server aggregates remain zero-filled, nonnegative, total-consistent, and unchanged by the UI projection in tests/contract/completion-reporting.contract.test.ts

### Implementation for User Story 1

- [X] T011 [US1] Implement the non-mutating `ready`/`empty`/`invalid` Completion Chart Projection with stable positive-period ordering and safe validation in apps/web/src/features/reports/completion-presentation.ts
- [X] T012 [US1] Apply the projection after local/network/cache source selection, render filtered/range empty states, preserve independent sync/freshness/error blocks, and rename page-identifying copy in apps/web/src/features/reports/CompletionDashboard.tsx
- [X] T013 [P] [US1] Rename the main navigation control to Completed Tasks while preserving the `dashboard` section and `/dashboard` route in apps/web/src/app/App.tsx and apps/web/src/app/router.tsx
- [X] T014 [P] [US1] Update user-facing completion-report terminology without renaming operational CloudWatch dashboards in docs/user/archive-project-reporting.md and docs/user/urgency-stack-ranking.md
- [X] T015 [US1] Run the US1 unit, component, contract, Chromium, WebKit, iPhone, and iPad scenarios and record raw-contract, route, offline, export, and status evidence in specs/008-responsive-completed-tasks/validation.md

**Checkpoint**: User Story 1 is independently deployable as the MVP; raw API/cache/export/sync
contracts remain unchanged.

---

## Phase 4: User Story 2 — Use Every Existing Workflow on a Phone (Priority: P1)

**Goal**: Make every current workflow usable at 320, 375, and 390 CSS-pixel phone widths, including
the exact stack-button geometry, single-column standard fields, safe areas, browser chrome, dynamic
states, and long content shown by the supplied screenshots.

**Independent Test**: Complete each FR-009 primary journey and supported loading/empty/validation/
offline/pending/conflict/error state in phone portrait and representative landscape; verify no page
overflow, overlap, clipping, hidden action, accidental state loss, or undersized target.

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Add failing table-driven 320/375/390 portrait and landscape geometry tests for phone forms, filters, headers, cards, status blocks, long content, and resize value preservation in tests/e2e/responsive-layout.spec.ts
- [X] T017 [P] [US2] Add failing component-contract tests for stack control DOM order, class hooks, first/middle/last/only disabled states, editor containment, and focus-return attributes in apps/web/test/features/stack-components.test.tsx
- [X] T018 [P] [US2] Add failing phone touch/keyboard tests for the equal Move up/Move down row, full-width Move to position row, editor reachability, offline pending state, conflict recovery, and 44×44 targets in tests/e2e/personal-stack.spec.ts
- [X] T019 [P] [US2] Add failing phone safe-area, native/custom dialog, task-detail, on-screen-keyboard, browser-toolbar, and bottom-action reachability tests in tests/e2e/responsive-dialogs.spec.ts

### Implementation for User Story 2

- [X] T020 [P] [US2] Add stable stack action/editor layout hooks without changing move semantics or focus behavior in apps/web/src/features/stacks/StackMoveControls.tsx and apps/web/src/features/stacks/StackRow.tsx
- [X] T021 [US2] Implement the two-column phone stack grid, equal directional controls, spanning position action/editor, gaps, containment, and disabled styling in apps/web/src/styles/app.css
- [X] T022 [US2] Replace permissive 120px mobile filter squeezing with one-column standard labeled fields at 480px and below while retaining wrapping compact priority controls in apps/web/src/styles/app.css
- [X] T023 [US2] Make root scrolling, sticky header, fixed task detail, native/custom dialogs, menus, and trailing action space use dynamic viewport and safe-area tokens exactly once in apps/web/src/styles/global.css and apps/web/src/styles/app.css
- [X] T024 [US2] Make the longer Completed Tasks item and every header status/control reachable in collapsed local navigation without document overflow in apps/web/src/app/App.tsx and apps/web/src/styles/app.css
- [ ] T025 [US2] Audit and fix phone field/action/card containment for tasks, search, archive, projects, reports, and stacks in apps/web/src/features/tasks/TaskForm.tsx, apps/web/src/features/tasks/TaskListPage.tsx, apps/web/src/features/search/TaskFilters.tsx, apps/web/src/features/archive/ArchivePage.tsx, apps/web/src/features/projects/ProjectTree.tsx, apps/web/src/features/reports/CompletionFilters.tsx, apps/web/src/features/stacks/PersonalStackPage.tsx, and apps/web/src/styles/app.css
- [ ] T026 [US2] Audit and fix phone field/action/dialog containment for lists, groups, Google sync, administration, reminders/settings, attachments, and hidden memos in apps/web/src/features/lists/ListPage.tsx, apps/web/src/features/lists/ListForm.tsx, apps/web/src/features/lists/GlobalDirectory.tsx, apps/web/src/features/groups/GroupPage.tsx, apps/web/src/features/groups/CreateGroupDialog.tsx, apps/web/src/features/groups/JoinGroupDialog.tsx, apps/web/src/features/google-sync/GoogleSyncPage.tsx, apps/web/src/features/admin/UsersAdminPage.tsx, apps/web/src/features/admin/CategoriesAdminPage.tsx, apps/web/src/features/reminders/ReminderSettings.tsx, apps/web/src/features/attachments/AttachmentPanel.tsx, apps/web/src/features/memos/HiddenMemoEditor.tsx, and apps/web/src/styles/app.css
- [X] T027 [US2] Add targeted wrapping/truncation/full-value and dynamic-status reflow fixes for long task/list/project/user/URL/amount text, sync banners, conflicts, validation, attachments, and update prompts in apps/web/src/styles/app.css and apps/web/src/app/UpdatePrompt.tsx
- [ ] T028 [US2] Run the phone Chromium/WebKit/iPhone matrix, attach pass/fail evidence for every FR-009 mobile row, and close all phone findings in specs/008-responsive-completed-tasks/responsive-audit.md and specs/008-responsive-completed-tasks/validation.md

**Checkpoint**: User Story 2 is independently usable on supported phones, including the three
supplied reproduction cases.

---

## Phase 5: User Story 3 — Use Cohesive, Efficient Layouts on Desktop and Tablet (Priority: P2)

**Goal**: Arrange the same workflows into bounded, intentional tablet/desktop grids and action groups
without excessive stretching, disconnected controls, unexplained gaps, or capability loss.

**Independent Test**: Review every current area at 768, 1024, 1280, and 1440 CSS pixels and across
layout-boundary resize; verify aligned compatible fields, bounded readable content, coherent action
order, and preservation of every control and entered state.

### Tests for User Story 3 ⚠️

- [X] T029 [P] [US3] Add failing table-driven 768/1024/1280/1440 geometry tests for bounded content, intentional field columns, compatible control heights, coherent action groups, and breakpoint state preservation in tests/e2e/responsive-desktop.spec.ts
- [X] T030 [P] [US3] Add failing component markup tests for reusable field-grid, action-group, card, dialog, and content-width class contracts in apps/web/test/features/responsive-layout.test.tsx

### Implementation for User Story 3

- [X] T031 [US3] Implement bounded desktop content widths, auto-fit grids using `minmax(0, 1fr)`, compatible field sizing, and non-stretching action groups in apps/web/src/styles/app.css
- [X] T032 [US3] Align desktop/tablet header, navigation, welcome sections, dialogs, fixed details, and global status/actions without changing DOM order in apps/web/src/app/App.tsx and apps/web/src/styles/app.css
- [ ] T033 [US3] Apply intentional desktop/tablet grids and bounded actions to task, search, archive, project, report, and stack surfaces in apps/web/src/features/tasks/TaskForm.tsx, apps/web/src/features/search/TaskFilters.tsx, apps/web/src/features/archive/ArchivePage.tsx, apps/web/src/features/projects/ProjectTree.tsx, apps/web/src/features/reports/CompletionFilters.tsx, apps/web/src/features/stacks/PersonalStackPage.tsx, and apps/web/src/styles/app.css
- [ ] T034 [US3] Apply intentional desktop/tablet grids and bounded actions to list, group, Google, admin, reminder/settings, attachment, and memo surfaces in apps/web/src/features/lists/ListPage.tsx, apps/web/src/features/groups/GroupPage.tsx, apps/web/src/features/google-sync/GoogleSyncPage.tsx, apps/web/src/features/admin/UsersAdminPage.tsx, apps/web/src/features/admin/CategoriesAdminPage.tsx, apps/web/src/features/reminders/ReminderSettings.tsx, apps/web/src/features/attachments/AttachmentPanel.tsx, apps/web/src/features/memos/HiddenMemoEditor.tsx, and apps/web/src/styles/app.css
- [ ] T035 [US3] Verify no desktop rule hides a capability or changes entered data/focus across 480px and 900px boundaries, and fix affected presentation in apps/web/src/app/App.tsx, apps/web/src/features/tasks/TaskForm.tsx, apps/web/src/features/search/TaskFilters.tsx, apps/web/src/features/reports/CompletionFilters.tsx, apps/web/src/features/stacks/PersonalStackPage.tsx, apps/web/src/features/lists/ListPage.tsx, apps/web/src/features/groups/GroupPage.tsx, and apps/web/src/styles/app.css
- [ ] T036 [US3] Run the tablet/desktop Chromium/WebKit matrix, attach pass/fail evidence for every FR-009 wide-layout row, and close all desktop findings in specs/008-responsive-completed-tasks/responsive-audit.md and specs/008-responsive-completed-tasks/validation.md

**Checkpoint**: User Story 3 is independently usable on supported tablet and desktop widths and
retains every workflow from the mobile presentation.

---

## Phase 6: User Story 4 — Navigate and Operate Responsive Controls Accessibly (Priority: P2)

**Goal**: Ensure every revised layout remains understandable and operable by keyboard, touch,
screen reader, switch control, 200% text zoom, and reduced-motion users with logical order, visible
focus, adequate targets, and correctly associated messages.

**Independent Test**: Traverse every revised navigation, form, filter, dialog, list action, and report
with keyboard and screen-reader semantics, then repeat primary actions with touch at mobile sizes;
verify order, labels/messages, focus, targets, state changes, zoom, and authorization-safe names.

### Tests for User Story 4 ⚠️

- [X] T037 [P] [US4] Add failing axe and semantic tests across representative sign-in, tasks, stack, Completed Tasks, lists, groups, archive, projects, Google, admin, settings, and dialog states in tests/e2e/responsive-accessibility.spec.ts
- [X] T038 [P] [US4] Add failing keyboard focus-order, focus-visible clipping, resize/orientation state retention, long-label, reduced-motion, and 200% text-zoom tests in tests/e2e/responsive-state.spec.ts
- [X] T039 [P] [US4] Add failing touch-target and non-color state assertions for navigation, checkbox/radio/chip, disclosure, pagination, icon, row-action, primary, quiet, disabled, pending, and destructive controls in tests/e2e/responsive-targets.spec.ts

### Implementation for User Story 4

- [X] T040 [US4] Complete shared focus-visible coverage for buttons, links, inputs, selects, textareas, summaries, and custom controls plus non-color disabled/selected/pending/destructive states in apps/web/src/styles/app.css and apps/web/src/styles/global.css
- [ ] T041 [US4] Correct audited label/help/error/status associations and authorization-safe names in apps/web/src/components/AssigneePicker.tsx, apps/web/src/components/CategoryPicker.tsx, apps/web/src/components/PriorityFilter.tsx, apps/web/src/components/UrgencyField.tsx, apps/web/src/features/auth/Login.tsx, apps/web/src/features/tasks/TaskForm.tsx, apps/web/src/features/search/TaskFilters.tsx, apps/web/src/features/reports/CompletionFilters.tsx, apps/web/src/features/admin/UsersAdminPage.tsx, apps/web/src/features/groups/CreateGroupDialog.tsx, apps/web/src/features/groups/JoinGroupDialog.tsx, and apps/web/src/app/App.tsx
- [X] T042 [US4] Preserve logical DOM/focus order and focused-element context through responsive reflow without JavaScript viewport state in apps/web/src/app/App.tsx, apps/web/src/features/stacks/StackMoveControls.tsx, apps/web/src/features/search/TaskFilters.tsx, and apps/web/src/features/reports/CompletionFilters.tsx
- [X] T043 [P] [US4] Extend existing accessibility regressions for navigation and completion/priority interactions in tests/e2e/post-it-accessibility.spec.ts and tests/e2e/urgency.spec.ts
- [ ] T044 [US4] Run axe, keyboard, touch, 200% zoom, reduced-motion, iPhone/iPad, and native Safari Technology Preview checks and close every accessibility row in specs/008-responsive-completed-tasks/responsive-audit.md and specs/008-responsive-completed-tasks/validation.md

**Checkpoint**: User Story 4 independently satisfies the UI contract for keyboard, touch, assistive
technology, zoom, motion, and authorization-safe responsive presentation.

---

## Phase 7: Polish & Cross-Cutting Quality Gates

**Purpose**: Prove performance, unchanged system boundaries, complete documentation, and final
constitution compliance across all delivered stories.

- [X] T045 [P] Add deterministic 366-period projection and 200ms browser-reflow performance coverage with environment/fixture assertions in tests/performance/responsive-completed-tasks.test.ts and tests/e2e/responsive-state.spec.ts
- [X] T046 [P] Reconcile implemented commands, copy, and evidence expectations with the validation guide in specs/008-responsive-completed-tasks/quickstart.md and update general setup only if behavior changed in README.md
- [X] T047 Run focused unit, component, contract, security, offline, restore, performance, Chromium, WebKit, iPhone, and iPad suites and record exact commands/results in specs/008-responsive-completed-tasks/validation.md
- [X] T048 Run `npm run validate`, `npm run test:e2e`, `npm run test:performance`, `npm run validate:pre-aws:browsers`, `npm run test:observability`, and `npm run validate:workflows`, then record results and any environment-limited gates in specs/008-responsive-completed-tasks/validation.md
- [X] T049 Confirm the final diff adds no HTTP/storage/sync/AWS/CloudWatch contract change, preserves protected-data exclusions and offline recovery, and document the security/data-loss/cost review in specs/008-responsive-completed-tasks/validation.md
- [ ] T050 Re-review the final diff for correctness, unnecessary complexity, data durability, error handling, comments, tests, Chrome/Safari behavior, documentation accuracy, and 100% audit-matrix closure in specs/008-responsive-completed-tasks/responsive-audit.md and specs/008-responsive-completed-tasks/validation.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: No dependencies; T001, T002, and T003 may start in parallel.
- **Phase 2 — Foundational**: Depends on Phase 1. T004 and T006 may run in parallel; T005 follows
  T004. This phase blocks all user stories.
- **Phase 3 — US1**: Depends only on Phase 2 and is the recommended MVP.
- **Phase 4 — US2**: Depends only on Phase 2; it is logically independent from US1.
- **Phase 5 — US3**: Depends only on Phase 2; it is logically independent from US1/US2, although
  sequential execution after US2 reduces shared-stylesheet conflicts.
- **Phase 6 — US4**: Depends only on Phase 2; it is logically independent, although running it after
  US2/US3 lets it verify the final responsive surfaces.
- **Phase 7 — Polish**: Depends on every user story selected for delivery.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (P1, MVP) -----------\
                    -> US2 (P1, phone) ----------+-> Polish / full release gates
                    -> US3 (P2, tablet/desktop) --+
                    -> US4 (P2, accessibility) ---/
```

### Within Each User Story

- Write and observe the story's tests failing before product implementation.
- Implement pure/view-model behavior before component integration.
- Add component class hooks before stylesheet rules that consume them.
- Complete the story's focused browser matrix and evidence before its checkpoint.
- Preserve unrelated user changes in the dirty worktree, especially overlapping web/CSS files.

### Contract and Model Mapping

- **US1**: UI contract sections 1–2; Completion Period, Completion Chart Projection, and Completion
  Report State from [data-model.md](data-model.md).
- **US2**: UI contract sections 3–6; Responsive Layout Unit and phone Viewport Profiles.
- **US3**: UI contract sections 3, 5–6; Responsive Layout Unit and tablet/desktop Viewport Profiles.
- **US4**: UI contract sections 5, 7–8; all Responsive Layout Unit accessibility invariants.
- No persisted data model or external API contract is created by any story.

## Parallel Opportunities

- Setup evidence, reusable geometry assertions, and baseline capture can proceed together.
- After Foundation, the four story phases are independently testable and may be assigned separately;
  coordinate changes to `apps/web/src/styles/app.css` or execute US2 → US3 → US4 sequentially.
- Within each story, tasks explicitly marked [P] use separate test, component, documentation, or
  performance files and may run concurrently.
- US1 label/documentation tasks can run while the projection implementation is in progress.
- US2 stack component hooks can run while phone geometry and safe-area tests are authored.

## Parallel Example: User Story 1

```text
In parallel: T007 selector tests, T008 component tests, T009 browser tests, T010 contract regression.
After failing tests: T011 projection; concurrently T013 navigation copy and T014 user docs.
Then: T012 dashboard integration, followed by T015 focused validation.
```

## Parallel Example: User Story 2

```text
In parallel: T016 phone matrix, T017 stack component contract, T018 stack journey, T019 dialog/safe-area journey.
After failing tests: T020 stack hooks, then T021–T027 responsive implementation in file-conflict order.
Then: T028 phone audit closure.
```

## Parallel Example: User Story 3

```text
In parallel: T029 wide-viewport browser tests and T030 component class-contract tests.
Then: T031–T035 desktop implementation in shared-stylesheet order, followed by T036 audit closure.
```

## Parallel Example: User Story 4

```text
In parallel: T037 axe/semantics, T038 focus/reflow/zoom, T039 target/state tests.
After failing tests: T040–T042 shared fixes; T043 may update separate regression files in parallel.
Then: T044 accessibility audit closure.
```

## Implementation Strategy

### MVP First — User Story 1

1. Complete Setup and Foundation.
2. Complete US1 tests and implementation.
3. Stop and validate `/dashboard`, Completed Tasks naming, positive-only chart, raw contract
   preservation, empty/error/status behavior, offline cache, and exports.
4. Deploy/demo this reporting improvement independently if desired.

### Incremental Delivery

1. **MVP**: US1 — meaningful Completed Tasks report.
2. **Phone usability**: US2 — fix the supplied defects and audit every mobile workflow/state.
3. **Wide composition**: US3 — make tablet/desktop grids and actions cohesive and bounded.
4. **Accessibility closure**: US4 — validate semantics, focus, touch, zoom, motion, and state retention.
5. **Release**: complete Phase 7 and attach the closed audit/validation record.

### Suggested Single-Developer Order

```text
T001–T006 -> T007–T015 -> T016–T028 -> T029–T036 -> T037–T044 -> T045–T050
```

This order minimizes conflicts in the shared stylesheet while retaining independent story checkpoints.

## Notes

- `[P]` means the task is safe to parallelize by file/dependency, not merely desirable to parallelize.
- All task descriptions include exact paths; a directory path means the task must enumerate and
  record each changed file from that directory in the audit/validation record.
- Existing zero-filled API aggregates, `/dashboard`, encrypted cache, export, synchronization, AWS,
  and CloudWatch behavior are regression boundaries, not implementation targets.
- Commit after each task or coherent test/implementation pair when using a commit-based workflow.
