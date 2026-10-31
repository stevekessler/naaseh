# Tasks: Finance and Budget Management

**Input**: Design documents from `/specs/015-finance-budget-management/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Automated unit, integration, contract, security, restore, performance, and Playwright coverage is required by the project constitution. Tests in each story phase are written first and must fail before implementation.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an independently useful increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on an incomplete task in the same phase
- **[Story]**: Maps the task to a specification user story
- Every task names the exact file or directory it changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the Finance feature boundaries and deterministic fixtures without changing product behavior.

- [x] T001 Create the planned Finance source and test directories with module barrels in `packages/domain/src/finance/index.ts`, `apps/api/src/finance/index.ts`, `apps/web/src/features/finance/index.ts`, and `tests/fixtures/finance/index.ts`
- [x] T002 [P] Add the Finance contract module export scaffold in `packages/contracts/src/finance.ts` and `packages/contracts/src/index.ts`
- [x] T003 [P] Add synthetic account, transaction, CSV, budget, and SimpleFIN v2 fixtures containing no real financial data in `tests/fixtures/finance/accounts.ts`, `tests/fixtures/finance/transactions.ts`, `tests/fixtures/finance/csv.ts`, and `tests/fixtures/finance/simplefin.ts`
- [x] T004 [P] Add Finance test-data builders and safe redaction assertions in `tests/fixtures/finance/builders.ts` and `tests/fixtures/finance/redaction.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared security, persistence, synchronization, offline, API, and infrastructure boundaries required by every Finance story.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

- [x] T005 Add failing unit tests for exact minor-unit arithmetic, currency exponents, FinanceScope validation, revisions, and protected-field separation in `packages/domain/src/finance/finance-foundation.test.ts`
- [x] T006 [P] Add failing contract tests for Finance OpenAPI schemas, RFC 9457 problems, cursors, idempotency keys, and sync v7 entity negotiation in `tests/contract/finance.contract.test.ts` and `tests/contract/finance-sync.contract.test.ts`
- [x] T007 [P] Add failing security tests for owner/group/public audiences, generic not-found behavior, administrator non-access, protected response fields, and log redaction in `tests/security/finance-authorization.security.test.ts` and `tests/security/finance-observability.security.test.ts`
- [x] T008 Implement exact money, FinanceScope, lifecycle, revision, and source-snapshot primitives in `packages/domain/src/finance/money.ts`, `packages/domain/src/finance/scope.ts`, `packages/domain/src/finance/lifecycle.ts`, and `packages/domain/src/finance/source-snapshot.ts`
- [x] T009 Implement Zod request/response/problem schemas and sync v7 Finance entity discriminators in `packages/contracts/src/finance.ts` and `packages/contracts/src/sync.ts`
- [x] T010 Implement centralized owner/group/catalog authorization checks with generic not-found mapping in `apps/api/src/finance/authorization.ts`
- [x] T011 Implement DynamoDB Finance key builders, conditional mutation receipts, audience-feed writes, bounded cursors, and transaction helpers in `apps/api/src/finance/repository.ts`
- [x] T012 Extend sync v7 types, bootstrap ordering, mutation dispatch, revocation tombstones, and content-free conflict receipts in `apps/api/src/sync/types.ts`, `apps/api/src/sync/sync-service.ts`, and `apps/api/src/sync/handlers.ts`
- [x] T013 Extend encrypted Dexie storage, structural indexes, schema migration, outbox operations, and revocation purge for Finance entities in `apps/web/src/db/database.ts`, `apps/web/src/db/schema.ts`, `apps/web/src/db/finance-repository.ts`, and `apps/web/src/sync/privacy-purge.ts`
- [x] T014 Implement the shared Finance API client, sync hydration, pending/conflict state, and safe problem rendering in `apps/web/src/features/finance/finance-client.ts`, `apps/web/src/sync/finance-sync.ts`, and `apps/web/src/features/finance/FinanceStatus.tsx`
- [x] T015 Wire the authenticated Finance API handler, route dispatch, CSRF/idempotency enforcement, and sanitized error boundary in `apps/api/src/finance/handler.ts`, `apps/api/src/finance/handlers.ts`, and `apps/api/src/index.ts`
- [x] T016 Before any user-story implementation, estimate normal incremental AWS cost at the reference scale in `specs/015-finance-budget-management/implementation-validation.md`, block further implementation if the forecast exceeds $5 per month without Steve's explicit approval and documented cheaper alternatives, then configure the finance API/import Lambdas, least-privilege DynamoDB/KMS grants, routes, structured CloudWatch metrics/alarms, backup coverage, and deletion-workflow access in `infra/lib/api-stack.ts`, `infra/lib/observability-stack.ts`, `infra/lib/backup-stack.ts`, and `infra/lib/deletion-stack.ts`

