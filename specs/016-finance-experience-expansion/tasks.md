# Tasks: Finance Experience Expansion

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/finance-api.md), and [quickstart.md](quickstart.md).
**Created**: 2026-10-31 (regenerated after four accepted clarifications). **Feature**: 016-finance-experience-expansion. **Status**: Setup T001–T005 complete; cost acceptance PASS with Steve’s explicit approval of a $6.50/month combined Finance ceiling on 2026-10-31. Foundation implementation in progress.

Automated tests are required by the constitution. Task checkboxes track completed work and do not override failed acceptance gates. Measured setup evidence is linked from the validation documents. No feature-016 application behavior or human acceptance is claimed.

## Format and Execution Rules

- Each actionable task has a unique sequential ID, checkbox, exact repository-relative file paths and a story label in story phases. Resolve file paths against the repository root; named new files are intentional implementation targets.
- `[P]` identifies independent test-authoring tasks in separate files within a phase. All phase prerequisites must already be complete; this marker does not authorize starting a dependent phase or editing the same shared file concurrently.
- Write the phase's meaningful tests first and observe failures for the missing behavior before implementing. Test tasks mean author and verify the intended red case, not require passing before the implementation exists. Run and pass them at that story's verification checkpoint.
- Implementation rows execute in their listed order unless an explicit dependency table permits otherwise. Story numbering follows spec IDs, while phase ordering puts all P1 stories before P2 and establishes the Finance PIN boundary first.
- Before expanding any required test command, complete the baseline measurement task. After each test batch, record resulting case counts and relevant command timings; do not defer the first measurement until final integration. A quick spec-file count is not a test-case count.
- Existing uncommitted files and unfinished feature 015 work are dependencies, not permission to reset unrelated work. Any reused path moved by concurrent changes must be resolved to its actual owner and recorded before editing.
- A story checkpoint demonstrates its independent flow using completed prerequisites and fixtures; cross-story destination bodies, account flag/table decorations, receipts and task links receive full integration acceptance in the final phase. A partial demo is never acceptance of unimplemented downstream pages.

## Phase 1: Setup and Existing-Work Baseline

**Goal**: Establish the actual starting point and validation/cost assumptions without resetting existing work.

**Prerequisites**: None. This is an existing application; do not initialize a new project.

**Independent Test / Gate**: Baseline evidence distinguishes existing failures and unfinished 015 work from feature 016 changes.

- [X] T001 Inventory unfinished Finance 015 contracts, routes, repository/sync, attachment and task-link dependencies against `specs/015-finance-budget-management/tasks.md`; record reusable behavior, missing prerequisites and unrelated existing failures in `docs/testing/finance-experience-validation.md` without changing or resetting unrelated files.
- [X] T002 Before adding any test to a required command, record discovered test-case/project counts, Node/runtime context, affected required unit/integration command durations, `/usr/bin/time -p npm run test:e2e:quick` output and existing hosted Validate duration in `docs/testing/finance-experience-validation-runtime.md`; inspect `playwright.quick.config.ts` and `.github/workflows/validate.yml` and preserve the ten-minute target/15-minute timeout headroom.
- [X] T003 Define deterministic users/groups/private/shared/provider accounts, active/inactive/closed/legacy-draft budgets, original entryContext across server/browser/DST/travel and delayed overdue replay, classification/split/refund credit-and-principal capacity and legacy task-link fixture builders in `tests/fixtures/finance/experience.ts`; include independent expected spending values and synthetic data only.
- [X] T004 Replace the assumed $4.55 allocation with a current us-west-2 quantity-by-rate forecast including Finance 015, receipt versions/backup/scanning/ranges, projection writes, KMS/logs/alarms in `docs/operations/finance-experience-cost.md`; document sources, normal retained bytes and headroom without permanent free-tier deductions, and stop higher-cost implementation if the combined forecast exceeds $5 without explicit approval.
- [X] T005 Select and audit bounded OOXML ZIP and legacy OLE inspection dependencies for signatures, VBA/active content/encryption detection and resource limits; record exact versions, licenses, security/runtime compatibility and alternatives in `specs/016-finance-experience-expansion/research.md` before changing `apps/api/package.json` or `package-lock.json`; do not add an Office renderer.

**Checkpoint**: Setup and Existing-Work Baseline is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 2: Foundational Storage, Projection and Compatibility Primitives

**Goal**: Provide bounded, durable building blocks used by all stories.

**Prerequisites**: All Setup tasks. This phase blocks every story; existing 015 gaps required by these primitives must be resolved within the relevant task and recorded.

**Independent Test / Gate**: Shared expense/refund rules pass independent conservation cases before projection parity; bounded cold sparse/empty reads meet actual 2s readiness and exact 10s completion, with migration, safe events and cost gates intact.

- [X] T006 [P] Add indexed read budget, cursor/filter/source-revision binding, contribution reversal and cold sparse/zero-match tests in `tests/integration/finance-experience-read-model.test.ts` and `tests/performance/finance-experience-read-model.test.ts`; assert actual rows/verified full-scope empty <=2s and exact connected count/totals <=10s separately, with no full-scope hydration or progress-only pass.
- [X] T007 [P] Add legacy Finance/task-link and interrupted migration tests in `apps/web/test/db/finance-experience-migration.test.ts` and `tests/contract/finance-experience-version.contract.test.ts`; preserve legacy drafts and immutable original offline entryContext, pending encrypted records and earlier non-Finance clients.
- [X] T008 [P] Add independent positive-expense/negative-linked-refund, credit/original-allocation capacity, posting/transfer/currency and same-allocation filter conservation tests in `packages/domain/src/finance/spend.test.ts` and `packages/domain/src/finance/refund.test.ts`; these must precede every projection/widget/Worker consumer.
- [X] T009 Define ExpenseRefundRelationship, confirmed original-allocation snapshots, same-currency credit/principal capacity invariants, active/removed and pending/review states in `packages/domain/src/finance/refund.ts` and additive schemas in `packages/contracts/src/finance.ts`; one original per refund, multiple partial refunds per expense, no guessed offset from unrelated credit.
- [X] T010 Implement shared expense/refund eligibility, canonical contribution slices, same-allocation dimension predicates and checked integer currency sums in `packages/domain/src/finance/spend.ts`; adapt the dashboard path of `packages/domain/src/finance/budget-totals.ts` to carry posting/provisional/refund state while explicitly preserving historical reconciliation semantics. Projection writers and later consumers must reuse these rules.
- [X] T011 Define shared bounded-query envelopes with separate rowsState/aggregateState/queryId, automatic completion status, original local-date/filter/currency rules, scope/filter/source-revision-bound cursors and safe errors in `packages/contracts/src/finance.ts` and `apps/api/src/finance/query-contract.ts`; default 50/max200 rows and max1,000 examined facts per step, 2s actual results/10s exact totals/1s progress acceptance.
- [ ] T012 Implement purpose-specific key/date/inverted token/check/amount probes, narrowest authorized dimension selection, and touched-record conditional units of work in `apps/api/src/finance/read-repository.ts`, `apps/api/src/finance/unit-of-work.ts` and `apps/api/src/finance/dynamo-repository.ts`; retain canonical versions/idempotency, full-text predicate parity and current source access without whole-scope hydration.
- [ ] T013 Implement transaction/refund-revision contribution facts, reversible account/currency/calendar summaries, dimension references and restartable publication in `apps/api/src/finance/spend-projection-service.ts` and `apps/api/src/finance/read-repository.ts`, consuming Foundation spend predicates. Add owner-only expiring query jobs/automatic max-five-partition completion in `apps/api/src/finance/query-job-service.ts`; pin selected account/refund-source revision vectors, recheck authorization/grant at delivery and finish exact totals without user pagination.
- [X] T014 Reserve the next available compatible capability (planned sync v8/Finance v2, recheck concurrent work) and additive entity/command envelopes including refund relations, budget activity and immutable entryContext in `packages/domain/src/sync.ts`, `packages/contracts/src/finance.ts` and `apps/api/src/sync/types.ts`; retain legacy adapters and gate old protected Finance hydration.
- [X] T015 Add the next unused Dexie migration and encrypted metadata/pending-byte/offline-security stores in `apps/web/src/db/database.ts`, `apps/web/src/db/schema.ts` and `apps/web/src/db/finance-repository.ts`; preserve existing device keys/outbox, use empty legacy defaults and reject quota failures before claiming bytes were queued.
- [ ] T016 Extend redacted structured Finance events, correlation/error categories and projection-lag/invariant metrics in `apps/api/src/finance/telemetry.ts` and `packages/observability/src/redaction.ts`; exclude credentials/grants/filenames/financial values and test exclusions in `tests/security/finance-experience-observability.security.test.ts`.
- [ ] T017 Wire existing-function routes, trusted asynchronous Finance query-worker dispatch, owner-only checkpoint access, least-privilege table/media prefixes, retention/alarms and backup coverage in `infra/lib/api-stack.ts`, `infra/lib/observability-stack.ts` and `infra/lib/backup-stack.ts`, with assertions in `infra/test/finance-experience-infrastructure.test.ts`; preserve import-only connection decryption/auth-only pepper access and never let user input select an internal bypass envelope.
- [ ] T018 Run bounded indexed cold/warm/sparse/zero-match feasibility, Foundation parity/migration/infra tests and current cost forecast; record actual rows/verified-empty <=2s p95, exact connected counts/totals <=10s p95, separate <=1s progress, rows/calls and automatic query completion in `docs/testing/finance-experience-validation.md`; improve indexes/concurrency before stories if either deadline or the approved $6.50 gate fails.

