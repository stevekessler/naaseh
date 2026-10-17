# Tasks: Content Scope and Collaborative Filtering

## Phase 1: Setup and Baseline

- [x] T001 Record required quick browser-suite test count and `/usr/bin/time -p npm run test:e2e:quick` baseline in specs/014-content-scope-filtering/quickstart.md
- [x] T002 Verify repository ignore configuration covers Node, build, coverage, environment, and editor artifacts in .gitignore and eslint.config.js

## Phase 2: Foundational Model and Contracts

- [x] T003 Add required-assignee and public-grouped-task authorization tests in packages/domain/src/task.test.ts and packages/domain/test/task.test.ts
- [x] T004 Implement required persisted assignee/default-to-owner and task-specific public authorization in packages/domain/src/task.ts
- [x] T005 Add filter scope/Boolean truth-table and URL compatibility tests in apps/web/test/search/task-search.test.ts
- [x] T006 Implement shared presentation-scope and Boolean filter state in apps/web/src/search/task-search.ts, apps/web/src/search/task-filters.ts, and apps/web/src/features/search/search-state.ts
- [x] T007 Update stack filter wire validation in packages/contracts/src/urgency-stack-ranking-openapi.ts

## Phase 3: User Story 1 — Relevant Defaults

- [x] T008 [US1] Add default-scope component and browser tests in apps/web/test/features/task-filters-scope.test.tsx and tests/e2e
- [x] T009 [US1] Apply assignee/group default task scope and creator assignment defaults in apps/web/src/app/App.tsx and apps/web/src/features/tasks/TaskForm.tsx
- [x] T010 [US1] Normalize legacy missing assignees to owners during encrypted local reads and server hydration in apps/web/src/db/task-repository.ts and apps/api/src/shared/store.ts
- [x] T011 [US1] Publish unlocked grouped tasks to the public audience and update projections in apps/api/src/tasks/privacy-transition.ts and apps/api/src/tasks/task-repository.ts

## Phase 4: User Story 2 — Boolean People and Group Filters

- [x] T012 [US2] Add multi-assignee/group and Match all/any UI tests in apps/web/test/features/task-filters-scope.test.tsx
- [x] T013 [US2] Implement multi-value Assignee and Group controls, expression summary, and expansion indicator in apps/web/src/features/search/TaskFilters.tsx
- [x] T014 [US2] Wire shared filter evaluation and route state through task/archive/report consumers in apps/web/src/app/App.tsx and apps/web/src/features/archive/ArchivePage.tsx

## Phase 5: User Story 3 — Personal Stack Eligibility

- [x] T015 [US3] Add assignment/group-only stack eligibility tests in apps/api/test/ranking/runtime.test.ts
- [x] T016 [US3] Restrict server stack candidates to Tasks assigned to the viewer or their groups in apps/api/src/ranking/runtime.ts and apps/api/src/ranking/stack-service.ts
- [x] T017 [US3] Restrict offline stack candidates and update explanatory copy in apps/web/src/app/App.tsx and apps/web/src/features/stacks/PersonalStackPage.tsx

## Phase 6: User Story 4 — Search Scope

- [x] T018 [US4] Add default/all content search tests in apps/web/test/features/combined-search-page.test.tsx and apps/web/test/search/task-search.test.ts
- [x] T019 [US4] Implement task/list/item scope evaluation and All content toggle in apps/web/src/features/search/CombinedSearchPage.tsx
- [x] T020 [US4] Wire viewer and active-group context into Search in apps/web/src/app/App.tsx

## Phase 7: User Story 5 — Automatic Group Members

- [x] T021 [US5] Add automatic roster loading/error/retry tests in apps/web/test/features/group-page.test.tsx
- [x] T022 [US5] Remove Show members and implement per-group automatic progressive roster loading in apps/web/src/features/groups/GroupPage.tsx

## Phase 8: User Story 6 — Durable List Sharing

- [x] T023 [US6] Add list-sharing draft/status component tests in apps/web/test/features/list-visibility-control.test.tsx
- [x] T024 [US6] Implement explicit Save sharing, Cancel, and accurate local/pending/error states in apps/web/src/features/lists/ListVisibilityControl.tsx and apps/web/src/features/lists/ListPage.tsx
- [x] T025 [US6] Add parent-and-existing-child audience transition tests in apps/api/test/lists/list-audience.test.ts
- [x] T026 [US6] Emit complete existing List Item grants/revocations with list sharing changes in apps/api/src/lists/list-audience.ts and apps/api/src/lists/handler.ts
- [x] T027 [US6] Add revoked-parent child-cache cleanup coverage and implementation in apps/web/src/db/outbox.ts

## Phase 9: Polish and Cross-Cutting Validation

- [x] T028 Add representative scope/filter/group/share assertions to the appropriate Playwright journeys without expanding the required suite
- [x] T029 Recount and remeasure `/usr/bin/time -p npm run test:e2e:quick`, record results, and confirm expected hosted PR duration remains at or below ten minutes in specs/014-content-scope-filtering/quickstart.md
- [x] T030 Run focused tests, typecheck, lint, full unit suite, build, and applicable browser validation; record results in specs/014-content-scope-filtering/quickstart.md
- [x] T031 Review the final diff for authorization, privacy, migration safety, offline conflicts, observability exclusions, browser accessibility, and unnecessary complexity; update specs/014-content-scope-filtering/plan.md if implementation differs

## Dependencies

- Phase 2 blocks every user story.
- US1 establishes default scope and public task audiences before US2, US3, and US4 consume them.
- US2, US3, US4, and US5 can proceed independently after US1.
- US6 depends only on the foundational authorization distinction and can proceed alongside US2–US5.
- Final validation follows all stories.

## Parallel Opportunities

- Domain authorization tests and filter truth-table tests use different files after baseline setup.
- Search scope, automatic group rosters, and list-sharing UI can be developed independently after foundational state types exist.
- API list-audience tests and web sharing component tests are independent until integration validation.

## Implementation Strategy

The MVP is US1: required assignment, globally readable unlocked tasks, and safe default task scope. Then add Boolean filters and Personal Stack eligibility, followed by Search, automatic rosters, and complete list sharing. Keep the required browser suite representative and retain exhaustive combinations in full validation.