**Checkpoint**: Finance entities can be authorized, persisted, synchronized, encrypted offline, restored, and observed without exposing protected data.

---

## Phase 3: User Story 1 — Connect and Organize Financial Accounts (Priority: P1) 🎯 MVP

**Goal**: Create manual individual/group accounts, connect SimpleFIN accounts, maintain balance history, enter/import transactions into manual accounts, and preserve access boundaries.

**Independent Test**: Create one manual account and one SimpleFIN account, assign each to an owner or group, update names and balances, import a reviewed CSV, refresh SimpleFIN, and verify authorized and unauthorized views plus retry safety.

### Tests for User Story 1

- [x] T017 [P] [US1] Add failing domain tests for manual-account balance baselines, strictly-later transaction projection, later snapshots, currency immutability, and balance-history idempotency in `packages/domain/src/finance/account.test.ts` and `packages/domain/src/finance/balance.test.ts`
- [x] T018 [P] [US1] Add failing CSV parser tests for RFC 4180 quoting, UTF-8 validation, supported dates, signed and debit/credit mappings, limits, cancellation, and worker-safe progress in `packages/domain/src/finance/csv.test.ts`
- [x] T019 [P] [US1] Add failing contract tests for account, balance, manual transaction, CSV chunk, connection claim, refresh, job-status, duplicate-decision, generalized destructive-preview/confirmation, and sanitized error schemas in `tests/contract/finance-accounts.contract.test.ts` and `tests/contract/finance-deletion.contract.test.ts`
- [x] T020 [P] [US1] Add failing integration tests for account persistence, balance projection, CSV row/file receipts, duplicate walkthrough, partial chunks, SimpleFIN claim/import/cooldown, and retry recovery in `tests/integration/finance-account-repository.test.ts`, `tests/integration/finance-csv-import.test.ts`, and `tests/integration/simplefin-import.test.ts`
- [x] T021 [P] [US1] Add failing security tests for group-member create/edit/import, role-specific destructive previews, non-disclosing dependent counts, referenced-record archive/tombstones, unreferenced-only permanent deletion, SimpleFIN SSRF defenses, KMS credential isolation, revocation, and CSV/log content exclusion in `tests/security/finance-account-access.security.test.ts`, `tests/security/finance-deletion.security.test.ts`, and `tests/security/simplefin-ssrf.security.test.ts`
- [x] T022 [P] [US1] Add failing Playwright tests for manual account creation, balance recording, CSV mapping/duplicate review, offline queued commit, SimpleFIN status, and responsive keyboard/touch behavior in `tests/e2e/finance-accounts.spec.ts`

### Implementation for User Story 1

- [x] T023 [P] [US1] Implement FinancialAccount and BalanceSnapshot invariants plus current-balance derivation in `packages/domain/src/finance/account.ts` and `packages/domain/src/finance/balance.ts`
- [x] T024 [P] [US1] Implement the bounded RFC 4180 parser, date/amount mappings, SHA-256 batch/decision digests, row validation, and suspected-duplicate model in `packages/domain/src/finance/csv.ts`
- [x] T025 [P] [US1] Implement FinanceConnection, ImportJob, provider payload limits, and SimpleFIN v2 parsing types in `packages/domain/src/finance/connection.ts` and `packages/domain/src/finance/import-job.ts`
- [x] T026 [US1] Implement account, balance snapshot, CSV batch/receipt, connection, source-identity, and import-job persistence in `apps/api/src/finance/repository.ts`
- [x] T027 [US1] Implement manual account lifecycle, required organization/account names, user completion for incomplete SimpleFIN account identity, the `organization - account` friendly-name default, balance recalculation, archive/restore, and the shared impact-preview/confirmation engine that archives or tombstones referenced records and permanently deletes only unreferenced mistakes in `apps/api/src/finance/account-service.ts` and `apps/api/src/finance/deletion-service.ts`
- [x] T028 [US1] Implement active-member manual transaction creation/editing and manual balance snapshot commands with expected-version and audience-feed writes in `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/account-service.ts`
- [x] T029 [US1] Implement idempotent CSV chunk commit, authoritative duplicate recheck, included/excluded receipts, partial retry, and balance projection updates in `apps/api/src/finance/csv-import-service.ts`
- [x] T030 [US1] Implement account, balance, transaction, CSV import, generalized destructive-preview/confirmation, and import-status handlers matching `contracts/finance.openapi.yaml` in `apps/api/src/finance/handlers.ts`
- [x] T031 [US1] Implement SimpleFIN setup-token and Access-URL validation, host/port/redirect allowlisting, response limits, and sanitized protocol errors in `apps/api/src/finance/simplefin-client.ts`
- [x] T032 [US1] Implement KMS claim storage, connection cooldown/lease, asynchronous refresh dispatch, bounded windows, five-day overlap, and partial job status in `apps/api/src/finance/connection-service.ts` and `apps/api/src/finance/import-handler.ts`
- [x] T033 [US1] Add account/CSV/import metrics with protected-data-safe dimensions and no token, URL, filename, row, amount, or description logging in `apps/api/src/finance/telemetry.ts`
- [x] T034 [P] [US1] Implement the CSV Web Worker, local preview repository, mapping state, duplicate-review state machine, and encrypted queued chunks in `apps/web/src/features/finance/csv/csv.worker.ts`, `apps/web/src/features/finance/csv/csv-import.ts`, and `apps/web/src/features/finance/csv/CsvImportWizard.tsx`
- [x] T035 [P] [US1] Implement account list/detail, create/edit, deterministic default-name display, balance history/recording, freshness, import progress, and permission-aware impact preview with archive/tombstone/permanent-delete outcome labels in `apps/web/src/features/finance/accounts/FinanceAccountsPage.tsx` and `apps/web/src/features/finance/accounts/FinanceAccountDetail.tsx`
- [x] T036 [P] [US1] Implement the protected SimpleFIN claim/refresh UI with cooldown, partial failure, offline, retry, and credential non-redisplay states in `apps/web/src/features/finance/accounts/SimplefinConnectionPanel.tsx`
- [x] T037 [US1] Add the authenticated Finance navigation and account routes with narrow-screen and not-found behavior in `apps/web/src/app/App.tsx`, `apps/web/src/components/FinanceNavigation.tsx`, and `apps/web/src/features/finance/FinanceLandingPage.tsx`