**Checkpoint**: Foundational Storage, Projection and Compatibility Primitives is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 3: User Story 2 — Protect Finance with My Own PIN (Priority: P1)

**Goal**: Establish the full Finance access boundary before exposing new routes and embedded views.

**Prerequisites**: Foundation. No other story is required; test existing Finance routes and synthetic embedded/receipt targets.

**Independent Test / Gate**: Enable a separate PIN, exercise all entry paths and five-failure delays, reset using the current password without losing pending data, and prove admin/password-reset boundaries.


### Tests — write first

- [ ] T019 [P] [US2] Add self-only password-verified enrollment/change/reset/requirement and opaque grant/epoch/revision contract tests in `tests/contract/finance-pin.contract.test.ts`; reject targetUserId, weak/mismatched PINs and responses containing verifiers.
- [ ] T020 [P] [US2] Add admin denial, password reset preserving Finance PIN, stale authorizer/grant, generic Finance/sync/attachment bypass and >=30-second fifth-failure tests in `tests/security/finance-pin.security.test.ts`.
- [ ] T021 [P] [US2] Add offline verifier/missing-material/throttle, forgotten-PIN pending-data survival, history restoration and cross-tab lock lifecycle tests in `apps/web/test/features/finance-lock.test.tsx`.
- [ ] T022 [P] [US2] Add representative Chromium/WebKit password-enrollment/unlock/direct-link/cancel/relock/offline journeys in `tests/e2e/finance-pin.spec.ts`; retain these in full browser validation unless the measured quick budget explicitly permits selection.

### Implementation and Verification

- [ ] T023 [US2] Implement user-only separate security/verifier, random hashed grant and durable throttle records in `apps/api/src/auth/finance-security-repository.ts`; bind grant to user/session/epoch/revision/tab, enforce maximum 30-minute/session expiry and exponential 30-second-to-30-minute failure delays.
- [ ] T024 [US2] Implement current-password verification using canonical pepperVersion and existing Argon2id for all PIN/requirement management in `apps/api/src/auth/finance-security-service.ts`; keep Journal/recovery PINs separate and expose no administrative target-user operation.
- [ ] T025 [US2] Add the `/auth/finance-security` and `/auth/finance-unlocks` methods from the API contract in `apps/api/src/auth/handlers.ts` and `infra/lib/api-stack.ts`; enforce mutation security/no-store, grant revocation and safe audit outcomes without broadening Finance password-secret permissions.
- [ ] T026 [US2] Implement current session/epoch/security-revision Finance gate validation in `apps/api/src/finance/finance-unlock-guard.ts` and `apps/api/src/shared/security.ts`; attach to Finance, query-job result/status, generic attachment/sync and task-derived reads with no stale cache/admin bypass, while trusted background computation cannot deliver data to a locked client.
- [ ] T027 [US2] Implement independent Finance delivery checkpoints, protected pull/replay gating and legacy-client locked/upgrade behavior in `apps/api/src/sync/handlers.ts`, `apps/api/src/sync/sync-service.ts` and `apps/api/src/sync/change-feed-repository.ts`; keep general task sync progressing without acknowledging undisclosed Finance events.
- [ ] T028 [US2] Implement the per-tab memory-only grant/access controller and worker-derived offline verifier in `apps/web/src/features/finance/security/finance-access-controller.ts` and `apps/web/src/crypto/finance-pin.worker.ts`; persist local throttling, fail closed on missing/known-stale state and preserve encrypted pending records during reset.
- [ ] T029 [US2] Route Finance decrypt/cache/search/embedded reads, request headers, signout/history/bfcache/expiry and reconnect revision checks through the controller in `apps/web/src/db/finance-repository.ts`, `apps/web/src/features/finance/finance-client.ts`, `apps/web/src/features/auth/sign-out.ts`, `apps/web/src/search/finance-index.ts` and `apps/web/src/sync/finance-sync.ts`; abort requests/workers and clear plaintext/Blob URLs on lock.
- [ ] T030 [US2] Build password-verified Require PIN/set/reset controls and intended-destination unlock/lock UI in `apps/web/src/features/auth/FinanceSecuritySettings.tsx` and `apps/web/src/features/finance/security/FinanceUnlock.tsx`; integrate `apps/web/src/features/profile/SecuritySettings.tsx` and `apps/web/src/features/profile/ProfilePage.tsx` and in-place embedded unlock without blocking ordinary tasks.
- [ ] T031 [US2] Preserve Finance PIN state while invalidating grants after user/admin password reset, requirement changes and session revocation in `apps/api/src/auth/password-reset-service.ts`, `apps/api/src/auth/user-repository.ts` and `apps/api/src/admin/user-admin-service.ts`; verify connected-session invalidation before replay.
- [ ] T032 [US2] Run the story contract/security/component/browser checks and record online/offline reset, cached-key boundary and disconnected-device limits in `docs/testing/finance-experience-validation.md`; any ungated production entry path blocks this checkpoint.

**Checkpoint**: Protect Finance with My Own PIN is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 4: User Story 1 — Navigate Finance and Manage Accounts (Priority: P1)

**Goal**: Provide authoritative Finance navigation, dedicated financial-account creation and readable account layout.

**Prerequisites**: Foundation and US2. Existing 015 transaction/catalog/budget pages provide baseline destinations; downstream stories replace/complete their enhanced bodies, not a second navigation state.

**Independent Test / Gate**: Verify primary order and authorized Admin, open the empty Finance dashboard, create/reopen an account and inspect account sections on phone and desktop.


### Tests — write first

- [ ] T033 [P] [US1] Add parse/serialize/new-before-ID/history and primary/dropdown order tests in `apps/web/test/features/finance-navigation.test.tsx`, covering direct entry and preserved secondary app tools.
- [ ] T034 [P] [US1] Add Chromium/WebKit new-account validation, retained form input, account layout and keyboard/touch navigation tests in `tests/e2e/finance-account-navigation.spec.ts` using an empty-dashboard fixture.

### Implementation and Verification

- [ ] T035 [US1] Extend route union/parser/serializer and protected route dispatch in `apps/web/src/app/router.tsx` and `apps/web/src/features/finance/FinanceLandingPage.tsx` for every contracted Finance destination and modal background; remove competing local subview routing.
- [ ] T036 [US1] Order primary navigation Tasks/Lists/Finance/Journal/Search/Admin and build the accessible Finance dropdown in `apps/web/src/app/App.tsx` and `apps/web/src/components/FinanceNavigation.tsx`; keep existing secondary tools and admin authorization.
- [ ] T037 [US1] Extract a dedicated financial-account creation page in `apps/web/src/features/finance/accounts/FinanceAccountCreatePage.tsx` and update `apps/web/src/features/finance/accounts/FinanceAccountsPage.tsx`; preserve required names/ownership/provider setup and navigate to the saved account after success.
- [ ] T038 [US1] Refactor `apps/web/src/features/finance/accounts/FinanceAccountDetail.tsx` and `apps/web/src/styles/app.css` into labeled summary/balance/freshness, primary actions, editing forms, scoped transaction content and destructive sections without page-wide phone scrolling; retain actual existing controls until their enhanced story connects.
- [ ] T039 [US1] Create the guarded dashboard page composition and truthful empty/freshness/error states in `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx`; reuse actual existing account data, keep widget interfaces ready for US7/US8 and do not present mock balances or fake success.
- [ ] T040 [US1] Introduce and apply a shared >=5px adjacent button/button and button/text-entry gap in `apps/web/src/styles/app.css` and affected existing task/list/journal/search/admin form wrappers; preserve wrapped layouts and touch target sizing, with full-app measured audit scheduled in final validation.
- [ ] T041 [US1] Preserve per-connection SimpleFIN setup under account workflows in `apps/web/src/features/finance/accounts/SimplefinConnectionPanel.tsx`; document repository evidence that application-wide Admin setup is unnecessary in `docs/operations/finance-experience.md`, and run navigation/account tests with no invented global credential UI.

**Checkpoint**: Navigate Finance and Manage Accounts is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 5: User Story 4 — Record Payment Details and Classify Spending (Priority: P1)

**Goal**: Persist payment/classification/merchant corrections and authoritative linked full/partial expense refunds under current source permissions.

**Prerequisites**: Foundation, US2 and US1 route integration. No enhanced transaction table/report is needed; use existing transaction detail/edit flow and direct catalog routes.

**Independent Test / Gate**: Round-trip check/payment/classifications and permitted merchant edits, then link/correct/remove a partial refund using confirmed original associations on its received date without double offsets.