**Checkpoint**: User Story 1 is independently usable for manual accounts, reviewed CSV history, balance maintenance, and SimpleFIN account import.

---

## Phase 4: User Story 2 — Review, Classify, and Find Transactions (Priority: P1)

**Goal**: Review accessible transactions, preserve entry/provider provenance, split classifications, manage transfers and merchants, search account activity, and safely reconcile provisional transactions with SimpleFIN.

**Independent Test**: Import and manually add representative transactions, reconcile exact and ambiguous provider candidates, split categories/budget allocations, mark a transfer, search one/all accessible accounts, and verify merchant privacy.

### Tests for User Story 2

- [x] T038 [P] [US2] Add failing domain tests for allocations, transfer totals, entry/provider snapshots, exact normalization, UTC date windows, identity-lock transfer, and keep-separate suppression in `packages/domain/src/finance/transaction.test.ts` and `packages/domain/src/finance/provider-reconciliation.test.ts`
- [x] T039 [P] [US2] Add failing contract tests for transaction pages, allocation replacement, provider-reconciliation decisions, category/merchant commands, and generic inaccessible-candidate responses in `tests/contract/finance-transactions.contract.test.ts`
- [x] T040 [P] [US2] Add failing integration tests for source corrections, allocation invalidation, transfers, merchant activity, account-scoped search, atomic reconciliation, candidate aliases, and replay/concurrency in `tests/integration/finance-transactions.test.ts`, `tests/integration/finance-transfers.test.ts`, and `tests/integration/finance-provider-reconciliation.test.ts`
- [x] T041 [P] [US2] Add failing security tests for merchant aggregate privacy, cross-account reconciliation, revoked/nonmember decisions, candidate existence protection, and protected search/cache behavior in `tests/security/finance-transactions.security.test.ts` and `tests/security/finance-reconciliation.security.test.ts`
- [x] T042 [P] [US2] Add failing Playwright tests for transaction review, split editing, transfer confirmation, merchant detail, scoped search, and reconciliation comparison/conflict states in `tests/e2e/finance-transactions.spec.ts`

### Implementation for User Story 2