### Tests — write first

- [ ] T042 [P] [US4] Add payment/check normalization, category cycle/depth/duplicate/history and invalid allocation pairing tests in `packages/domain/src/finance/transaction-metadata.test.ts` and `packages/domain/src/finance/subcategory.test.ts`.
- [ ] T043 [P] [US4] Add merchant collision/creator-admin authorization and provider-refresh preservation tests in `tests/integration/finance-classification-editing.test.ts` and `tests/security/finance-catalog-editing.security.test.ts`.
- [ ] T044 [P] [US4] Add Chromium/WebKit payment/check, category/subcategory, authorized merchant editing and explicit original-expense refund link/partial split confirmation/correct/remove journeys in `tests/e2e/finance-classification-editing.spec.ts`; prove received-date reporting and no guessed refund from unlinked credit.
- [ ] T045 [P] [US4] Add linked-refund get/put/delete contracts, source/capacity version and explicit partial-allocation confirmation tests in `tests/contract/finance-refunds.contract.test.ts`; original associations default safely, received date remains authoritative and unlinked credits offset nothing.
- [ ] T046 [P] [US4] Add refund/original access intersection, same-currency cross-account, credit/principal capacity race, retry/unlink/relink, original recategorization snapshots and provider-review correction tests in `tests/integration/finance-refunds.test.ts` and `tests/security/finance-refunds.security.test.ts`.

### Implementation and Verification

- [ ] T047 [US4] Extend user-owned paymentType/checkNumber and source correction semantics in `packages/domain/src/finance/transaction.ts` and request/response schemas in `packages/contracts/src/finance.ts`; preserve unknown legacy values, leading zeros and optional check numbers.
- [ ] T048 [US4] Extend categories/allocations/budget items with one-level children, parent-scoped uniqueness locks and historical classification associations in `packages/domain/src/finance/category.ts`, `packages/domain/src/finance/allocation.ts`, `packages/domain/src/finance/budget.ts` and `apps/api/src/finance/repository.ts`; reject invalid cycles/reparenting rather than rewriting history.
- [ ] T049 [US4] Implement versioned merchant editing/canonical collision checks and explicit imported-entry admin-only handling in `packages/domain/src/finance/merchant.ts`, `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/handlers.ts`; preserve source descriptions and identity.
- [ ] T050 [US4] Persist metadata/historical allocation paths and invalidate or retain explicit confirmed refund snapshots through API writes/provider corrections in `apps/api/src/finance/transaction-service.ts`, `apps/api/src/finance/provider-reconciliation-service.ts` and `apps/api/src/finance/spend-projection-service.ts`; consume shared spend predicates and surface claim/source conflicts without obsolete exact totals.
- [ ] T051 [US4] Implement versioned ExpenseRefundRelationship/capacity storage and get/put/delete APIs in `apps/api/src/finance/refund-service.ts`, `apps/api/src/finance/refund-repository.ts` and `apps/api/src/finance/handlers.ts`; enforce refund edit plus original/association read access, preserve excess credit unlinked and atomic release/reclaim on correction without altering source amounts/dates.
- [ ] T052 [US4] Provide the dedicated Categories page and parent/child selection, merchant edit form and payment/check editor in `apps/web/src/features/finance/catalog/FinanceCategoriesPage.tsx`, `apps/web/src/features/finance/catalog/FinanceCategoryManager.tsx`, `apps/web/src/features/finance/catalog/FinanceMerchantDetail.tsx` and `apps/web/src/features/finance/transactions/TransactionDetail.tsx`.
- [ ] T053 [US4] Build source-authorized original expense lookup, full default and explicit partial split refund allocation confirmation/correct/remove UI in `apps/web/src/features/finance/transactions/RefundRelationshipEditor.tsx` and `apps/web/src/features/finance/transactions/TransactionDetail.tsx`; retain received-date identity and show pending/review/conflict state without exposing inaccessible source references.
- [ ] T054 [US4] Extend encrypted catalog/transaction/budget-item hydration and queued edits in `apps/web/src/sync/finance-sync.ts` and `apps/web/src/db/finance-repository.ts`; keep global catalog identity separate from protected usage and preserve pending legacy data.
- [ ] T055 [US4] Add protected refund proposals/recipient-filtered feeds, source correction and alias reconciliation hooks, contribution reversals and capacity/revocation cleanup in `apps/web/src/sync/finance-sync.ts`, `apps/api/src/sync/sync-service.ts` and `apps/api/src/finance/provider-reconciliation-service.ts`; preserve confirmed snapshots and never keep incompatible source claims in exact totals.
- [ ] T056 [US4] Run metadata/catalog/refund domain/contract/integration/security/browser checks including offline retry, original recategorization snapshots, partial split and later-period cross-account refunds, competing principal claims and canonical alias correction; record outcomes in `docs/testing/finance-experience-validation.md` before dashboard/report consumers rely on the fields.

**Checkpoint**: Record Payment Details and Classify Spending is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 6: User Story 5 — Save Budgets Using Existing Groups (Priority: P1)

**Goal**: Save new budgets immediately active with existing group choices, reversible activity controls and independent closure/reconciliation.

**Prerequisites**: Foundation, US2 and US1. Existing 015 budget validation remains the baseline; no Upcoming Expense or dashboard data is required.

**Independent Test / Gate**: Save an immediately usable account-less budget for a real group, deactivate/reactivate without losing flags/history/links, preserve separate closure and legacy drafts, and deny revoked membership safely.


### Tests — write first

- [ ] T057 [P] [US5] Add active-on-save with no-account group, named membership choices, deactivation/reactivation preserving links/flags/history, closed-plus-inactive reactivation staying closed, legacy-draft mapping and retained input on revoked-save tests in `tests/integration/finance-budget-group-selection.test.ts` and `apps/web/test/features/finance-budget-groups.test.tsx`.
- [ ] T058 [P] [US5] Add Chromium/WebKit new active budget, Deactivate/Reactivate, optional legacy Save as active, empty-account group, no-eligible membership and existing upcoming-link preservation journeys in `tests/e2e/finance-budget-group-selection.spec.ts`.

### Implementation and Verification

- [ ] T059 [US5] Implement active-on-confirmed-create status/activity, independent activityChangedAt/by, versioned deactivation/reactivation and separate closedAt/closedBy/reconciliation invariants in `packages/domain/src/finance/budget.ts`, `apps/api/src/finance/budget-service.ts` and `packages/contracts/src/finance.ts`; preserve legacy drafts during migration and expose explicit Save as active without silently reopening archived/closed records.
- [ ] T060 [US5] Save ordinary budgets immediately active with no required account association, recheck actual memberships and expose versioned deactivate/reactivate/close/reopen plus legacy-draft Save as active in `apps/api/src/finance/budget-service.ts` and `apps/api/src/finance/handlers.ts`; inactive/closed budgets reject new/reassigned upcoming associations but preserve management of existing links.
- [ ] T061 [US5] Replace account-derived group IDs with `listLocalGroups()`/active membership and display names in `apps/web/src/features/finance/budgets/FinanceBudgetsPage.tsx` and `apps/web/src/features/finance/budgets/ReusableItemsPage.tsx`; distinguish loading/error/no-eligible groups and preserve unsaved fields.
- [ ] T062 [US5] Expose distinct active/inactive Deactivate/Reactivate and Close/Reopen controls, legacy-draft Save as active and queued conflict-aware activity updates in `apps/web/src/features/finance/budgets/FinanceBudgetDetail.tsx` and `apps/web/src/sync/finance-sync.ts`; preserve flags/history/links and keep current membership authoritative.
- [ ] T063 [US5] Run group/activity/closure migration and browser tests, record immediate usability of new budgets, deactivation effects on new versus existing expense associations, reactivation preserving separate closure, no-account save and offline membership conflicts in `docs/testing/finance-experience-validation.md`.

**Checkpoint**: Save Budgets Using Existing Groups is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 7: User Story 10 — Manually Add a Transaction to Any Account (Priority: P1)

**Goal**: Expose reliable manual entry on every account the user may edit.

**Prerequisites**: Foundation, US2, US1 and US4; existing 015 provider reconciliation is required. US3 enhanced filters are not a dependency.

**Independent Test / Gate**: Save one transaction under each editable account source/type, show SimpleFIN provisional state, and reconcile later without duplicate spending or lost relationships.


### Tests — write first

- [ ] T064 [P] [US10] Add all-source/type/manual-snapshot/provisional/denied-save and retry tests in `tests/integration/finance-all-account-manual-entry.test.ts`; cover stable canonical IDs and source/user ownership.
- [ ] T065 [P] [US10] Add account-context and global Transactions Add Transaction Chromium/WebKit journeys, invalid input retention and offline queue tests in `tests/e2e/finance-all-account-manual-entry.spec.ts`.

### Implementation and Verification

- [ ] T066 [US10] Make the canonical account transaction creation path accept every permitted account type/source with targeted conditional writes in `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/handlers.ts`; enforce current edit access, required date/amount/direction/currency and idempotency.
- [ ] T067 [US10] Preserve user payment/classification metadata, accepted refund relations/capacity and canonical source references on provisional/provider merges in `apps/api/src/finance/provider-reconciliation-service.ts` and `packages/domain/src/finance/provider-reconciliation.ts`; retain stable original/refund IDs and extension hooks for receipt/task/fulfillment references without altering provider balances.
- [ ] T068 [US10] Build reusable manual transaction entry with account preselection and all optional metadata in `apps/web/src/features/finance/transactions/ManualTransactionForm.tsx`; show provisional status, exact currency amounts and actionable field errors.
- [ ] T069 [US10] Connect Add Transaction to all editable account details and the dedicated Transactions page in `apps/web/src/features/finance/accounts/FinanceAccountDetail.tsx` and `apps/web/src/features/finance/transactions/FinanceTransactionsPage.tsx`; invalidate/update real lists once after success.
- [ ] T070 [US10] Queue and replay manual transactions through existing encrypted outbox/Finance gate in `apps/web/src/db/finance-repository.ts` and `apps/web/src/sync/finance-sync.ts`; retain rejected input and never expose a pending observation as a posted provider payment.
- [ ] T071 [US10] Run all-source balance/provisional/retry/offline checks and record canonical-provider reconciliation results in `docs/testing/finance-experience-validation.md`; validate the existing receipt/task relationship preservation fixture when downstream consumers are added.

**Checkpoint**: Manually Add a Transaction to Any Account is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 8: User Story 3 — Inspect Transactions from an Account (Priority: P1)

**Goal**: Provide bounded account/global transaction tables, combined filters and navigable transaction modals with budget-page links.

**Prerequisites**: Foundation, US2, US1 and US4. US10 supplies real manual-entry UI in the default execution order but seeded existing transactions suffice for this story test.

**Independent Test / Gate**: Filter seeded transactions by every supported dimension, open a row, restore table state on close and follow each accessible budget to a full page.


### Tests — write first

- [ ] T072 [P] [US3] Add signed amount/date/timezone/account/check/text filter, cursor/source-revision binding, authorized budget/refund references and independent row-ready/aggregate-exact state contracts in `tests/contract/finance-transaction-browsing.contract.test.ts`; empty intermediate pages and progress do not count as results.
- [ ] T073 [P] [US3] Add bounded account/multi-account lookup, unauthorized linked metadata suppression, cold sparse/zero-match actual result <=2s and exact count/totals <=10s tests in `tests/integration/finance-transaction-browsing.test.ts`; no unverified zero count from the first page.
- [ ] T074 [P] [US3] Add Chromium/WebKit direct-entry modal, combined filters/reset, back/forward, scroll/focus restoration and full-page budget navigation journeys in `tests/e2e/finance-transaction-browsing.spec.ts`.

### Implementation and Verification

- [ ] T075 [US3] Implement filtered account/global transaction queries, separate row/aggregate readiness and authorized detail/budget/refund projections in `apps/api/src/finance/transaction-query-service.ts`, `apps/api/src/finance/read-repository.ts` and `apps/api/src/finance/handlers.ts`; actual rows/verified empty <=2s, exact connected counts/totals <=10s through automatic completion and bound cursors/source access before counts.
- [ ] T076 [US3] Move progressive Finance text/filter indexing to a memory-only Worker in `apps/web/src/search/finance-index.worker.ts` and `apps/web/src/search/finance-index.ts`; expose cancellation/coverage and clear the worker on lock/revocation.
- [ ] T077 [US3] Build shared responsive transaction table and combined text/date/amount/account-name/check controls in `apps/web/src/features/finance/transactions/TransactionTable.tsx` and `apps/web/src/features/finance/transactions/TransactionFilters.tsx`; include all contracted columns and correct empty/failed/pending states.
- [ ] T078 [US3] Mount the account-scoped table below account summary and the multi-account table on Transactions in `apps/web/src/features/finance/accounts/FinanceAccountDetail.tsx` and `apps/web/src/features/finance/transactions/FinanceTransactionsPage.tsx`; preserve URL/filter state and never broaden account detail scope.
- [ ] T079 [US3] Implement route-driven transaction modal/detail and accessible linked-budget navigation in `apps/web/src/features/finance/transactions/TransactionModal.tsx`, `apps/web/src/features/finance/transactions/TransactionDetail.tsx` and `apps/web/src/app/router.tsx`; use Transactions fallback on direct entry and full pages for budgets.
- [ ] T080 [US3] Provide authorized encrypted-cache table/filter fallback with visible freshness/coverage in `apps/web/src/features/finance/transactions/transaction-query.ts`; distinguish incomplete local results from exact full counts and retain filters across reconnect.
- [ ] T081 [US3] Run query/worker/modal/browser checks and record no full-scope hydration and supported narrow-screen behavior in `docs/testing/finance-experience-validation.md`; keep actual receipt/task decorations extensible for their owning stories.

**Checkpoint**: Inspect Transactions from an Account is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 9: User Story 11 — Enter and Manage Upcoming Expenses (Priority: P1)

**Goal**: Create future obligations with immutable original local entry context, keep dates on late offline synchronization and track explicit payment fulfillment under current budget activity.

**Prerequisites**: Foundation, US2, US1, US5 and US10. US3 supplies transaction selection/modal integration in the default order. US7 richer flags/widgets are not required to show the basic canonical upcoming list.

**Independent Test / Gate**: Create against active budget, sync late across zones unchanged as overdue, manage existing inactive-budget links, and link/reverse partial/full payments without changing expected money into actual spending.


### Tests — write first

- [ ] T082 [P] [US11] Add required original-browser future date and immutable enteredAt/localDate/IANA zone context, delayed-overdue replay, DST/travel, positive amount/reference eligibility, due-today/overdue/cancelled/paid/overpaid and planned-source identity tests in `packages/domain/src/finance/upcoming-expense.test.ts`.
- [ ] T083 [P] [US11] Add claim concurrency/unlink/provider alias and budget deactivate-between-entry-and-sync tests in `tests/integration/finance-expense-fulfillment.test.ts` and `tests/security/finance-upcoming-expenses.security.test.ts`; existing unchanged associations remain manageable while new inactive-budget selections fail under current rights.
- [ ] T084 [P] [US11] Add Chromium/WebKit original-context create, delayed offline sync becoming overdue with unchanged dueDate across zones, inactive-budget selector/existing-association handling, reschedule/cancel/dashboard and partial/full payment journeys in `tests/e2e/finance-upcoming-expenses.spec.ts`.

### Implementation and Verification

- [ ] T085 [US11] Define UpcomingExpense/fulfillment validation with immutable entryContext, distinct reschedule contexts, dueDate > original localDate, active/open eligibility for new/reassigned budget links, no-actual-money effects and typed plannedSource in `packages/domain/src/finance/upcoming-expense.ts`, `packages/domain/src/finance/expense-fulfillment.ts` and `packages/contracts/src/finance.ts`; never use reconnect today for creation validity.
- [ ] T086 [US11] Implement canonical records, account/due indexes, source occurrence uniqueness, immutable history and transactional claim-ledger writes in `apps/api/src/finance/upcoming-expense-repository.ts`; condition on expense, transaction and claim versions and preserve legacy source aliases.
- [ ] T087 [US11] Implement expense/fulfillment endpoints and current account/budget/group intersection checks in `apps/api/src/finance/upcoming-expense-service.ts` and `apps/api/src/finance/handlers.ts`; accept an otherwise valid delayed original date as overdue, preserve entryContext on retry/ordinary edits, validate explicit reschedule context separately, and reject inactive budget only for new/reassigned association.
- [ ] T088 [US11] Recompute accepted claims on posting, amount correction, transfer/reversal/unmatch/provider reconciliation in `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/provider-reconciliation-service.ts`; never overstate paid status and never double-count actual spending or planned budget totals.
- [ ] T089 [US11] Add intersection-filtered expense/fulfillment owner projections and revocation tombstones in `apps/api/src/sync/sync-service.ts` and `apps/api/src/finance/upcoming-expense-service.ts`; do not distribute private account metadata to a blanket group audience.
- [ ] T090 [US11] Build upcoming list/create/detail/fulfillment and reference guidance in `apps/web/src/features/finance/upcoming/UpcomingExpensesPage.tsx`, `apps/web/src/features/finance/upcoming/UpcomingExpenseForm.tsx` and `apps/web/src/features/finance/upcoming/UpcomingExpenseDetail.tsx`; capture immutable browser-local entryContext on original confirmation, keep date-only dueDate across travel and wire account/dashboard actions.
- [ ] T091 [US11] Connect the canonical unpaid upcoming query and separate overdue list to `apps/web/src/features/finance/dashboard/UpcomingExpensesWidget.tsx` and `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx`; avoid duplicate planned sources, exclude paid/cancelled and keep default next ten without requiring US7 flags.
- [ ] T092 [US11] Preserve original entryContext and mutation identity through encrypted upcoming/claim outbox, replay and restore in `apps/web/src/sync/finance-sync.ts` and `apps/web/src/db/finance-repository.ts`; late sync alone cannot reject/move dates, while current permissions/capacity/reference conflicts remain recoverable and offline payment proposals are not final paid state.
- [ ] T093 [US11] Run domain/claim/access/browser/offline tests and record delayed date preservation, original browser/server time-zone boundaries, inactive-budget current-versus-existing relationships, competing payments and canonical dashboard identity in `docs/testing/finance-experience-validation.md`; planning alone changes neither balances nor posted Spend.