- [x] T043 [P] [US2] Implement FinancialTransaction source snapshots, allocation invariants, transfer lifecycle, archive/tombstone rules, unreferenced-mistake eligibility, and review issues in `packages/domain/src/finance/transaction.ts`, `packages/domain/src/finance/allocation.ts`, `packages/domain/src/finance/transfer.ts`, and `packages/domain/src/finance/review-issue.ts`
- [x] T044 [P] [US2] Implement the canonical Unicode normalization and exact provider-reconciliation predicate with no empty, cross-field, substring, or fuzzy matches in `packages/domain/src/finance/provider-reconciliation.ts`
- [x] T045 [P] [US2] Implement global FinanceCategory and Merchant lifecycle, creator/admin archive controls, permanent-delete eligibility for unreferenced mistakes, canonical-name locks, and historical labels in `packages/domain/src/finance/category.ts` and `packages/domain/src/finance/merchant.ts`
- [x] T046 [US2] Extend Finance persistence for transaction/date pages, allocations, transfers, catalogs, review issues, identity-lock transfers, candidate aliases, and keep-separate pairs in `apps/api/src/finance/repository.ts`
- [x] T047 [US2] Implement transaction correction, balanced allocations, transfer confirmation, category/merchant association, invalidation, and account search services in `apps/api/src/finance/transaction-service.ts`
- [x] T048 [US2] Implement automatic and explicit provider reconciliation with conditional lock transfer, candidate conflict detection, preserved entry snapshots, and safe audit events in `apps/api/src/finance/provider-reconciliation-service.ts` and `apps/api/src/finance/import-handler.ts`
- [x] T049 [US2] Implement transaction, allocation, reconciliation, category, merchant, merchant-activity, and record-specific destructive adapters for the shared deletion service in `apps/api/src/finance/handlers.ts` and `apps/api/src/finance/deletion-service.ts`
- [x] T050 [P] [US2] Implement virtualized transaction list/detail, split editor, transfer controls, provenance display, reconciliation comparison, and permission-aware destructive preview/outcome UI in `apps/web/src/features/finance/transactions/FinanceTransactionsPage.tsx`, `apps/web/src/features/finance/transactions/TransactionDetail.tsx`, and `apps/web/src/features/finance/transactions/ReconciliationReview.tsx`
- [x] T051 [P] [US2] Implement category/merchant management, creator/admin archive or unreferenced-mistake removal controls, and authorization-filtered merchant activity views in `apps/web/src/features/finance/catalog/FinanceCategoryManager.tsx`, `apps/web/src/features/finance/catalog/FinanceMerchantPage.tsx`, and `apps/web/src/features/finance/catalog/FinanceMerchantDetail.tsx`
- [x] T052 [US2] Implement progressive memory-only transaction indexing and one-account/all-accessible account search in `apps/web/src/search/finance-index.ts` and `apps/web/src/features/finance/transactions/TransactionSearch.tsx`

**Checkpoint**: User Story 2 independently supports trustworthy transaction review, classification, transfers, merchants, scoped search, and provider reconciliation.

---

## Phase 5: User Story 3 — Build Flexible Budgets (Priority: P1)

**Goal**: Create group budgets with bounded, single-date, or open-ended periods; link accessible accounts; add debit/credit items; and show exact planned, actual, and variance totals by currency/category.

**Independent Test**: Create bounded and open-ended budgets, link group and private accounts, add items and allocations, and verify viewer-dependent completeness, transfer exclusion, mixed-currency separation, totals, and variance.

### Tests for User Story 3

- [x] T053 [P] [US3] Add failing domain tests for budget dates, account links, exact totals, category variance, transfer exclusion, mixed currencies, and incomplete views in `packages/domain/src/finance/budget.test.ts`
- [x] T054 [P] [US3] Add failing contract and integration tests for budget create/read/update, item/account-link persistence, authorization, concurrency, and totals in `tests/contract/finance-budgets.contract.test.ts` and `tests/integration/finance-budgets.test.ts`
- [x] T055 [P] [US3] Add failing security tests for private-account links, hidden contributions, group membership changes, and aggregate non-disclosure in `tests/security/finance-budgets.security.test.ts`
- [x] T056 [P] [US3] Add failing Playwright tests for budget creation, account/item management, variance, incomplete totals, mixed currency, and responsive layouts in `tests/e2e/finance-budgets.spec.ts`

### Implementation for User Story 3

- [x] T057 [P] [US3] Implement Budget, BudgetAccountLink, and BudgetItem invariants, archive/tombstone and unreferenced-draft removal rules, and exact aggregate calculations in `packages/domain/src/finance/budget.ts` and `packages/domain/src/finance/budget-totals.ts`
- [x] T058 [US3] Implement budget, account-link, item, and viewer-filtered aggregate persistence in `apps/api/src/finance/repository.ts`
- [x] T059 [US3] Implement budget lifecycle, cross-entity authorization, complete/incomplete totals, transfer exclusion, and currency-grouped variance in `apps/api/src/finance/budget-service.ts`
- [x] T060 [US3] Implement budget/item API handlers and destructive adapters matching the Finance contract in `apps/api/src/finance/handlers.ts` and `apps/api/src/finance/deletion-service.ts`
- [x] T061 [P] [US3] Implement budget list/create/detail, account selection, item editing, exact textual totals, incomplete-view warnings, and archive/tombstone/permanent-delete outcome previews in `apps/web/src/features/finance/budgets/FinanceBudgetsPage.tsx` and `apps/web/src/features/finance/budgets/FinanceBudgetDetail.tsx`
- [x] T062 [US3] Add encrypted offline budget/account-link/item projections, queued edits, and semantic conflict review in `apps/web/src/db/finance-repository.ts` and `apps/web/src/sync/finance-sync.ts`