**Checkpoint**: Enter and Manage Upcoming Expenses is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 10: User Story 6 — Attach and Find Receipts (Priority: P2)

**Goal**: Add safe private receipts to every editable transaction and a filterable browser with verified preview/download.

**Prerequisites**: Foundation, US2, US1, US3 and US4. Existing private S3/KMS/scan/backup lifecycle must be available; no task or dashboard widget dependency.

**Independent Test / Gate**: Upload each supported boundary-format receipt, find it by combined filters, view/download original bytes and deny access after lock/revocation or through generic attachment routes.


### Tests — write first

- [ ] T094 [P] [US6] Add exact 1–10,000,000-byte/eight-extension, signature/content mismatch, Office VBA/encryption, active PDF and bounded decompression tests in `tests/unit/finance-receipt-policy.test.ts` using generated fixtures under `tests/fixtures/finance/receipts/`.
- [ ] T095 [P] [US6] Add upload/dual-check/version-pinning, generic-route denial, range/ETag/revoked-second-chunk, source access and safe error contracts in `tests/security/finance-receipts.security.test.ts` and `tests/contract/finance-receipts.contract.test.ts`.
- [ ] T096 [P] [US6] Add interrupted/retried/cancelled upload, no duplicate attachment, durable local byte/quota failure and retained-version recovery tests in `tests/integration/finance-receipts.test.ts` and `apps/web/test/db/finance-receipt-bytes.test.ts`.
- [ ] T097 [P] [US6] Add Chromium/WebKit transaction attachment, browser filters, supported preview/Office fallback and lock-during-transfer journeys in `tests/e2e/finance-receipts.spec.ts`.

### Implementation and Verification

- [ ] T098 [US6] Add explicit financeTransaction parent and receipt policy/lifecycle schemas to `packages/domain/src/attachment.ts`, `packages/contracts/src/finance.ts` and `apps/api/src/attachments/file-policy.ts`; retain unrelated attachment policy and avoid the generic ten-file cap.
- [ ] T099 [US6] Extend parent authorization/audience/metadata and generic-route dispatch in `apps/api/src/attachments/attachment-authorization.ts`, `apps/api/src/attachments/attachment-audience.ts`, `apps/api/src/attachments/handlers.ts` and `apps/api/src/attachments/download-service.ts`; require current Finance grant/source access and never fall through to list-item policy or signed GET for receipts.
- [ ] T100 [US6] Implement Finance upload/initiate/complete/retry/cancel using immutable version/checksum and idempotent receipt identity in `apps/api/src/attachments/upload-service.ts`, `apps/api/src/attachments/completion-service.ts` and `apps/api/src/finance/receipt-service.ts`; fail safely on lost permissions or abandoned upload.
- [ ] T101 [US6] Implement bounded actual-format and active-content inspection with the reviewed dependencies in `apps/api/src/attachments/receipt-policy-checker.ts`; reject uninspectable encrypted/corrupt files, >50MB expanded data, >1,000 entries, >depth2 nesting or >5-second checks without executing document content.
- [ ] T102 [US6] Require matching policy-clean AND malware-clean for the same object version before availability in `apps/api/src/attachments/scan-result-handler.ts`, `apps/api/src/attachments/reconciliation-handler.ts` and `infra/lib/media-stack.ts`; add stalled/failed-check metrics/alerts without granting public media read access.
- [ ] T103 [US6] Implement same-origin <=1MiB authenticated single-range byte responses in `apps/api/src/attachments/receipt-content-service.ts` and wire `infra/lib/api-stack.ts`; enforce per-chunk session/grant/source/clean-version checks, If-Match, 206/412/416, no-store/nosniff and no S3 GET redirects.
- [ ] T104 [US6] Implement bounded deduplicated receipt metadata/browser queries by transaction date, budget, historical category/subcategory and merchant in `apps/api/src/finance/receipt-query-service.ts`, `apps/api/src/finance/read-repository.ts` and `apps/api/src/finance/handlers.ts`; apply source permissions before counts or relationship labels.
- [ ] T105 [US6] Implement protected durable receipt byte storage, visible pending/upload/check/retry/cancel state and reconnect upload orchestration in `apps/web/src/db/finance-receipt-repository.ts` and `apps/web/src/features/finance/receipts/receipt-client.ts`; never queue a vanished File handle or place bytes in ordinary sync records.
- [ ] T106 [US6] Build transaction receipt list/uploader and Receipts page in `apps/web/src/features/finance/receipts/TransactionReceipts.tsx` and `apps/web/src/features/finance/receipts/FinanceReceiptsPage.tsx`; assemble checksum-verified capped Blob downloads, provide PDF/image preview and Office fallback, and revoke Blob URLs/abort transfers on lock.
- [ ] T107 [US6] Extend transaction reference retention/orphan cleanup and exact-version backup/restore validation in `apps/api/src/attachments/retention-service.ts`, `apps/api/src/attachments/deletion-service.ts`, `infra/lib/backup-stack.ts` and `tests/restore/finance-receipts-restore.test.ts`; never purge receipts because a related task completed.
- [ ] T108 [US6] Run receipt policy/security/lifecycle/browser/restore checks, confirm generic-route denial and original byte hashes, and record scan/check latency, offline quota handling and cost inputs in `docs/testing/finance-experience-validation.md`.

**Checkpoint**: Attach and Find Receipts is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 11: User Story 12 — Connect Tasks and Post-its to Expenses (Priority: P2)

**Goal**: Provide two-way task creation/link selection and optional protected upcoming-expense displays.

**Prerequisites**: Foundation, US2, US1, US3, US10 and US11. US6 is not needed except the final provider-merge preservation regression.

**Independent Test / Gate**: Create a task from either expense type, link normal task creation/editing to multiple financial targets, toggle task/post-it display and prove task completion never pays an expense or exposes it to an unauthorized viewer.


### Tests — write first

- [ ] T109 [P] [US12] Add target-union/legacy budget-item adapter, unique multi-link/query/create-with-link and idempotent partial-success contracts in `tests/contract/finance-expense-task-links.contract.test.ts`.
- [ ] T110 [P] [US12] Add task/source intersection, private-account/shared-task, export/notification/search exclusion and task completion/deletion no-financial-side-effect tests in `tests/security/finance-expense-task-links.security.test.ts` and `tests/integration/finance-expense-task-links.test.ts`.
- [ ] T111 [P] [US12] Add Chromium/WebKit Add Task/cancel, task-form selector/multiple links, reverse navigation, optional task/post-it fields and embedded unlock journeys in `tests/e2e/finance-expense-task-links.spec.ts`.
- [ ] T112 [P] [US12] Add optional-column/post-it preference, multi-target batching and locked/unauthorized display tests in `apps/web/test/features/finance-task-expense-display.test.tsx`; verify task completion never mutates source payment state.

### Implementation and Verification

- [ ] T113 [US12] Generalize FinancialTaskLink to budgetItem/transaction/upcomingExpense targets while retaining old IDs/history through adapters in `packages/domain/src/finance/task-link.ts` and `packages/contracts/src/finance.ts`; introduce pair uniqueness and forward/reverse references.
- [ ] T114 [US12] Implement independently authorized array/batch relationship reads, link/unlink and reverse task lookup in `apps/api/src/finance/task-link-service.ts` and `apps/api/src/finance/read-repository.ts`; cap visible task batch at 50, avoid per-row full scans and hide inaccessible link counts/IDs.
- [ ] T115 [US12] Implement confirmed normal-task creation with preselected Finance relation and atomic task/link receipt or explicit taskCreated/linkPending retry in `apps/api/src/finance/task-link-service.ts` and task mutation handlers in `apps/api/src/tasks/handlers.ts`; use generic default labels and preserve task sharing choices.
- [ ] T116 [US12] Expose transaction/upcoming Add Task, task finance-links CRUD/query and task create/edit financeLinkSelections in `apps/api/src/finance/handlers.ts`, `apps/api/src/tasks/handlers.ts` and `infra/lib/api-stack.ts`; replay only a missing link after partial success.
- [ ] T117 [US12] Build an optional type/search/multiple-target picker and preselected Add Task flow in `apps/web/src/features/tasks/FinanceItemPicker.tsx`, `apps/web/src/features/tasks/TaskForm.tsx`, `apps/web/src/features/tasks/TaskComposer.tsx` and `apps/web/src/features/finance/budgets/CreateFinancialTask.tsx`; cancelling creates neither relation nor task and ordinary tasks need no Finance unlock.
- [ ] T118 [US12] Add visible Add Task and authorized related-task/target navigation to `apps/web/src/features/finance/transactions/TransactionDetail.tsx`, `apps/web/src/features/finance/upcoming/UpcomingExpenseDetail.tsx` and `apps/web/src/features/tasks/FinancialTaskLink.tsx`; use the normal task form rather than a second task editor.
- [ ] T119 [US12] Add default-off Upcoming Expenses task column using existing preference behavior in `apps/web/src/features/tasks/TaskColumnSettings.tsx`, `apps/web/src/features/tasks/TaskRow.tsx`, `apps/web/src/features/tasks/TaskList.tsx` and `apps/web/src/features/tasks/TaskListPage.tsx`; batch visible-row projections, distinguish multiple records and keep neutral unauthorized/locked display.
- [ ] T120 [US12] Add default-off Upcoming Expenses details through `apps/web/src/features/postit/PostItFieldSettings.tsx`, `apps/web/src/features/postit/PostItBoard.tsx` and `apps/web/src/features/postit/PostItNote.tsx`; preserve existing per-user/layout preference behavior, batch visible target reads and expose in-place unlock only for authorized viewers.
- [ ] T121 [US12] Extend encrypted relationship migration/outbox/feed projections and source/task revocation in `apps/web/src/sync/finance-sync.ts` and `apps/api/src/sync/sync-service.ts`; keep financial target metadata out of ordinary shared task/export/notification/search serialization.
- [ ] T122 [US12] Preserve receipt/task/fulfillment references across provider canonical identity reconciliation and test legacy-link/partial retry graph recovery in `apps/api/src/finance/provider-reconciliation-service.ts` and `tests/restore/finance-expense-task-links-restore.test.ts`.
- [ ] T123 [US12] Run contract/access/component/browser/restore checks and verify no protected auto-copy and no payment/cancellation from task completion/deletion in `docs/testing/finance-experience-validation.md`; record task-to-source and source-to-task navigation results.