**Checkpoint**: User Story 3 independently delivers usable multi-account group budgeting with privacy-preserving totals.

---

## Phase 6: User Story 4 — Reuse and Match Planned Items (Priority: P2)

**Goal**: Reuse recurring/future budget items and safely auto-match only unique exact transactions while presenting near or ambiguous suggestions.

**Independent Test**: Create reusable and future items, copy them into applicable budgets, edit copies independently, import exact/near/ambiguous transactions, and verify automatic, suggested, rejected, and undone outcomes.

### Tests for User Story 4

- [x] T063 [P] [US4] Add failing domain tests for recurrence occurrences, copy independence, exact uniqueness, inclusive 20-percent suggestions, ambiguity, and undo in `packages/domain/src/finance/reusable-item.test.ts` and `packages/domain/src/finance/match.test.ts`
- [x] T064 [P] [US4] Add failing integration and contract tests for reusable items, occurrence keys, match decisions, source changes, and atomic allocation updates in `tests/integration/finance-matching.test.ts` and `tests/contract/finance-matching.contract.test.ts`
- [x] T065 [P] [US4] Add failing Playwright tests for reusable-item copying, future offers, exact automatic matches, near suggestions, ambiguity, and undo in `tests/e2e/finance-matching.spec.ts`

### Implementation for User Story 4

- [x] T066 [P] [US4] Implement ReusableBudgetItem occurrence generation, copy and archive rules, and TransactionMatch lifecycle/scoring with durable tombstones for referenced decisions in `packages/domain/src/finance/reusable-item.ts` and `packages/domain/src/finance/match.ts`
- [x] T067 [US4] Implement reusable-item, occurrence-lock, and transaction-match persistence in `apps/api/src/finance/repository.ts`
- [x] T068 [US4] Implement copy/offer logic, unique exact auto-match, near/ambiguous suggestions, decisions, invalidation, and undo in `apps/api/src/finance/matching-service.ts`
- [x] T069 [US4] Implement reusable-item and match-decision handlers plus destructive adapters in `apps/api/src/finance/handlers.ts` and `apps/api/src/finance/deletion-service.ts`
- [x] T070 [US4] Implement reusable-item management, future offers, match suggestions, decision controls, provenance labels, and archive/tombstone previews in `apps/web/src/features/finance/budgets/ReusableItemsPage.tsx` and `apps/web/src/features/finance/budgets/TransactionMatches.tsx`

**Checkpoint**: User Story 4 independently reduces repetitive planning while keeping uncertain matches under user control.

---

## Phase 7: User Story 5 — Reconcile and Audit Budgets (Priority: P2)

**Goal**: Reconcile a complete authorized budget into immutable evidence and identify later total-affecting changes without rewriting history.

**Independent Test**: Reconcile a fully reviewed budget, inspect actor/time/digest/totals history, then change a contributing record and verify changed-since-reconciliation while prior evidence remains intact.

### Tests for User Story 5

- [x] T071 [P] [US5] Add failing domain and integration tests for completeness gates, canonical digests, immutable records, concurrent changes, and changed-since-reconciliation transitions in `packages/domain/src/finance/budget-reconciliation.test.ts` and `tests/integration/finance-reconciliation.test.ts`
- [x] T072 [P] [US5] Add failing security and contract tests for incomplete private-account views, version conflicts, append-only history, and non-disclosing failures in `tests/security/finance-budget-reconciliation.security.test.ts` and `tests/contract/finance-reconciliation.contract.test.ts`
- [x] T073 [P] [US5] Add failing Playwright tests for reconciliation prerequisites, history, offline disablement, failure recovery, and post-reconciliation changes in `tests/e2e/finance-reconciliation.spec.ts`

### Implementation for User Story 5

- [x] T074 [US5] Implement ReconciliationRecord digest/totals creation and changed-state invariants in `packages/domain/src/finance/budget-reconciliation.ts`
- [x] T075 [US5] Implement server-side complete-view verification, conditional append-only reconciliation, invalidation marking, and audit events in `apps/api/src/finance/reconciliation-service.ts` and `apps/api/src/finance/repository.ts`
- [x] T076 [US5] Implement the online reconciliation handler and sanitized conflict responses in `apps/api/src/finance/handlers.ts`
- [x] T077 [US5] Implement reconciliation prerequisites, confirmation, immutable history, changed-state, and offline/error UI in `apps/web/src/features/finance/budgets/BudgetReconciliation.tsx`

**Checkpoint**: User Story 5 independently provides auditable, truthful budget reconciliation.

---

## Phase 8: User Story 6 — Create Tasks from Financial Items (Priority: P2)

**Goal**: Create tasks from budget items and navigate the relationship only when task and Finance authorization independently permit it.