**Checkpoint**: Connect Tasks and Post-its to Expenses is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 12: User Story 7 — Personalize and Use the Finance Dashboard (Priority: P2)

**Goal**: Offer per-user inclusion flags and independent useful account/budget/upcoming/recent-activity widgets.

**Prerequisites**: Foundation, US2, US1, US4, US5 and US11. US3 supplies transaction modal links; US8 owns graph content separately.

**Independent Test / Gate**: Flag each record kind for one user, compare balances/open-budget status and upcoming/recent lists with fixtures, change the count and prove other users and inaccessible records are unaffected.


### Tests — write first

- [ ] T124 [P] [US7] Add owner-only flags/count, canonical upcoming dedupe, active-on-save/inactive/closed budget eligibility, zero/overspent positive spent/percent-used and refund-aware recent activity reference tests in `tests/integration/finance-dashboard.test.ts` using shared predicates.
- [ ] T125 [P] [US7] Add personal preference isolation, hidden account totals/counts and revoked-flag/source leakage tests in `tests/security/finance-dashboard.security.test.ts`.
- [ ] T126 [P] [US7] Add Chromium/WebKit per-kind flag controls, independent widget empty/stale/error states and count persistence journeys in `tests/e2e/finance-dashboard.spec.ts`.
- [ ] T127 [P] [US7] Add/validate separate row/aggregate readiness and exactness, owner-only preferences and budget activity/refund-aware response contracts in `tests/contract/finance-dashboard.contract.test.ts`; progress is distinct from usable values and stale revisions are never final totals.

### Implementation and Verification

- [ ] T128 [US7] Implement owner-only versioned target flags and upcoming count domain/contracts/repository/service in `packages/domain/src/finance/dashboard.ts`, `packages/contracts/src/finance.ts` and `apps/api/src/finance/dashboard-preference-service.ts`; default flags off/count ten and never mutate shared catalog records.
- [ ] T129 [US7] Implement source-filtered dashboard widget queries using Foundation spend predicates and the updated dashboard-facing `packages/domain/src/finance/budget-totals.ts` adapter in `apps/api/src/finance/dashboard-service.ts`, `apps/api/src/finance/read-repository.ts` and `apps/api/src/finance/handlers.ts`; exclude inactive/closed budgets while preserving existing unpaid expenses and produce actual widget values/confirmed empty <=2s without whole-scope hydration.
- [ ] T130 [US7] Expose Include on my Finance dashboard on account/budget/category/merchant pages using `apps/web/src/features/finance/dashboard/DashboardFlagControl.tsx` and their existing detail/management components; preserve authorization and visible save/conflict state.
- [ ] T131 [US7] Connect real flagged-balance/open-budget/recent-activity data and complete upcoming count/overdue controls in `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx`, `apps/web/src/features/finance/dashboard/UpcomingExpensesWidget.tsx`, `apps/web/src/features/finance/dashboard/AccountBalancesWidget.tsx`, `apps/web/src/features/finance/dashboard/BudgetStatusWidget.tsx` and `apps/web/src/features/finance/dashboard/RecentActivityWidget.tsx`; keep each widget loading/error/coverage independent.
- [ ] T132 [US7] Synchronize owner-only flags/count and derive authorized cached widget data in `apps/web/src/sync/finance-sync.ts` and `apps/web/src/features/finance/dashboard/dashboard-query.ts`; remove known revoked data immediately and do not label partial/stale totals current.
- [ ] T133 [US7] Run personal-flag/widget/security/browser checks and record default-Finance landing, cross-device preference and open-budget status results in `docs/testing/finance-experience-validation.md`.

**Checkpoint**: Personalize and Use the Finance Dashboard is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 13: User Story 8 — Compare Spending Over Time (Priority: P2)

**Goal**: Show accessible month/quarter/year spending in a line graph and readable value table.

**Prerequisites**: Foundation, US2, US1, US4 and US7 dashboard composition. US9 is not required; share pure spend predicates and existing fact projections.

**Independent Test / Gate**: Switch account scope and 12-month/8-quarter/5-year modes over known period-boundary fixtures and compare every currency/period to exact reference sums.


### Tests — write first

- [ ] T134 [P] [US8] Add calendar/timezone/partial-period and shared-predicate parity tests for linked partial/multiple/later-period refunds, transfers, pending/provisional, zero-period and mixed-currency trends in `packages/domain/src/finance/spend-trends.test.ts` and `tests/integration/finance-spend-trends.test.ts`.
- [ ] T135 [P] [US8] Add Chromium/WebKit period toggles/multi-account scope, readable graph values and offline/incomplete-data journeys in `tests/e2e/finance-spend-trends.spec.ts`.

### Implementation and Verification

- [ ] T136 [US8] Implement calendar period bucketing and currency-separated trend series in `packages/domain/src/finance/spend-trends.ts`, consuming Foundation `packages/domain/src/finance/spend.ts` for all expense/refund eligibility and allocation matching; do not introduce a second spending definition.
- [ ] T137 [US8] Implement authorized summary/fact-based `/finance/spend-trends` queries and timezone-basis invalidation in `apps/api/src/finance/spend-trends-service.ts`, `apps/api/src/finance/spend-projection-service.ts` and `apps/api/src/finance/handlers.ts`; never substitute UTC-month sums for a different requested local boundary.
- [ ] T138 [US8] Build the accessible SVG line graph/value table and 12/8/5-period account selectors in `apps/web/src/features/finance/dashboard/SpendTrendsWidget.tsx`, wiring independent state into `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx` without adding a chart framework.
- [ ] T139 [US8] Provide worker-based authorized cached trend calculations and explicit coverage/revision state in `apps/web/src/features/finance/dashboard/spend-trends-query.ts` and `apps/web/src/search/finance-index.worker.ts`; reject stale worker responses after scope/lock changes.
- [ ] T140 [US8] Run trend domain/integration/browser checks and validate graph values against independent fixtures in `docs/testing/finance-experience-validation.md`; measure normal summary reads and record missing-history/zero-period behavior.

**Checkpoint**: Compare Spending Over Time is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 14: User Story 9 — Run a Spend Report (Priority: P2)

**Goal**: Deliver Reports with an exact or explicitly partial filterable Spend view and transaction links.

**Prerequisites**: Foundation shared spend rules, US2, US1, US3, US4 and US5. US8 calendar graph presentation and US7 flags are not report prerequisites; normal serial order still builds them first.

**Independent Test / Gate**: Combine all seven report dimensions using known split/refund/mixed-currency data, compare final rows/totals, and reopen a transaction without losing report state.


### Tests — write first

- [ ] T141 [P] [US9] Add AND/OR filter/same-allocation intersection, default-month, stable cursor/revision, no-result and safe pending/final total contracts in `tests/contract/finance-spend-report.contract.test.ts`.
- [ ] T142 [P] [US9] Add exact refund-aware same-allocation filtered rows/totals, automatic aggregate completion, source-revision/cursor dedupe, authorization and cold sparse/empty read-budget tests in `tests/integration/finance-spend-report.test.ts`; assert both 2s row readiness and 10s exact count/totals rather than progress.
- [ ] T143 [P] [US9] Add Chromium/WebKit Reports/Spend entry, combined filters, empty/partial/final totals and modal-close report-state preservation journeys in `tests/e2e/finance-spend-report.spec.ts`.