**Independent Test**: Create a task from a budget item, navigate both directions as an authorized user, and verify that a task-only viewer sees no financial label, amount, merchant, budget, link, or hidden-state signal.

### Tests for User Story 6

- [x] T078 [P] [US6] Add failing contract/integration tests for atomic task creation, FinanceTaskLink persistence, audience isolation, and retry safety in `tests/contract/finance-task-link.contract.test.ts` and `tests/integration/finance-task-link.test.ts`
- [x] T079 [P] [US6] Add failing security and Playwright tests for task-only viewers, broader task sharing, revoked Finance access, and authorized navigation in `tests/security/finance-task-link.security.test.ts` and `tests/e2e/finance-task-link.spec.ts`

### Implementation for User Story 6

- [x] T080 [P] [US6] Implement FinancialTaskLink lifecycle, archive/tombstone rules, and independent task/Finance access invariants in `packages/domain/src/finance/task-link.ts`
- [x] T081 [US6] Implement atomic task creation plus Finance-audience link persistence without embedding Finance metadata in task feeds in `apps/api/src/finance/task-link-service.ts` and `apps/api/src/finance/repository.ts`
- [x] T082 [US6] Implement the budget-item task creation handler, task-link destructive adapter, and redacted response contract in `apps/api/src/finance/handlers.ts` and `apps/api/src/finance/deletion-service.ts`
- [x] T083 [US6] Implement Create Task controls and authorization-local relationship decoration in `apps/web/src/features/finance/budgets/CreateFinancialTask.tsx` and `apps/web/src/features/tasks/FinancialTaskLink.tsx`

**Checkpoint**: User Story 6 independently connects financial planning to tasks without broadening either access boundary.

---

## Phase 9: User Story 7 — Search Across Na'aseh Content Types (Priority: P3)

**Goal**: Add opt-in transaction and merchant results to general search while preserving tasks/lists defaults and Finance privacy.

**Independent Test**: Verify tasks/lists default on and transactions/merchants default off, enable each Finance type, search one/all accessible accounts, and prove that inaccessible activity never appears through results, counts, URLs, cache, or telemetry.

### Tests for User Story 7

- [x] T084 [P] [US7] Add failing integration and security tests for content-type defaults, account scope, global merchant identity, incremental indexing, revocation, URL state, and aggregate non-disclosure in `tests/integration/finance-search.test.ts` and `tests/security/finance-search.security.test.ts`
- [x] T085 [P] [US7] Add failing Playwright Chromium/WebKit tests for search toggles, mixed results, indexing progress, offline completeness, empty/error states, and responsive accessibility in `tests/e2e/finance-search.spec.ts`

### Implementation for User Story 7

- [x] T086 [P] [US7] Extend search preference and safe URL-state models with transaction/merchant toggles and unchanged tasks/lists defaults in `apps/web/src/features/search/search-state.ts`
- [x] T087 [P] [US7] Implement memory-only merchant/transaction documents, authorization-aware account filtering, progressive indexing, and purge in `apps/web/src/search/finance-index.ts`
- [x] T088 [US7] Integrate Finance result sources, progress, offline completeness, and privacy-safe counts in `apps/web/src/features/search/combined-search.ts`
- [x] T089 [US7] Add transaction/merchant toggle controls and accessible mixed result rendering in `apps/web/src/features/search/CombinedSearchColumnSettings.tsx` and `apps/web/src/features/search/SearchResults.tsx`
- [x] T090 [US7] Clear Finance indexes/preferences on sign-out, revocation, storage recovery, and explicit cache purge in `apps/web/src/sync/privacy-purge.ts` and `apps/web/src/features/auth/sign-out.ts`

**Checkpoint**: User Story 7 independently adds deliberate Finance discovery without making protected activity appear unexpectedly.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Validate the integrated feature against security, durability, recovery, performance, browser, observability, cost, and required-runtime gates.

- [x] T091 [P] Add restore validation for accounts, snapshots, source/entry identity, CSV receipts, allocations, budgets, links, and reconciliation history without contacting SimpleFIN in `tests/restore/finance-restore.test.ts` and `apps/api/src/crypto-recovery/restore-validator.ts`
- [x] T092 [P] Add destructive-preview and execution tests for accounts, transactions, budgets, reusable items, matches, task links, merchants, and categories covering role checks, inaccessible-dependent non-disclosure, unreferenced-only permanent deletion, archival references, checkpoint/retry, and audit tombstones in `tests/integration/finance-deletion.test.ts` and `tests/security/finance-deletion.security.test.ts`
- [x] T093 [P] Add performance fixtures and tests for 50 accounts, 100,000 transactions, 50,000-row CSV parsing, local indexing, budget totals, and 20 measured Finance landing/merchant/budget/search Chromium iterations using 4x CPU slowdown, 10 Mbps bandwidth, and 100 ms latency with p95 useful content within two seconds and refresh progress within one second in `tests/performance/fixtures/finance.ts`, `tests/performance/finance-search.test.ts`, `tests/performance/finance-budget-totals.test.ts`, `tests/performance/finance-csv-import.test.ts`, and `tests/performance/finance-browser.performance.spec.ts`
- [x] T094 [P] Add CDK assertions for no RDS/Aurora/OpenSearch, on-demand reuse, KMS least privilege, bounded import concurrency, backup selection, log retention, metrics, and alarms in `tests/integration/finance-infrastructure.test.ts`
- [x] T095 Record the existing quick-suite test count and `/usr/bin/time -p npm run test:e2e:quick` baseline before editing required validation in `specs/015-finance-budget-management/implementation-validation.md`
- [x] T096 Add exactly one representative Chromium Finance journey to `playwright.quick.config.ts`, keeping exhaustive roles, failures, CSV limits, reconciliation variants, WebKit, iPhone, and iPad coverage in the full suites
- [x] T097 Re-list and re-time `npm run test:e2e:quick` after T096, record the before/after count and real time, and remove or reduce the addition if the projected hosted required check exceeds ten minutes in `specs/015-finance-budget-management/implementation-validation.md`
- [x] T098 Run the full Chromium/WebKit/iPhone/iPad Finance suites and `npm run validate:pre-aws:browsers`, recording browser and accessibility evidence in `specs/015-finance-budget-management/implementation-validation.md`
- [x] T099 Run `npm run validate`, focused contract/integration/security/restore/performance suites, and CDK synthesis; record outcomes and any non-applicable gates in `specs/015-finance-budget-management/implementation-validation.md`
- [x] T100 Review the final diff for correctness, unnecessary complexity, authorization, protected-data handling, data loss, retry/conflict behavior, CloudWatch content, invariant comments, browser support, and documentation accuracy in `specs/015-finance-budget-management/implementation-validation.md`
- [ ] T101 Confirm the hosted PR validation duration remains at or below ten minutes and document the workflow run; do not merge an expansion above ten minutes without explicit approval and rationale in `specs/015-finance-budget-management/implementation-validation.md`
- [x] T102 Complete `specs/015-finance-budget-management/quickstart.md`, update Finance operations/recovery guidance in `docs/operations.md`, verify the foundational AWS cost estimate against the implemented design, and record either final normal incremental cost at or below $5 per month or Steve's explicit approval of a higher forecast with cost drivers and cheaper alternatives in `specs/015-finance-budget-management/implementation-validation.md`
- [ ] T103 Conduct the scripted account, budget, CSV, and status-clarity acceptance workflows with two representative users, require both users to pass every timed/clarity criterion, and record role, timing, results, confusion, and follow-up without real financial content in `specs/015-finance-budget-management/implementation-validation.md`
- [x] T104 [P] Add contract and UI regression tests proving v1 exposes no Finance export endpoint, sync operation, route, action, or downloadable format in `tests/contract/finance-no-export.contract.test.ts` and `tests/e2e/finance-no-export.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T002–T004 may proceed in parallel after the directory convention in T001 is agreed.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story; T016's initial cost gate must pass or receive Steve's explicit approval before Phase 3 begins.
- **P1 stories (Phases 3–5)**: Depend on Foundational. US2 consumes accounts/imports from US1; US3 consumes allocations/accounts from US1–US2.
- **P2 stories (Phases 6–8)**: Depend on the indicated P1 domain: US4 depends on US2 and US3, US5 depends on US3, and US6 depends on US3 plus existing Tasks.
- **P3 story (Phase 9)**: Depends on US1–US2 Finance data and can otherwise proceed independently of US3–US6.
- **Polish (Phase 10)**: Depends on every story included in the release.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 Accounts/Imports -> US2 Transactions -> US3 Budgets
                                      |              |             |\
                                      |              |             | -> US5 Budget Reconciliation
                                      |              |             | -> US6 Financial Tasks
                                      |              +-----------> US7 General Search
                                      +---------------------------> US7 General Search
                                                   US2 + US3 -----> US4 Reuse/Matching
```

### User Story Completion Order

- **US1 (P1)**: First MVP increment; no story dependency after Foundation.
- **US2 (P1)**: Requires US1 account/import entities but remains independently testable with fixtures.
- **US3 (P1)**: Requires US1 accounts and US2 allocations/transfers for complete totals.
- **US4 (P2)**: Requires US2 transactions and US3 budget items.
- **US5 (P2)**: Requires US3 budgets and contributing transaction versions.
- **US6 (P2)**: Requires US3 budget items; otherwise uses the existing task system.
- **US7 (P3)**: Requires US1 accounts and US2 transactions/merchants; does not require budgets.