### Implementation and Verification

- [ ] T144 [US9] Implement Spend and automatic query status/completion using shared spend predicates and narrowest authorized fact/posting indexes in `apps/api/src/finance/spend-report-service.ts`, `apps/api/src/finance/query-job-service.ts`, `apps/api/src/finance/read-repository.ts` and `apps/api/src/finance/handlers.ts`; actual matches/definitive empty <=2s and exact connected counts/totals <=10s, with version-vector invalidation and no user paging dependency.
- [ ] T145 [US9] Build Reports/Spend filters, authorized rows, independent aggregate-pending labels and per-currency totals in `apps/web/src/features/finance/reports/FinanceReportsPage.tsx` and `apps/web/src/features/finance/reports/SpendReportPage.tsx`; auto-poll protected query status as needed, preserve default month/all accessible accounts and expose no export action.
- [ ] T146 [US9] Share guarded transaction modal navigation and worker-based offline report calculation in `apps/web/src/features/finance/reports/spend-report-query.ts`, `apps/web/src/features/finance/reports/SpendReportPage.tsx` and `apps/web/src/search/finance-index.worker.ts`; label partial scope and restore filters on modal close.
- [ ] T147 [US9] Run report contract/integration/browser checks and compare full final ledger/allocation totals to independent expected values in `docs/testing/finance-experience-validation.md`; record cold useful-content and full-completion timings separately.

**Checkpoint**: Run a Spend Report is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 15: Polish, Cross-Cutting Acceptance and Release Evidence

**Goal**: Integrate all real destinations, complete security/durability/browser/performance evidence and recheck runtime/cost ceilings.

**Prerequisites**: All story phases. This phase validates the complete feature, not just the suggested MVP; no deploy/merge is implied.

**Independent Test / Gate**: All 56 FRs, eight NFRs and fifteen success criteria have recorded passing evidence or an explicit unresolved release blocker.

- [ ] T148 Verify every Finance dropdown/deep-link destination, enhanced account flag/table/actions and transaction receipt/task decorations against the final contracts; resolve integration regressions in `apps/web/src/app/router.tsx`, `apps/web/src/features/finance/FinanceLandingPage.tsx` and `tests/e2e/finance-experience-navigation.spec.ts` without shipping placeholder destinations.
- [ ] T149 Run interrupted/backfilled migration, legacy capability/link/draft mapping, original entryContext preservation, refund and fulfillment capacity/source alias graph, exact object-version/hash and shared contribution parity recovery in `tests/restore/finance-experience-restore.test.ts` and `tests/contract/finance-experience-version.contract.test.ts`; document actual Finance RPO <=5 minutes/RTO <=4 hours and receipt-byte recovery separately in `docs/operations/finance-experience-recovery.md`.
- [ ] T150 Exercise original local entryContext/late overdue replay across zones, inactive-budget assignment conflicts, refund/fulfillment source corrections, quota exhaustion/reset while pending, revocation-first reconnect and partial task/receipt failures in `tests/e2e/finance-experience-offline.spec.ts`; record date preservation, visible conflicts and zero silent loss in `docs/testing/finance-experience-offline-report.md`.
- [ ] T151 Complete current Chromium/WebKit desktop/iPhone/iPad keyboard/touch/file/modal/post-it coverage and measured >=5px full-app button gaps in `tests/e2e/finance-experience-responsive.spec.ts`; retain exhaustive combinations in full/local release gates and record results in `docs/testing/finance-experience-browser-report.md`.
- [ ] T152 Run 20 measured cold/warm/sparse/zero-match Chromium iterations at 4x CPU/10Mbps/100ms over 50 accounts/100k transactions/20 budgets/5k receipt metadata/1k upcoming expenses using `tests/performance/finance-experience-browser.performance.spec.ts` and `playwright.performance.config.ts`; record p95 actual rows/widget values/verified-empty <=2s, exact connected transaction/report count/totals <=10s, local modal/progress <=1s, automatic completion/read counts and shared-predicate parity in `docs/testing/finance-experience-performance-report.md`; progress-only never passes.
- [ ] T153 Execute the two-representative-user timed account/filter/budget, upcoming creation and task/link/optional-display workflows from `specs/016-finance-experience-expansion/quickstart.md`; record each user/task result and any unresolved acceptance failure in `docs/testing/finance-experience-usability-report.md` without inventing human results.
- [ ] T154 Validate real structured-event redaction, configured 30-day Finance log retention, auth retention, stalled scan/projection/claim/invariant metrics and SNS alarms in `infra/test/finance-experience-infrastructure.test.ts` and `tests/security/finance-experience-observability.security.test.ts`; document safe diagnosis/cleanup thresholds in `docs/operations/finance-experience.md`.
- [ ] T155 Reprice combined Finance 015+016 normal usage, observed receipt/backup growth, projection amplification/range reads and logging in `docs/operations/finance-experience-cost.md`; document AWS serverless reuse and cheaper alternatives, and treat any >$5 forecast without explicit approval as an unresolved release gate.
- [ ] T156 Measure resulting required-command test counts/durations after each added batch and choose only representative quick journeys in `playwright.quick.config.ts` and `tests/e2e/finance-quick.spec.ts`; run `/usr/bin/time -p npm run test:e2e:quick`, confirm total hosted Validate duration after required-validation changes, and record before/after/counts in `docs/testing/finance-experience-validation-runtime.md`; >10-minute expected runtime requires explicit approval/rationale before merge and unavailable hosted evidence stays pending.
- [ ] T157 Update `docs/architecture/finance-experience.md`, `docs/operations/finance-experience.md`, `docs/operations/finance-experience-recovery.md` and `README.md` for real routes, linked refunds/partial allocations/received-date reporting, active-on-save/deactivation, original offline date context, 2s results/10s totals, private tasks, self PIN recovery and receipt/offline recovery; no internal implementation jargon in ordinary product flows.
- [ ] T158 Review the final diff for source authorization, cached/plaintext cleanup, generic-route/PIN bypass, Office policy limits, task/receipt leakage, idempotency/capacity invariants and accurate non-obvious code comments; record findings/resolutions in `docs/reviews/finance-experience-review.md` and fix all security/data-loss blockers before marking complete.
- [ ] T159 Run the smallest affected checks plus required validation and applicable quickstart release gates, avoiding redundant broad runs; reconcile FR/NFR/SC evidence and all user-story checkpoints in `docs/testing/finance-experience-validation.md` and `specs/016-finance-experience-expansion/tasks.md`; leave blocked/unmeasured human/hosted/AWS evidence unchecked rather than claiming completion or deploying.

**Checkpoint**: Polish, Cross-Cutting Acceptance and Release Evidence is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Dependencies and Execution Order

### Blocking foundation

Setup T001–T005 precedes Foundation T006–T018. The runtime baseline (T002) precedes every new required-suite test. Foundation blocks all user stories. Security US2 blocks all newly exposed Finance routes and data paths.

### Story dependency graph

| Story | Priority | Story prerequisites after Foundation | Independently demonstrable outcome |
| --- | --- | --- | --- |
| US2 | P1 | None | Enable a separate PIN, exercise all entry paths and five-failure delays, reset using the current password without losing pending data, and prove admin/password-reset boundaries. |
| US1 | P1 | US2 | Verify primary order and authorized Admin, open the empty Finance dashboard, create/reopen an account and inspect account sections on phone and desktop. |
| US4 | P1 | US2, US1 | Round-trip check/payment/classifications and permitted merchant edits, then link/correct/remove a partial refund using confirmed original associations on its received date without double offsets. |
| US5 | P1 | US2, US1 | Save an immediately usable account-less budget for a real group, deactivate/reactivate without losing flags/history/links, preserve separate closure and legacy drafts, and deny revoked membership safely. |
| US10 | P1 | US2, US1, US4 | Save one transaction under each editable account source/type, show SimpleFIN provisional state, and reconcile later without duplicate spending or lost relationships. |
| US3 | P1 | US2, US1, US4 | Filter seeded transactions by every supported dimension, open a row, restore table state on close and follow each accessible budget to a full page. |
| US11 | P1 | US2, US1, US5, US10 | Create against active budget, sync late across zones unchanged as overdue, manage existing inactive-budget links, and link/reverse partial/full payments without changing expected money into actual spending. |
| US6 | P2 | US2, US1, US3, US4 | Upload each supported boundary-format receipt, find it by combined filters, view/download original bytes and deny access after lock/revocation or through generic attachment routes. |
| US12 | P2 | US2, US1, US3, US10, US11 | Create a task from either expense type, link normal task creation/editing to multiple financial targets, toggle task/post-it display and prove task completion never pays an expense or exposes it to an unauthorized viewer. |
| US7 | P2 | US2, US1, US4, US5, US11, US3 | Flag each record kind for one user, compare balances/open-budget status and upcoming/recent lists with fixtures, change the count and prove other users and inaccessible records are unaffected. |
| US8 | P2 | US2, US1, US4, US7 | Switch account scope and 12-month/8-quarter/5-year modes over known period-boundary fixtures and compare every currency/period to exact reference sums. |
| US9 | P2 | US2, US1, US3, US4, US5 | Combine all seven report dimensions using known split/refund/mixed-currency data, compare final rows/totals, and reopen a transaction without losing report state. |