### Within Each User Story

- Write the listed tests first and verify they fail for the intended reason.
- Implement domain invariants before persistence and services.
- Implement services before handlers and UI integration.
- Validate authorization, retry, conflict, offline, and failure behavior before the story checkpoint.
- Commit only complete, reviewable logical groups; never weaken tests to make implementation pass.

## Parallel Opportunities

- **US1**: T017–T022 can be authored in parallel; T023–T025 can be implemented in parallel; T034–T036 can proceed in parallel after contracts/services stabilize.
- **US2**: T038–T042 can be authored in parallel; T043–T045 can be implemented in parallel; T050–T051 can proceed in parallel.
- **US3**: T053–T056 can be authored in parallel; T057 and T061 can proceed in parallel after the contract is fixed.
- **US4**: T063–T065 can be authored in parallel; T066 can proceed independently before repository/service wiring.
- **US5**: T071–T073 can be authored in parallel before T074–T077 execute sequentially.
- **US6**: T078–T079 can be authored in parallel; T080 can proceed before API/UI wiring.
- **US7**: T084–T085 can be authored in parallel; T086–T087 can be implemented in parallel before combined search integration.
- **Cross-cutting**: T091–T094 and T104 can run in parallel after the entity set stabilizes; quick-suite runtime tasks T095–T097 must remain sequential, and two-user acceptance T103 follows the integrated browser-ready feature.

## Parallel Execution Examples

### User Story 1

```text
Parallel: T017 account/balance tests, T018 CSV parser tests, T019 contracts, T020 integrations, T021 security, T022 browser tests
Then parallel: T023 account model, T024 CSV domain, T025 connection/import models
```

### User Story 2

```text
Parallel: T038 domain tests, T039 contracts, T040 integrations, T041 security, T042 browser tests
Then parallel: T043 transaction entities, T044 reconciliation predicate, T045 catalogs
```

### User Story 3

```text
Parallel: T053 domain tests, T054 contracts/integration, T055 security, T056 browser tests
Then: T057 domain -> T058 persistence -> T059 service -> T060 handlers; T061 UI may begin after T057
```

### User Story 4

```text
Parallel: T063 domain tests, T064 integration/contracts, T065 browser tests
Then: T066 domain -> T067 persistence -> T068 service -> T069 handlers -> T070 UI
```

### User Story 5

```text
Parallel: T071 reconciliation tests, T072 security/contracts, T073 browser tests
Then: T074 domain -> T075 service/persistence -> T076 handler -> T077 UI
```

### User Story 6

```text
Parallel: T078 contract/integration tests, T079 security/browser tests
Then: T080 domain -> T081 service/persistence -> T082 handler -> T083 UI
```

### User Story 7

```text
Parallel: T084 integration/security tests, T085 browser tests
Then parallel: T086 search state, T087 Finance index; then T088–T090 integration
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 through T037.
3. Validate US1 independently with manual accounts, balances, reviewed CSV import, SimpleFIN connection/import, authorization, offline queueing, and retry recovery.
4. Stop for security, durability, browser, cost, and scope review before adding transaction organization and budgets.

### Incremental Delivery

1. **US1**: Accounts, balance history, CSV, and SimpleFIN.
2. **US2**: Transaction trust, classifications, transfers, catalogs, scoped search, and provider reconciliation.
3. **US3**: Flexible multi-account budgets—the complete P1 product slice.
4. **US4–US6**: Reuse/matching, auditable budget reconciliation, and financial tasks.
5. **US7**: Opt-in Finance results in general search.
6. Complete cross-cutting restore, performance, infrastructure, browser, runtime, and operations gates.

### Required Validation Runtime Guardrail

- Keep the required hosted validation target at ten minutes or less; the workflow timeout is only a safety limit.
- Before adding the representative Finance test to `test:e2e:quick`, list the test count and measure `/usr/bin/time -p npm run test:e2e:quick`.
- Repeat both measurements afterward and confirm the hosted PR duration.
- Keep exhaustive browsers, devices, role matrices, provider failures, CSV limits, and reconciliation variants in `npm run test:e2e` and `npm run validate:pre-aws:browsers`.

## Notes

- `[P]` means the task can safely change separate files in parallel at that point in the dependency graph.
- Story labels provide traceability to `spec.md`; Setup, Foundation, and Polish intentionally have no story label.
- Every state-changing workflow includes authorization, expected-version, retry, conflict, recovery, and safe observability tasks.
- Real financial credentials and content are prohibited from fixtures, screenshots, recordings, logs, and test output.
- Update non-obvious comments when invariants, security decisions, or browser workarounds change; do not add comments that only restate code.