Normal serial order: Setup → Foundation → US2 → US1 → US4 → US5 → US10 → US3 → US11 → US6 → US12 → US7 → US8 → US9 → final integration. Same-priority branches may be scheduled by the graph; serialize shared edits to domain/contracts/router/handlers/database/sync files. US11 owns a working basic dashboard upcoming list; US7 enhances it, so there is no US11↔US7 cycle. US1 owns routing and empty-dashboard/account behavior; downstream story bodies are integrated at final acceptance without making route registration depend back on those stories.

### Interface and model ownership

- Security record/grants/offline verifier: US2. Shared storage/transport scaffolding: Foundation. All later endpoints must use that guard.
- Payment/check/subcategory/history/merchant rules: US4. Budget existing-group/close state: US5. Manual provider reconciliation: US10. Table/modal/query adapters: US3.
- UpcomingExpense/fulfillment/capacity ledger and its basic dashboard source: US11. Receipt parent/blob checking/ranges/retention: US6. Target-union task links/legacy adapter/optional display: US12.
- User dashboard flags/settings and widget state: US7. Shared pure spend/refund rules: Foundation; calendar bucketing/trend view: US8. Filtered Spend report: US9. Projection primitives are Foundation, with these consumer-specific contracts added under their owning stories.

## Parallel Execution Examples by Story

Each pair below is safe to author concurrently after the phase prerequisites, before its implementation. These are references to existing task rows, not extra unchecked tasks. No automated agent delegation is requested by this document.

| Story | Independent test tasks | File separation |
| --- | --- | --- |
| US2 | T019 + T020 | `tests/contract/finance-pin.contract.test.ts` versus `tests/security/finance-pin.security.test.ts` |
| US1 | T033 + T034 | `apps/web/test/features/finance-navigation.test.tsx` versus `tests/e2e/finance-account-navigation.spec.ts` |
| US4 | T042 + T043 | `packages/domain/src/finance/transaction-metadata.test.ts` versus `tests/integration/finance-classification-editing.test.ts` |
| US5 | T057 + T058 | `tests/integration/finance-budget-group-selection.test.ts` versus `tests/e2e/finance-budget-group-selection.spec.ts` |
| US10 | T064 + T065 | `tests/integration/finance-all-account-manual-entry.test.ts` versus `tests/e2e/finance-all-account-manual-entry.spec.ts` |
| US3 | T072 + T073 | `tests/contract/finance-transaction-browsing.contract.test.ts` versus `tests/integration/finance-transaction-browsing.test.ts` |
| US11 | T082 + T083 | `packages/domain/src/finance/upcoming-expense.test.ts` versus `tests/integration/finance-expense-fulfillment.test.ts` |
| US6 | T094 + T095 | `tests/unit/finance-receipt-policy.test.ts` versus `tests/security/finance-receipts.security.test.ts` |
| US12 | T109 + T110 | `tests/contract/finance-expense-task-links.contract.test.ts` versus `tests/security/finance-expense-task-links.security.test.ts` |
| US7 | T124 + T125 | `tests/integration/finance-dashboard.test.ts` versus `tests/security/finance-dashboard.security.test.ts` |
| US8 | T134 + T135 | `packages/domain/src/finance/spend-trends.test.ts` versus `tests/e2e/finance-spend-trends.spec.ts` |
| US9 | T141 + T142 | `tests/contract/finance-spend-report.contract.test.ts` versus `tests/integration/finance-spend-report.test.ts` |

Foundation read/projection tests and migration/compatibility tests are another independent pair. After US1, US4 catalog test authoring and US5 group-selector test authoring can proceed separately; implementation in shared `budget.ts`, `finance.ts`, handlers and sync files must be serialized. After US11, receipt tests and task-link tests use separate files, but their shared parent/sync wiring still needs ordered integration.

## Requirement Coverage

| Specification requirement | Owning tasks / acceptance |
| --- | --- |
| FR-001–FR-006 | T035, T036, T037, T038, T039, T041, T148 |
| FR-007 | T040, T151 |
| FR-008–FR-013 | T023, T024, T025, T026, T027, T028, T029, T030, T031, T032 |
| FR-014–FR-018 | T075, T077, T078, T079, T080, T081 |
| FR-019–FR-024 | T047, T048, T049, T050, T052, T054, T056 |
| FR-025–FR-026 | T060, T061, T063 |
| FR-027–FR-032 | T098, T099, T100, T101, T102, T103, T104, T105, T106, T107, T108 |
| FR-033–FR-038 | T091, T128, T129, T130, T131, T132, T133 |
| FR-039–FR-040 | T009, T010, T013, T051, T053, T055, T136, T137, T138, T139, T144, T140 |
| FR-041–FR-042 | T144, T145, T146, T147 |
| FR-043 | T026, T027, T099, T089, T114, T125, T142, T158 |
| FR-044–FR-045 | T066, T067, T068, T069, T070, T071, T122 |
| FR-046–FR-050 | T085, T086, T087, T088, T089, T090, T091, T092, T093 |
| FR-051–FR-056 | T113, T114, T115, T116, T117, T118, T119, T120, T121, T122, T123 |
| NFR-001 | T026, T027, T099, T110, T158 |
| NFR-002–NFR-003 | T015, T092, T105, T121, T149, T150 |
| NFR-004 | T151 |
| NFR-005 | T016, T017, T154 |
| NFR-006 | T006, T018, T152 |
| NFR-007 | T004, T155 |
| NFR-008 | T002, T156 |
| SC-001–SC-002 | T148, T153, T159 |
| SC-003 | T032, T158 |
| SC-004–SC-005 | T063, T081, T147 |
| SC-006 | T108 |
| SC-007–SC-008 | T093, T133, T140, T147 |
| SC-009–SC-010 | T151, T152 |
| SC-011–SC-012 | T149, T150, T155, T156 |
| SC-013–SC-015 | T071, T093, T123, T153 |

## Implementation Strategy

### Smallest useful demo and MVP

After Setup/Foundation/US2/US1, demonstrate protected Finance navigation and financial-account creation using the empty-dashboard scenario. This is an early demo, not completion of all Finance destinations.

The suggested operational MVP adds US4, US5, US10 and US3: protected, usable accounts with working existing-group budgets, manual entry on every source, accurate metadata/classification, and filtered transaction review/budget navigation. Complete the applicable migration/offline/security/browser/runtime/cost checkpoints for that slice before considering it releasable. All remaining requested work stays unchecked.

Next deliver US11 future obligations, then US6 receipts and US12 task/post-it connections, then US7/US8/US9 dashboard/reporting. Validate each independent checkpoint against seeded known values and failure cases. The complete user request requires every phase plus final acceptance; reaching MVP is not permission to stop.

### Incremental evidence and completion

- Keep task checkboxes tied to completed code and passing meaningful validation; never check a whole phase because its files exist.
- Run smallest affected tests during each slice, then required gates once per justified integration point. After every required-test expansion, record actual discovered cases and measured duration; final hosted evidence includes audit/install/build/browser setup as well as test runtime.
- Do not merge a validation expansion above ten minutes or proceed with a combined Finance forecast above $5 without the explicit approvals already required by repository/spec rules.
- Preserve offline pending content and legacy Finance/task-link state throughout migration; security, data loss or payment-capacity failures block completion.
- Human usability, hosted-runner totals and isolated AWS restore/cost evidence may depend on real environments or people. Prepare runnable checks and record what is missing; leave those tasks unchecked until actual evidence exists. No approval, deploy, merge, messaging or production change is implied by generating this list.

## Task Summary

| Scope | Task count |
| --- | ---: |
| Setup and Existing-Work Baseline | 5 |
| Foundational Storage, Projection and Compatibility Primitives | 13 |
| US2 — Protect Finance with My Own PIN | 14 |
| US1 — Navigate Finance and Manage Accounts | 9 |
| US4 — Record Payment Details and Classify Spending | 15 |
| US5 — Save Budgets Using Existing Groups | 7 |
| US10 — Manually Add a Transaction to Any Account | 8 |
| US3 — Inspect Transactions from an Account | 10 |
| US11 — Enter and Manage Upcoming Expenses | 12 |
| US6 — Attach and Find Receipts | 15 |
| US12 — Connect Tasks and Post-its to Expenses | 15 |
| US7 — Personalize and Use the Finance Dashboard | 10 |
| US8 — Compare Spending Over Time | 7 |
| US9 — Run a Spend Report | 7 |
| Polish, Cross-Cutting Acceptance and Release Evidence | 12 |
| **Total** | **159** |

There are 41 explicitly parallelizable test-authoring tasks. Every story has a separate goal, prerequisites, independent acceptance, failure-focused tests, implementation and verification checkpoint. All task IDs/labels/paths and coverage mappings are validated at generation; Implementation evidence is recorded separately in docs/testing/finance-experience-validation.md; unchecked checkpoints remain unresolved.
