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
- [X] T012 Implement purpose-specific key/date/inverted token/check/amount probes, narrowest authorized dimension selection, and touched-record conditional units of work in `apps/api/src/finance/read-repository.ts`, `apps/api/src/finance/unit-of-work.ts` and `apps/api/src/finance/dynamo-repository.ts`; retain canonical versions/idempotency, full-text predicate parity and current source access without whole-scope hydration.
- [X] T013 Implement transaction/refund-revision contribution facts, reversible account/currency/calendar summaries, dimension references and restartable publication in `apps/api/src/finance/spend-projection-service.ts` and `apps/api/src/finance/read-repository.ts`, consuming Foundation spend predicates. Add owner-only expiring query jobs/automatic max-five-partition completion in `apps/api/src/finance/query-job-service.ts`; pin selected account/refund-source revision vectors, recheck authorization/grant at delivery and finish exact totals without user pagination.
- [X] T014 Reserve the next available compatible capability (planned sync v8/Finance v2, recheck concurrent work) and additive entity/command envelopes including refund relations, budget activity and immutable entryContext in `packages/domain/src/sync.ts`, `packages/contracts/src/finance.ts` and `apps/api/src/sync/types.ts`; retain legacy adapters and gate old protected Finance hydration.
- [X] T015 Add the next unused Dexie migration and encrypted metadata/pending-byte/offline-security stores in `apps/web/src/db/database.ts`, `apps/web/src/db/schema.ts` and `apps/web/src/db/finance-repository.ts`; preserve existing device keys/outbox, use empty legacy defaults and reject quota failures before claiming bytes were queued.
- [X] T016 Extend redacted structured Finance events, correlation/error categories and projection-lag/invariant metrics in `apps/api/src/finance/telemetry.ts` and `packages/observability/src/redaction.ts`; exclude credentials/grants/filenames/financial values and test exclusions in `tests/security/finance-experience-observability.security.test.ts`.
- [X] T017 Wire existing-function routes, trusted asynchronous Finance query-worker dispatch, owner-only checkpoint access, least-privilege table/media prefixes, retention/alarms and backup coverage in `infra/lib/api-stack.ts`, `infra/lib/observability-stack.ts` and `infra/lib/backup-stack.ts`, with assertions in `infra/test/finance-experience-infrastructure.test.ts`; preserve import-only connection decryption/auth-only pepper access and never let user input select an internal bypass envelope.
- [ ] T018 Run bounded indexed cold/warm/sparse/zero-match feasibility, Foundation parity/migration/infra tests and current cost forecast; record actual rows/verified-empty <=2s p95, exact connected counts/totals <=10s p95, separate <=1s progress, rows/calls and automatic query completion in `docs/testing/finance-experience-validation.md`; improve indexes/concurrency before stories if either deadline or the approved $6.50 gate fails.

**Checkpoint**: Foundational Storage, Projection and Compatibility Primitives is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

**Continuation evidence (2026-10-31)**: T012/T013 gained compact three-character
postings, interrupted-v1 conversion, calendar-basis reversal and completed-checkpoint
retention corrections. Required validation passes 1,338 cases; T016 local observability requirements pass; the repeated cost
scenario is $6.466201/month but real DynamoDB deadlines/capacity and current hosted
duration are unmeasured. T012/T013/T017/T018 remain unchecked. Foundation external acceptance has not passed.
On 2026-11-01 the user explicitly directed that DynamoDB/external gates remain
deferred and that local development continue without DynamoDB; dependent local
security work may proceed under that direction, without claiming external PASS. See
`docs/testing/finance-experience-validation.md` and its runtime/cost links.

Foundation coverage correction (2026-11-01): a single contribution now leaves
account coverage unverified. Runtime rejects missing/partial coverage proofs.
Bounded canonical/refund verifiers, canonical fact reconstruction and explicit
restartable scope/account migration drivers now have local coverage. T013 still
requires automatic incremental canonical-write publication and bounded query
integration; these are internal implementation gaps, distinct
from the user-deferred DynamoDB/hosted acceptance gates. No foundation PASS is claimed.

## Phase 3: User Story 2 — Protect Finance with My Own PIN (Priority: P1)

**Goal**: Establish the full Finance access boundary before exposing new routes and embedded views.

**Prerequisites**: Foundation. No other story is required; test existing Finance routes and synthetic embedded/receipt targets.

**Independent Test / Gate**: Enable a separate PIN, exercise all entry paths and five-failure delays, reset using the current password without losing pending data, and prove admin/password-reset boundaries.


### Tests — write first

- [X] T019 [P] [US2] Add self-only password-verified enrollment/change/reset/requirement and opaque grant/epoch/revision contract tests in `tests/contract/finance-pin.contract.test.ts`; reject targetUserId, weak/mismatched PINs and responses containing verifiers.
- [X] T020 [P] [US2] Add admin denial, password reset preserving Finance PIN, stale authorizer/grant, generic Finance/sync/attachment bypass and >=30-second fifth-failure tests in `tests/security/finance-pin.security.test.ts`.
- [X] T021 [P] [US2] Add offline verifier/missing-material/throttle, forgotten-PIN pending-data survival, history restoration and cross-tab lock lifecycle tests in `apps/web/test/features/finance-lock.test.tsx`.
- [X] T022 [P] [US2] Add representative Chromium/WebKit password-enrollment/unlock/direct-link/cancel/relock/offline journeys in `tests/e2e/finance-pin.spec.ts`; retain these in full browser validation unless the measured quick budget explicitly permits selection.

Local evidence (2026-11-01): T019/T023/T024/T025 pass contracts, conditional
repository/service fixtures, canonical guard and HTTP boundary tests plus synthesized
route/permission assertions. Required validate passed 428 files / 1,373 cases in
67.83 s before the next browser integration batch. This is not DynamoDB/hosted
acceptance. See validation and runtime reports; other US2 tasks remain open.

### Implementation and Verification

- [X] T023 [US2] Implement user-only separate security/verifier, random hashed grant and durable throttle records in `apps/api/src/auth/finance-security-repository.ts`; bind grant to user/session/epoch/revision/tab, enforce maximum 30-minute/session expiry and exponential 30-second-to-30-minute failure delays.
- [X] T024 [US2] Implement current-password verification using canonical pepperVersion and existing Argon2id for all PIN/requirement management in `apps/api/src/auth/finance-security-service.ts`; keep Journal/recovery PINs separate and expose no administrative target-user operation.
- [X] T025 [US2] Add the `/auth/finance-security` and `/auth/finance-unlocks` methods from the API contract in `apps/api/src/auth/handlers.ts` and `infra/lib/api-stack.ts`; enforce mutation security/no-store, grant revocation and safe audit outcomes without broadening Finance password-secret permissions.
- [X] T026 [US2] Implement current session/epoch/security-revision Finance gate validation in `apps/api/src/finance/finance-unlock-guard.ts` and `apps/api/src/shared/security.ts`; attach to Finance, query-job result/status, generic attachment/sync and task-derived reads with no stale cache/admin bypass, while trusted background computation cannot deliver data to a locked client.
- [X] T027 [US2] Implement independent Finance delivery checkpoints, protected pull/replay gating and legacy-client locked/upgrade behavior in `apps/api/src/sync/handlers.ts`, `apps/api/src/sync/sync-service.ts` and `apps/api/src/sync/change-feed-repository.ts`; keep general task sync progressing without acknowledging undisclosed Finance events.
- [X] T028 [US2] Implement the per-tab memory-only grant/access controller and worker-derived offline verifier in `apps/web/src/features/finance/security/finance-access-controller.ts` and `apps/web/src/crypto/finance-pin.worker.ts`; persist local throttling, fail closed on missing/known-stale state and preserve encrypted pending records during reset.
- [X] T029 [US2] Route Finance decrypt/cache/search/embedded reads, request headers, signout/history/bfcache/expiry and reconnect revision checks through the controller in `apps/web/src/db/finance-repository.ts`, `apps/web/src/features/finance/finance-client.ts`, `apps/web/src/features/auth/sign-out.ts`, `apps/web/src/search/finance-index.ts` and `apps/web/src/sync/finance-sync.ts`; abort requests/workers and clear plaintext/Blob URLs on lock.
- [X] T030 [US2] Build password-verified Require PIN/set/reset controls and intended-destination unlock/lock UI in `apps/web/src/features/auth/FinanceSecuritySettings.tsx` and `apps/web/src/features/finance/security/FinanceUnlock.tsx`; integrate `apps/web/src/features/profile/SecuritySettings.tsx` and `apps/web/src/features/profile/ProfilePage.tsx` and in-place embedded unlock without blocking ordinary tasks.
- [X] T031 [US2] Preserve Finance PIN state while invalidating grants after user/admin password reset, requirement changes and session revocation in `apps/api/src/auth/password-reset-service.ts`, `apps/api/src/auth/user-repository.ts` and `apps/api/src/admin/user-admin-service.ts`; verify connected-session invalidation before replay.
- [X] T032 [US2] Run the story contract/security/component/browser checks and record online/offline reset, cached-key boundary and disconnected-device limits in `docs/testing/finance-experience-validation.md`; any ungated production entry path blocks this checkpoint.

**Checkpoint**: Protect Finance with My Own PIN is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 4: User Story 1 — Navigate Finance and Manage Accounts (Priority: P1)

**Goal**: Provide authoritative Finance navigation, dedicated financial-account creation and readable account layout.

**Prerequisites**: Foundation and US2. Existing 015 transaction/catalog/budget pages provide baseline destinations; downstream stories replace/complete their enhanced bodies, not a second navigation state.

**Independent Test / Gate**: Verify primary order and authorized Admin, open the empty Finance dashboard, create/reopen an account and inspect account sections on phone and desktop.


### Tests — write first

- [X] T033 [P] [US1] Add parse/serialize/new-before-ID/history and primary/dropdown order tests in `apps/web/test/features/finance-navigation.test.tsx`, covering direct entry and preserved secondary app tools.
- [X] T034 [P] [US1] Add Chromium/WebKit new-account validation, retained form input, account layout and keyboard/touch navigation tests in `tests/e2e/finance-account-navigation.spec.ts` using an empty-dashboard fixture.

### Implementation and Verification

- [X] T035 [US1] Extend route union/parser/serializer and protected route dispatch in `apps/web/src/app/router.tsx` and `apps/web/src/features/finance/FinanceLandingPage.tsx` for every contracted Finance destination and modal background; remove competing local subview routing.
- [X] T036 [US1] Order primary navigation Tasks/Lists/Finance/Journal/Search/Admin and build the accessible Finance dropdown in `apps/web/src/app/App.tsx` and `apps/web/src/components/FinanceNavigation.tsx`; keep existing secondary tools and admin authorization.
- [X] T037 [US1] Extract a dedicated financial-account creation page in `apps/web/src/features/finance/accounts/FinanceAccountCreatePage.tsx` and update `apps/web/src/features/finance/accounts/FinanceAccountsPage.tsx`; preserve required names/ownership/provider setup and navigate to the saved account after success.
- [X] T038 [US1] Refactor `apps/web/src/features/finance/accounts/FinanceAccountDetail.tsx` and `apps/web/src/styles/app.css` into labeled summary/balance/freshness, primary actions, editing forms, scoped transaction content and destructive sections without page-wide phone scrolling; retain actual existing controls until their enhanced story connects.
- [X] T039 [US1] Create the guarded dashboard page composition and truthful empty/freshness/error states in `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx`; reuse actual existing account data, keep widget interfaces ready for US7/US8 and do not present mock balances or fake success.
- [X] T040 [US1] Introduce and apply a shared >=5px adjacent button/button and button/text-entry gap in `apps/web/src/styles/app.css` and affected existing task/list/journal/search/admin form wrappers; preserve wrapped layouts and touch target sizing, with full-app measured audit scheduled in final validation.
- [X] T041 [US1] Preserve per-connection SimpleFIN setup under account workflows in `apps/web/src/features/finance/accounts/SimplefinConnectionPanel.tsx`; document repository evidence that application-wide Admin setup is unnecessary in `docs/operations/finance-experience.md`, and run navigation/account tests with no invented global credential UI.

**Checkpoint**: Navigate Finance and Manage Accounts is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 5: User Story 4 — Record Payment Details and Classify Spending (Priority: P1)

**Goal**: Persist payment/classification/merchant corrections and authoritative linked full/partial expense refunds under current source permissions.

**Prerequisites**: Foundation, US2 and US1 route integration. No enhanced transaction table/report is needed; use existing transaction detail/edit flow and direct catalog routes.

**Independent Test / Gate**: Round-trip check/payment/classifications and permitted merchant edits, then link/correct/remove a partial refund using confirmed original associations on its received date without double offsets.


### Tests — write first

- [x] T042 [P] [US4] Add payment/check normalization, category cycle/depth/duplicate/history and invalid allocation pairing tests in `packages/domain/src/finance/transaction-metadata.test.ts` and `packages/domain/src/finance/subcategory.test.ts`.
- [x] T043 [P] [US4] Add merchant collision/creator-admin authorization and provider-refresh preservation tests in `tests/integration/finance-classification-editing.test.ts` and `tests/security/finance-catalog-editing.security.test.ts`.
- [x] T044 [P] [US4] Add Chromium/WebKit payment/check, category/subcategory, authorized merchant editing and explicit original-expense refund link/partial split confirmation/correct/remove journeys in `tests/e2e/finance-classification-editing.spec.ts`; prove received-date reporting and no guessed refund from unlinked credit.
- [x] T045 [P] [US4] Add linked-refund get/put/delete contracts, source/capacity version and explicit partial-allocation confirmation tests in `tests/contract/finance-refunds.contract.test.ts`; original associations default safely, received date remains authoritative and unlinked credits offset nothing.
- [x] T046 [P] [US4] Add refund/original access intersection, same-currency cross-account, credit/principal capacity race, retry/unlink/relink, original recategorization snapshots and provider-review correction tests in `tests/integration/finance-refunds.test.ts` and `tests/security/finance-refunds.security.test.ts`.

### Implementation and Verification

- [x] T047 [US4] Extend user-owned paymentType/checkNumber and source correction semantics in `packages/domain/src/finance/transaction.ts` and request/response schemas in `packages/contracts/src/finance.ts`; preserve unknown legacy values, leading zeros and optional check numbers.
- [x] T048 [US4] Extend categories/allocations/budget items with one-level children, parent-scoped uniqueness locks and historical classification associations in `packages/domain/src/finance/category.ts`, `packages/domain/src/finance/allocation.ts`, `packages/domain/src/finance/budget.ts` and `apps/api/src/finance/repository.ts`; reject invalid cycles/reparenting rather than rewriting history.
- [x] T049 [US4] Implement versioned merchant editing/canonical collision checks and explicit imported-entry admin-only handling in `packages/domain/src/finance/merchant.ts`, `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/handlers.ts`; preserve source descriptions and identity.
- [x] T050 [US4] Persist metadata/historical allocation paths and invalidate or retain explicit confirmed refund snapshots through API writes/provider corrections in `apps/api/src/finance/transaction-service.ts`, `apps/api/src/finance/provider-reconciliation-service.ts` and `apps/api/src/finance/spend-projection-service.ts`; consume shared spend predicates and surface claim/source conflicts without obsolete exact totals.
- [x] T051 [US4] Implement versioned ExpenseRefundRelationship/capacity storage and get/put/delete APIs in `apps/api/src/finance/refund-service.ts`, `apps/api/src/finance/refund-repository.ts` and `apps/api/src/finance/handlers.ts`; enforce refund edit plus original/association read access, preserve excess credit unlinked and atomic release/reclaim on correction without altering source amounts/dates.
- [x] T052 [US4] Provide the dedicated Categories page and parent/child selection, merchant edit form and payment/check editor in `apps/web/src/features/finance/catalog/FinanceCategoriesPage.tsx`, `apps/web/src/features/finance/catalog/FinanceCategoryManager.tsx`, `apps/web/src/features/finance/catalog/FinanceMerchantDetail.tsx` and `apps/web/src/features/finance/transactions/TransactionDetail.tsx`.
- [x] T053 [US4] Build source-authorized original expense lookup, full default and explicit partial split refund allocation confirmation/correct/remove UI in `apps/web/src/features/finance/transactions/RefundRelationshipEditor.tsx` and `apps/web/src/features/finance/transactions/TransactionDetail.tsx`; retain received-date identity and show pending/review/conflict state without exposing inaccessible source references.
- [x] T054 [US4] Extend encrypted catalog/transaction/budget-item hydration and queued edits in `apps/web/src/sync/finance-sync.ts` and `apps/web/src/db/finance-repository.ts`; keep global catalog identity separate from protected usage and preserve pending legacy data.
- [x] T055 [US4] Add protected refund proposals/recipient-filtered feeds, source correction and alias reconciliation hooks, contribution reversals and capacity/revocation cleanup in `apps/web/src/sync/finance-sync.ts`, `apps/api/src/sync/sync-service.ts` and `apps/api/src/finance/provider-reconciliation-service.ts`; preserve confirmed snapshots and never keep incompatible source claims in exact totals.
- [x] T056 [US4] Run metadata/catalog/refund domain/contract/integration/security/browser checks including offline retry, original recategorization snapshots, partial split and later-period cross-account refunds, competing principal claims and canonical alias correction; record outcomes in `docs/testing/finance-experience-validation.md` before dashboard/report consumers rely on the fields.

**Checkpoint**: Record Payment Details and Classify Spending is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 6: User Story 5 — Save Budgets Using Existing Groups (Priority: P1)

**Goal**: Save new budgets immediately active with existing group choices, reversible activity controls and independent closure/reconciliation.

**Prerequisites**: Foundation, US2 and US1. Existing 015 budget validation remains the baseline; no Upcoming Expense or dashboard data is required.

**Independent Test / Gate**: Save an immediately usable account-less budget for a real group, deactivate/reactivate without losing flags/history/links, preserve separate closure and legacy drafts, and deny revoked membership safely.


### Tests — write first

- [x] T057 [P] [US5] Add active-on-save with no-account group, named membership choices, deactivation/reactivation preserving links/flags/history, closed-plus-inactive reactivation staying closed, legacy-draft mapping and retained input on revoked-save tests in `tests/integration/finance-budget-group-selection.test.ts` and `apps/web/test/features/finance-budget-groups.test.tsx`.
- [x] T058 [P] [US5] Add Chromium/WebKit new active budget, Deactivate/Reactivate, optional legacy Save as active, empty-account group, no-eligible membership and existing upcoming-link preservation journeys in `tests/e2e/finance-budget-group-selection.spec.ts`.

### Implementation and Verification

- [x] T059 [US5] Implement active-on-confirmed-create status/activity, independent activityChangedAt/by, versioned deactivation/reactivation and separate closedAt/closedBy/reconciliation invariants in `packages/domain/src/finance/budget.ts`, `apps/api/src/finance/budget-service.ts` and `packages/contracts/src/finance.ts`; preserve legacy drafts during migration and expose explicit Save as active without silently reopening archived/closed records.
- [x] T060 [US5] Save ordinary budgets immediately active with no required account association, recheck actual memberships and expose versioned deactivate/reactivate/close/reopen plus legacy-draft Save as active in `apps/api/src/finance/budget-service.ts` and `apps/api/src/finance/handlers.ts`; inactive/closed budgets reject new/reassigned upcoming associations but preserve management of existing links.
- [x] T061 [US5] Replace account-derived group IDs with `listLocalGroups()`/active membership and display names in `apps/web/src/features/finance/budgets/FinanceBudgetsPage.tsx` and `apps/web/src/features/finance/budgets/ReusableItemsPage.tsx`; distinguish loading/error/no-eligible groups and preserve unsaved fields.
- [x] T062 [US5] Expose distinct active/inactive Deactivate/Reactivate and Close/Reopen controls, legacy-draft Save as active and queued conflict-aware activity updates in `apps/web/src/features/finance/budgets/FinanceBudgetDetail.tsx` and `apps/web/src/sync/finance-sync.ts`; preserve flags/history/links and keep current membership authoritative.
- [x] T063 [US5] Run group/activity/closure migration and browser tests, record immediate usability of new budgets, deactivation effects on new versus existing expense associations, reactivation preserving separate closure, no-account save and offline membership conflicts in `docs/testing/finance-experience-validation.md`.

**Checkpoint**: Save Budgets Using Existing Groups is complete only after its independent acceptance and relevant failure paths pass; preserve pending evidence as unresolved.

## Phase 7: User Story 10 — Manually Add a Transaction to Any Account (Priority: P1)

**Goal**: Expose reliable manual entry on every account the user may edit.

**Prerequisites**: Foundation, US2, US1 and US4; existing 015 provider reconciliation is required. US3 enhanced filters are not a dependency.

**Independent Test / Gate**: Save one transaction under each editable account source/type, show SimpleFIN provisional state, and reconcile later without duplicate spending or lost relationships.


### Tests — write first

- [x] T064 [P] [US10] Add all-source/type/manual-snapshot/provisional/denied-save and retry tests in `tests/integration/finance-all-account-manual-entry.test.ts`; cover stable canonical IDs and source/user ownership.
- [x] T065 [P] [US10] Add account-context and global Transactions Add Transaction Chromium/WebKit journeys, invalid input retention and offline queue tests in `tests/e2e/finance-all-account-manual-entry.spec.ts`.

### Implementation and Verification

- [x] T066 [US10] Make the canonical account transaction creation path accept every permitted account type/source with targeted conditional writes in `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/handlers.ts`; enforce current edit access, required date/amount/direction/currency and idempotency.
- [x] T067 [US10] Preserve user payment/classification metadata, accepted refund relations/capacity and canonical source references on provisional/provider merges in `apps/api/src/finance/provider-reconciliation-service.ts` and `packages/domain/src/finance/provider-reconciliation.ts`; retain stable original/refund IDs and extension hooks for receipt/task/fulfillment references without altering provider balances.
- [x] T068 [US10] Build reusable manual transaction entry with account preselection and all optional metadata in `apps/web/src/features/finance/transactions/ManualTransactionForm.tsx`; show provisional status, exact currency amounts and actionable field errors.
- [x] T069 [US10] Connect Add Transaction to all editable account details and the dedicated Transactions page in `apps/web/src/features/finance/accounts/FinanceAccountDetail.tsx` and `apps/web/src/features/finance/transactions/FinanceTransactionsPage.tsx`; invalidate/update real lists once after success.
- [x] T070 [US10] Queue and replay manual transactions through existing encrypted outbox/Finance gate in `apps/web/src/db/finance-repository.ts` and `apps/web/src/sync/finance-sync.ts`; retain rejected input and never expose a pending observation as a posted provider payment.
- [x] T071 [US10] Run all-source balance/provisional/retry/offline checks and record canonical-provider reconciliation results in `docs/testing/finance-experience-validation.md`; validate the existing receipt/task relationship preservation fixture when downstream consumers are added.

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

- [x] T082 [P] [US11] Add required original-browser future date and immutable enteredAt/localDate/IANA zone context, delayed-overdue replay, DST/travel, positive amount/reference eligibility, due-today/overdue/cancelled/paid/overpaid and planned-source identity tests in `packages/domain/src/finance/upcoming-expense.test.ts`.
- [x] T083 [P] [US11] Add claim concurrency/unlink/provider alias and budget deactivate-between-entry-and-sync tests in `tests/integration/finance-expense-fulfillment.test.ts` and `tests/security/finance-upcoming-expenses.security.test.ts`; existing unchanged associations remain manageable while new inactive-budget selections fail under current rights.
- [x] T084 [P] [US11] Add Chromium/WebKit original-context create, delayed offline sync becoming overdue with unchanged dueDate across zones, inactive-budget selector/existing-association handling, reschedule/cancel/dashboard and partial/full payment journeys in `tests/e2e/finance-upcoming-expenses.spec.ts`.

### Implementation and Verification

- [x] T085 [US11] Define UpcomingExpense/fulfillment validation with immutable entryContext, distinct reschedule contexts, dueDate > original localDate, active/open eligibility for new/reassigned budget links, no-actual-money effects and typed plannedSource in `packages/domain/src/finance/upcoming-expense.ts`, `packages/domain/src/finance/expense-fulfillment.ts` and `packages/contracts/src/finance.ts`; never use reconnect today for creation validity.
- [x] T086 [US11] Implement canonical records, account/due indexes, source occurrence uniqueness, immutable history and transactional claim-ledger writes in `apps/api/src/finance/upcoming-expense-repository.ts`; condition on expense, transaction and claim versions and preserve legacy source aliases.
- [x] T087 [US11] Implement expense/fulfillment endpoints and current account/budget/group intersection checks in `apps/api/src/finance/upcoming-expense-service.ts` and `apps/api/src/finance/handlers.ts`; accept an otherwise valid delayed original date as overdue, preserve entryContext on retry/ordinary edits, validate explicit reschedule context separately, and reject inactive budget only for new/reassigned association.
- [x] T088 [US11] Recompute accepted claims on posting, amount correction, transfer/reversal/unmatch/provider reconciliation in `apps/api/src/finance/transaction-service.ts` and `apps/api/src/finance/provider-reconciliation-service.ts`; never overstate paid status and never double-count actual spending or planned budget totals.
- [x] T089 [US11] Add intersection-filtered expense/fulfillment owner projections and revocation tombstones in `apps/api/src/sync/sync-service.ts` and `apps/api/src/finance/upcoming-expense-service.ts`; do not distribute private account metadata to a blanket group audience.
- [x] T090 [US11] Build upcoming list/create/detail/fulfillment and reference guidance in `apps/web/src/features/finance/upcoming/UpcomingExpensesPage.tsx`, `apps/web/src/features/finance/upcoming/UpcomingExpenseForm.tsx` and `apps/web/src/features/finance/upcoming/UpcomingExpenseDetail.tsx`; capture immutable browser-local entryContext on original confirmation, keep date-only dueDate across travel and wire account/dashboard actions.
- [x] T091 [US11] Connect the canonical unpaid upcoming query and separate overdue list to `apps/web/src/features/finance/dashboard/UpcomingExpensesWidget.tsx` and `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx`; avoid duplicate planned sources, exclude paid/cancelled and keep default next ten without requiring US7 flags.
- [x] T092 [US11] Preserve original entryContext and mutation identity through encrypted upcoming/claim outbox, replay and restore in `apps/web/src/sync/finance-sync.ts` and `apps/web/src/db/finance-repository.ts`; late sync alone cannot reject/move dates, while current permissions/capacity/reference conflicts remain recoverable and offline payment proposals are not final paid state.
- [x] T093 [US11] Run domain/claim/access/browser/offline tests and record delayed date preservation, original browser/server time-zone boundaries, inactive-budget current-versus-existing relationships, competing payments and canonical dashboard identity in `docs/testing/finance-experience-validation.md`; planning alone changes neither balances nor posted Spend.

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

## Phase 14a: User Story 13 — Per-Budget Financial Forecasts (Clarified 2026-11-09)

**Prerequisites**: Foundation and US2 access boundary, US1 routes, US4 classification,
US5 budgets, US11 canonical Upcoming Expenses, US7 dashboard composition and US9
budget-only report integration. Respect the existing user deferral of real DynamoDB
and hosted gates; no external PASS follows from local work. These new tasks preserve
all original T001–T159 IDs/checks and precede the complete-feature acceptance phase.

**Independent Test / Gate**: Both methods per budget and authorized dashboard overview;
explicit optional non-budgeted history cannot change budget-only report actuals.
No forecast method or UI is complete merely because history selection is implemented.

- [ ] T160 [P] [US13] Add independent known-plan/history/partial-income-expense/refund-transfer/allocation/obligation-identity reference fixtures and strict opt-in/model-period response contract tests in `packages/domain/src/finance/forecast.test.ts` and `tests/contract/finance-forecast.contract.test.ts`; extend the existing history-scope tests without weakening budget-report isolation.
- [ ] T161 [P] [US13] Add current private/shared membership, admin-without-override, PIN/lock, cached-source/method/opt-in collision, insufficient history, offline coverage and budget/dashboard browser fixtures in `tests/security/finance-forecast.security.test.ts` and `tests/e2e/finance-forecast.spec.ts`; preserve measured required/quick runtime and keep exhaustive cases in the full gate.
- [ ] T162 [US13] Implement transparent shared known-plan and historical forecast calculations in `packages/domain/src/finance/forecast.ts`, reusing canonical source eligibility and `forecast-history-scope.ts`; document lookback/period and insufficient-history criteria, preserve per-currency income/expense/net amounts, and deduplicate linked obligations without forecasting bank cash balances or invoking an external model service.
- [ ] T163 [US13] Add bounded canonical forecast contracts/read/service/route integration in `packages/contracts/src/finance.ts`, `apps/api/src/finance/forecast-service.ts`, `apps/api/src/finance/read-repository.ts` and existing Finance handlers/query jobs; current viewer/source/PIN checks and method/period/opt-in/version identity are mandatory, with no history hydration fallback, new always-on resource or migration execution.
- [ ] T164 [US13] Build guarded per-budget model controls and both labeled outputs in `apps/web/src/features/finance/budgets/BudgetForecast.tsx` and the budget detail route; default non-budgeted history off, require an explicit forecast request to use it, and show truthful coverage/estimate/loading/failure states under snapshot/lock/owner fences.
- [ ] T165 [US13] Add the authorized per-budget forecast overview to `apps/web/src/features/finance/dashboard/FinanceDashboardPage.tsx` and its query/composition layer; keep budget actuals strict, methods/currencies separate, personal dashboard selection and current source rights intact, and prevent reuse of expanded-history results as report actuals.
- [ ] T166 [US13] Run forecast reference/contract/security/component/browser and applicable bounded performance/cost checks; record actual counts, timings, failures, estimate limitations and source quantities in `docs/testing/finance-experience-validation.md`, `docs/operations/finance-experience-cost.md` and user docs. Keep real DynamoDB/hosted and combined-cost acceptance unresolved until measured under the unchanged $6.50 ceiling; complete these tasks before final T148–T159 acceptance.

**Checkpoint**: Forecasting remains unbuilt until its own independent evidence passes;
Foundation/shared history-selection coverage is not model or dashboard acceptance.

## Phase 15: Polish, Cross-Cutting Acceptance and Release Evidence

**Goal**: Integrate all real destinations, complete security/durability/browser/performance evidence and recheck runtime/cost ceilings.

**Prerequisites**: All story phases. This phase validates the complete feature, not just the suggested MVP; no deploy/merge is implied.

**Independent Test / Gate**: All 60 FRs, eight NFRs and sixteen success criteria have recorded passing evidence or an explicit unresolved release blocker.

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
| FR-057–FR-060 | T160, T161, T162, T163, T164, T165, T166 |
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
| SC-016 | T160, T161, T162, T163, T164, T165, T166 |
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


Continuation evidence (2026-11-01, local only): bounded canonical/refund/scope
migration drivers, checkpoint payload pruning, atomic canonical security snapshots,
in-place task unlock, pre-decryption Finance outbox gating and ordinary conflict-cache
isolation were added. Required/quick/full results, including failures and repeat
results, are recorded in `docs/testing/finance-experience-validation-runtime.md`.
No additional task checkbox is completed by these partial changes. Foundation
incremental publication/query integration, semantic replay/independent browser
Finance cursors, final lifecycle/access audit, live DynamoDB, hosted runtime and
migration budget acceptance remain open. The 100k initial-publication sample
extrapolates above the approved $6.50 ceiling; the ongoing conditional forecast
is not migration approval. Apple and lockfile remain unchanged. Browser-tooling
upgrade direction is pending separately from deferred DynamoDB/hosted gates.


Playwright experiment update (2026-11-01): the user approved exact 1.64.1 and
matching browser binaries. Required validation passes 1,409 tests in 54.86 s;
quick remains 31 passing cases in 27.76 s. WebKit now fails before reaching the
PIN steps, including two existing authentication controls; this does not accept
the prior offline gate. All temporary helper/config experiments were removed.
Only the Playwright package/lock entries changed for this experiment; restoring
1.61.1 versus retaining 1.64.1 is pending user direction. The earlier note that
upgrade approval was pending is superseded. No additional checkbox is completed.


WebKit diagnosis update (2026-11-01): user directed staying on 1.64.1 and fixing the
gate before implementation continues. A plain non-extractable AES key IndexedDB
probe reproduces the freeze without application code. Native browser-process
samples locate the wait in macOS Keychain access for WebKit's WebCrypto master key.
A visible synthetic probe is open for the user to check an OS permission prompt;
local user consent/unlock is the current human-input boundary. The earlier rollback
choice is superseded. No encryption or acceptance assertion was weakened and no
additional task checkbox is complete. Once resolved, repeat the actual WebKit/PIN
gates before continuing the dependency-ordered local work.


Local OS prerequisite update (2026-11-02): no prompt was visible. Read-only metadata
shows the Keychain is unlocked, but Playwright WebCrypto Master Key trusts only a
removed webkit-2311 application path rather than the installed webkit-2370 app.
The user is reviewing that specific item's Access Control entry. No credential
value was read and no rule/key was modified by the agent. Keep 1.64.1; do not weaken
key persistence or mark T022 complete. After the user approves the updated browser,
rerun the minimal key probe and actual browser gate, then continue implementation.


Continuation evidence (2026-11-03): the user updated local Keychain access;
the minimal non-extractable CryptoKey probe and all 12 unchanged PIN cases pass
on Playwright 1.64.1. T022 is checked for its representative test implementation.
Two complete browser runs remain failing during documented macOS system sleep;
this is not full acceptance or completion of US2. Six bounded query-status HTTP
checks pass and the endpoint avoids legacy whole-scope hydration. Initial table
query creation/paging, incremental publication and deferred external gates still
leave T012/T013/T017/T018 open. See the validation/runtime evidence for failures,
timings and the requested awake-machine prerequisite.


Continuation evidence (2026-11-06): T012 and T017 are checked for their local
implementation and passing regression evidence. Purpose-specific key/date/text/
check/amount reads select authorized narrow probes and enforce bounded hydration;
touched-record canonical units of work condition authorization, source versions,
negative reads and idempotency receipts. Query HTTP creation/status/paging precedes
legacy scope hydration and rechecks current owner/grant/source access. Native
query/publication dispatch, strict HTTP/IAM isolation, bounded missed-signal
recovery and existing table/media/backup/retention/telemetry boundaries have
passing integration/security/infra evidence. Required validation: **1,557 cases /
441 files / 61.46 s**, runtime/typecheck/lint/build pass; quick remains **31 /
28.56 s**. No hosted/cloud acceptance is implied by these implementation checks.

T013 remains open for account relocation and remaining incremental lifecycle
review. User-proven physical deletion now has bounded, restartable cleanup;
coalesced earlier corrections, interrupted new-source publication, stale deletion
proofs and recreation are covered without a full rebuild. T018 stays open for
real capacity/latency, complete cost and hosted evidence; those external gates
remain explicitly user-deferred. Tasks now **21/159 checked**. No migration,
push, deployment, production change or Apple source edit was performed.


Continuation evidence (2026-11-06, account retirement): T013 is checked for local
implementation. Bounded automatic publication now includes canonical creations,
corrections, refunds, metadata/reverse dependencies, causal account-scope moves,
physical source removal and proven empty-account retirement/recreation. A first
source interrupted before account deletion retains validated birth/generation
proof until coverage application, so cleanup never subtracts an unapplied count.
Strict current-birth pointers reject old lifecycle bootstrap jobs; durable private
retirement certificates resolve stale directory/pending work after short-lived
worker metadata expires. Actual canonical account/transaction records are never
deleted by projection workers. Negative checks cover plain and hashed legacy keys.
Required validation: **1,571 / 443 files / 61.46 s**, runtime/typecheck/lint/build;
additional audit **29 / 323 ms**. Current hosted/DynamoDB/cost acceptance belongs
to still-open T018 and remains explicitly deferred. Task count **22/159 checked**.
The user authorized continued local work; continue the existing US2 security/reset
checks without treating deferred external acceptance as a live PASS.


US2 continuation evidence (2026-11-06): T021/T028/T030 now have local evidence.
Twenty component access/lifecycle/throttle cases pass. All twelve existing PIN
browser cases pass across Chromium/WebKit/iPhone/iPad after strengthening the
password-enrollment journey with actual AES-GCM IndexedDB queued edit/receipt
intent/bytes, non-extractable device-key recovery, forgotten-PIN reset, old-PIN
rejection, new-PIN offline use and wrong-password/successful requirement changes.
Ciphertexts and original queued context remain unchanged across reset/disable/
reenable. Separate origin-outage and real network-offline controls remain passing.
PIN count stays 12, full 556 and quick 31; no timeout/skip/selection changes.
Latest PIN **34.81 s**, quick **29.18 s**; required **1,571 / 443 files / 62.13 s**,
all stages pass. These checks do not complete semantic replay, independent delivery
cursor, all server entry-path security or US2's whole-story gate. T020/T026/T027/
T029/T031/T032 stay open. Task count **25/159 checked**; T018 stays user-deferred.

Local US2 continuation (November 6): T020/T031 are supported by actual generated
self/admin password-reset commands plus canonical session/grant and pre-replay
guard checks. Private recovery-secret version metadata survives administrator
password-version changes; Finance verifier/settings and existing encrypted pending
data survive resets. Required validation passes **1,572 / 443 files / 59.25 s**;
PIN browsers **12 / 34.81 s real**, quick **31 / 29.18 s real**. These checks do
not establish actual DynamoDB login/execution or full US2 acceptance. T026/T027/
T029/T032 remain open; independent web delivery and semantic replay are unfinished.
Tasks now **27/159 checked**. See runtime report for all intermediate failures.


November 7 user clarification: **there is no Finance data currently in Naaseh**.
All data will be imported or come through the SimpleFIN bridge. Treat the estimated
five-year/15,000-row setup as **new ingestion**, including canonical import writes,
publication, retries and normal monthly activity, not backfill of existing rows.
This resolves the earlier source-versus-existing-history question; do not ask it
again. It does not establish actual file counts or provider historical coverage.
Keep the explicit migration unrun and the combined $6.50/month ceiling with 30%
contingency. Initial ingestion/capacity/cost evidence remains required; nothing
was imported into AWS or production by this clarification.


Server gate evidence (November 7): T026 is checked for local canonical session/PIN/
revision checks on Finance, indexed query creation/status/results, generic Finance
sync and task-derived responses; generic attachment Finance parents are rejected.
Scope/member snapshots and private source provenance prevent stale protected
responses; old idempotency replies are tied to scope authorization revisions and
task-bearing replies recheck current task visibility. Required validation passes
**1,593 / 446 files / 60.00 s**, current-entry-point contract/security/generated-
command fixtures pass. Real DynamoDB/hosted evidence remains explicitly deferred.
This does not accept connected browser cache/source authorization, web Finance
transport, semantic replay or the whole story: T027/T029/T032 remain open.
Tasks now **28/159 checked**. No Apple implementation, push, migration or deployment.


November 7 T027 partial evidence: ordinary web sync explicitly requests contract8
with Finance delivery withheld; both known and unknown future Finance types stay
out of ordinary records, including tombstones. Finance cursor remains unchanged,
ordinary task cursor advances and unavailable Finance security does not block that
held path. Legacy missing-flag behavior remains covered. Three added tests bring
required validation to 1,596 / 446 files, PASS 60.05 s real. No new task checkmarks:
connected protected cache authorization/transport and replay still unfinished;
28/159 checked. See runtime report for red/failure/before-after browser evidence.


November 7 initial-import scope resolved by user: transaction records only, no
receipt photos/PDFs. Household sizing records zero initial receipt files/bytes;
transaction import validation/staging, canonical ingest/index publication and
ordinary monthly work remain counted. Do not remove the receipt feature or the
separate receipt-heavy stress workload. This documentation-only clarification
adds no tests/checkmarks and does not accept T018 or change the $6.50/30% ceiling.


November 7 replay-lifetime evidence for T027/T029: actual outbox replay keeps
preparation, HTTP and result handling inside the original Finance visit; lock/
reopen aborts it. Acknowledgement and encrypted conflict storage commit atomically
against the exact pending ciphertext and roll back on lock, preserving intent,
receipt bytes and device key. Five added checks: required 1,601 / 446 files PASS
67.52 s real; focused 37 / 3 files / 294 ms. Real Chromium/WebKit IndexedDB rollback
and fresh commit probes pass (1.20 s real). This does not implement server semantic
replay or connected cached-source verification: T027/T029/T032 stay unchecked,
28/159 tasks checked. Runtime report contains all red and before/after evidence.


November 7 cached-source verification progress (T027/T029): opt-in contract8 sync
uses opaque user-bound source proofs, canonical permission counters/memberships/
task ACLs, cumulative dependencies, independent read rounds and current PIN/session
checks. Cache-only verification never hydrates or acknowledges Finance rows.
Encrypted checkpoint/proof/generation commits are atomic. Revocation and failed
cache proof remove projections/checkpoint while retaining encrypted pending edits,
conflicts/receipt bytes/key/ordinary cursor. Repository, cached budget/search load
and embedded task reads use short-lived generation-bound leases, checking online
before and after batch delivery; concurrent widgets share checks. Offline use
requires a trusted checkpoint and existing offline security; disconnected remote
revocation cannot be learned. Unproven legacy/proposal projections are held until
an authorized rebuild/replay. Final sequential required 1,613 / 447 files / 64.71s
PASS. Real Chromium/WebKit crypto/IndexedDB probes pass (1.42s); runtime report
records both invalid/interrupted full attempts and the ongoing clean repeat.
Tasks remain28/159: independent new-row hydration/transport, server semantic replay,
remaining memory-search/API-derived view revalidation and full US2 acceptance are
unfinished. No new checkmarks from these partial pieces. No cloud/hosted/cost
acceptance; keep migration unrun, Apple edit/outputs, $6.50 ceiling/30% reserve.

Final November7 local regression gate: required1,613/447files PASS64.71s;
full536pass/20existing skips/556selected PASS404.97s; quick 31PASS29.09s. All browser
recovery fixture corrections preserve their safety assertions and selections;
all failures/reproductions/timings remain in runtime report. Task count stays28/159
because new-row transport, real server semantic replay and remaining memory-view
source audits are unfinished. No deployment/migration/hosted/cost acceptance.


November7 continued local evidence: user confirms50receipts/month atapproximately
2MB each, keep S3Standard/no automatic tier transition; initialreceiptimport0.
Existing infrastructure case now guards the compliant bucket policy (no addedcase).
Offline receipt-growth artifact/model preserves paid backup/version/scanning/
download sensitivities and the$6.50/30% ceiling; no T018/cost acceptance. Ongoing
receipt views/month is the remaining sizing question; upload count/size/tier is
resolved. Combined-search in-memory queries now recheck source rights before
returning hits, suppress stale query completions/false confirmed-empty states and
keep ordinary results available. One new required UI case:1614/447files PASS58.93s;
focused18/2files/728ms; existing four-project search matrix16PASS21.08s after an
empty-cache fixture correction, all prior red evidence in runtime report. Full556
last passedbeforethisnarrowUIchange; finalquick is measured separately. T027/T029/
T032 remainopen(new-row transport,serverreplay,otherAPI-memory views),28/159checked.

Final retained-memory search local quick:31PASS/28.53s. Required1614/447PASS58.93s;
search16PASS21.08s. No new taskcheckmarks or full matrix claim for the narrow UI
change. Latest handoff header resolves receipt count/size/Standard preference and
identifies only the receipt-view count as pending cost-sizing input.

Receipt-view assumption (November7): “twice” interpreted as2 total views/month;
100/month alternate and1000/month stress retained in reproducible receipt model.
Counts,size,Standard preference and initialreceiptimport0 unchanged. Planning-only
update; no new test cases/checkmarks, no T018 acceptance or increased ceiling.


T027 partial local evidence (November 7): budget-update replay now uses the
protected canonical Finance PATCH boundary, stable intent-bound idempotency and
post-commit current-session/source checks. Identical retries, changed/missing
intent evidence, stale versions and lost-session/fresh-session recovery are
covered. Other Finance commands remain pending; complete replay/hydration and
legacy-client acceptance are still unfinished. Required 1,620 / 448 files PASS
65.29 s; final focused 45 / 4 files PASS 384 ms, typecheck/lint PASS. No additional
checkboxes checked; T018/T027/T029/T032 remain open.


T027 additional partial evidence (November 7): authorized one-page foreground
Finance pull now persists encrypted known-kind records/tombstones and its own
proof/checkpoint atomically, never ordinary progress; original-visit abort, known
revocation, pending-byte retention, same-tab cache-batch serialization, cross-tab
CAS and cross-kind collision preservation are covered locally. Required1,631 /
449files PASS58.92s; quick 31 PASS28.23s; real Chromium/WebKit IDB/AES probe PASS.
All mutation families, restore/catch-up and full US2 source/read path acceptance
remain incomplete; no new task boxes checked.


T027/T029 partial source-proof follow-up (November7): optional scalar/account/
transaction REST snapshot proof issuance, safe multi-proof combination, immutable
feed envelope compatibility, complete current-kind locator writes and conditional
locator namespace protection are locally covered. Unknown/unimplemented feed
kinds now hold the Finance cursor with upgrade-required while ordinary progress
continues. Required1,642 /449files PASS59.92s; current Chromium/WebKit real IDB/AES
probe19flags PASS. Full retained-API-memory client integration and remaining
command/catch-up/legacy UI paths are still unfinished.28/159tasks checked; no new
checkboxes marked or actual migration/deployment performed.


T029 additional local boundary (November7): transaction REST snapshots now combine
source proofs before use, retain values in visit-bound opaque memory, revalidate
local index/detail reuse and dispose all labels/values on lock/failure/unmount.
A readonly key/outbox classification lets pending CSV work bootstrap an otherwise
empty server cache without blessing that pending row. Required1,652/451files PASS
60.70s; affected16 browsers PASS18.83s; quick 31PASS29.65s; real Chromium/WebKit
IDB/AES21flags PASS. Other REST-memory paths, parent feed/catch-up, command families,
full US2 and cost/external acceptance remain incomplete. No new task boxes checked.


November8 local compatibility evidence: new opening/CSV IDs match existing wire
contracts, existing IDs stay stable, and interrupted100-row replay preserves20
previously saved IDs and identical-looking legitimate rows. Legacy CSV transport
identity/provenance is covered. Expected-user consistency now protects Finance
API, sync, management and unlock/revoke without granting header-derived authority
or requiring existing clients to send it. Required1,655/451files PASS60.34s;
affected32browser cases PASS48.31s. T027/T029/T032/T018 remain open; no additional
checkboxes, actual migration, deployment or native changes.


November 8 canonical feed/catalogue checkpoint: shared legacy commits publish
missing events for supported canonical sources atomically with their records,
without duplicating explicit service events. Actual handler fixtures cover account
rename catch-up from cursor zero, a protected PUBLIC merchant event, ordinary
withholding, and later merchant physical deletion invalidating its prior proof.
Category/merchant withdrawals advance private catalogue authorization metadata;
ordinary edits do not. Empty and source-bearing proofs include this dependency;
older authentic proofs require refresh under private semantics version 2, retaining
fc1/protocol 1 and legacy DTO compatibility. No new resources/migration/cloud writes.
Required 1,661/451 files PASS58.48real/239.34user/48.75sys; final strengthened focused
58/5 files PASS374ms. Quick 31 PASS27.9sPW/28.22real/39.02user/7.91sys. Full matrix
currently running against this unchanged browser build. Initial required failure
and fixture correction are recorded in the runtime log. No task boxes checked;
T018/T027/T029/T032 remain open, including other retained API views, replay families
and catch-up/bootstrap coverage. New catalogue reads and canonical feed writes
remain unallocated in cost acceptance. Apple user diff 1/1 and outputs preserved.


November 8 — account API-memory and CSV queue visit safeguards (partial T029).
Account lists now use opaque API snapshot tokens, verified reads before publishing
or opening retained details, explicit Refresh accounts, and disposal on lock,
unmount or owner switch. A keyed owner view removes the prior user's state
immediately. Known locks/failures clear labels, balances, selected details and
unsaved form fields even with Require PIN off. Late reads and delayed create
responses cannot repopulate the old visit. After account creation/name/balance
writes the list is reloaded through authorized snapshot evidence; the mutation
DTO itself is not treated as proof. Account detail callbacks wait for that reload,
and refreshed lists are hidden while checking. This is not complete proof
integration for all account-detail previews, connections, budget or reusable
views, nor bounded-query/whole-story/cost acceptance.

The offline CSV queue now captures the original unlocked visit across encryption
and passes its abort signal into every existing atomic record/outbox write. A
lock/reopen or user switch cannot enqueue old plaintext into a new visit. An
already committed chunk remains byte-preserved while a later chunk is rejected.
No pending queue format, automatic replay support, crypto parameters, migration,
receipt retention or AWS resource changed. The browser fixtures supply synthetic
GET proof headers and local cache-check responses; real server proof crypto has
separate integration/security coverage. Current expected test discovery1,666/
452files; required PASS61.38real/242.10user/49.91sys (Node24). Synthetic Chromium+
WebKit IndexedDB/non-extractable AES probe: all22 flags per browser PASS1.43real/
0.68user/0.30sys, including delayed CSV encryption cancellation. Quick 31 and the
84 affected browser cases pending. Last full536pass/20existing skips/556selected
403.97real covers the prior canonical-feed checkpoint, before these account/CSV
changes. No new task checkmarks:28/159; T018/T027/T029/T032 stay open. Apple1/1 user
diff and outputs remain preserved; no push/deploy/cloud writes/migration.


Final November8 local account/CSV checkpoint: required1,666/452files PASS61.38real/
242.10user/49.91sys; standalone1,666/452files PASS50.66real/225.42user/49.01sys;
quick 31 PASS27.7sPW/28.07real/38.53user/7.77sys; affected84/8files PASS53.7sPW/
54.10real/42.20user/9.87sys; full536passed/20existing skips/556selected PASS
408.06real/256.08user/63.75sys on the current account/CSV build. Real synthetic
Chromium+WebKit IndexedDB/AES probe22flags per engine PASS1.43real/0.68user/0.30sys.
No selection, timeout, retry, workflow or skipped-case expansion. No build or
other test suite ran during the final full-browser matrix. Hosted duration and
real DynamoDB acceptance remain deferred, not inferred from these local results.
28/159 task boxes remain checked. Independent supported replay families, remaining
retained API views, bootstrap/catch-up coverage and complete T018 cost acceptance
remain open; do not mark T027/T029/T032 complete from this checkpoint.

User sent Continue while the foreground-hours question was pending; that is not
an estimate of usage. Confirm visible client-hours before treating household
request allocation as a user-confirmed forecast; earlier answers remain intact.
No AWS/migration/deploy/push action occurred. Branch/feature pointer preserved;
Apple project retains its pre-existing1/1 user diff, and outputs remains untracked.

November8 user usage clarification: ten hours/day Na'aseh overall, including two
hours Finance/budget; concurrency unconfirmed, two clients remain sensitivity.
Current unlocked scheduler can run throughout all ten hours:18k protected polls/
30days per equivalent client,36k for two; not capped at3,600by the Finance screen.
Recorded in docs/testing/finance-foreground-sync-sizing.json. Existing idle route
case now measures3security snapshots/9items,3bounded feed queries,4metadata gets
(down from5),0writes/no history hydration. Prior authenticated catalogue scope is
merged before seeding; both canonical scope rounds remain. No test-count change:
1,666/452files. Initial measurement assumption omitted ACCESS feed (1failed/27
passed/28cases487ms); corrected baseline28PASS372ms. Optimization red1failed/27
passed366ms; final focused46/3files PASS335ms. Required rerun pending. This is
local command-count evidence, not real capacity/cost acceptance or task completion.

November8 usage/idle optimization required validation PASS:1,666/452files,
63.53real/242.36user/50.03sys. Count unchanged; existing actual-route case now
asserts3transactional security snapshots/9items,4strong metadata gets,3bounded
empty feed queries,0writes, no source-history hydration. Focused46/3files335ms
PASS includes catalogue withdrawal/race, older proof semantics, contradictory
proof bundle and ordinary progress checks. Quick 31 rerun pending. Last full
536passed/20existing skips/556selected408.06s covers the unchanged web build
before this API-only proof-seeding optimization. No task boxes added, hosted
duration/real capacity/cost acceptance deferred. No cloud/migration/Apple action.

November8 merchant activity snapshot foundation (partial T029): two new jsdom
cases bring required discovery1,666/452 to1,668/453files. Baseline required
1,666PASS63.53s, quick 31PASS28.12s. New merchant cases red2/2failed2.40s; actual
merchant snapshot route initially rejected opt-in (1failed/27passed/28cases425ms).
GETmerchants/{ULID} now supports the existing opaque proof protocol; legacy DTO
unchanged. Real injected SDK fixture compares legacy/proven activity containing
a synthetic private transaction, rejects its proof after owner authorization
revision changes, refreshes it, then rejects that proof after catalogue deletion.
Detail uses WeakMap API-memory tokens and verified reads, owner/merchant keyed
remounts, lock/unmount disposal, pre/post-preview checks, guarded deletion and
late-load/late-preview suppression. Network/access failure never appears as an
authorized empty activity list. Merchant list and other retained views remain
partial; no whole-story, bounded legacy GET, live cost or AWS acceptance claim.
Final focused46/4files PASS379ms. Required1,668/453files PASS61.83real/242.93user/
49.07sys, typecheck/lint/build included. Existing transaction browser journey
now supplies a synthetic merchant GET proof and revokes it before removal preview;
all12cases/4projects PASS13.1sPW/13.44real/12.98user/2.65sys. Quick 31 pending,
selection/workflow/timeouts/skips unchanged. Apple1/1 and outputs preserved.
No migration, cloud action or task checkbox change.

November8 task-bearing API evidence foundation (partial T029): final canonical
task-response checker now returns private task authority snapshots to the
request-local proof issuer instead of discarding them. The explicit opt-in GET
/tasks/{ULID}/link route carries these dependencies; ordinary legacy DTOs and
non-opt-in authorization remain unchanged. A task becoming private must invalidate
previous cached Finance link evidence even if no Finance scope changed.
The existing actual storage task/link atomicity case now proves this: unsupported
route red1failed/27passed28cases559ms; after permitting the route but without
task dependencies, proof renewal wrongly returned current (red1failed/27passed
340ms). Capture from the final current-task check fixes it while retaining both
independent task/scope/membership proof verification rounds and canonical session
checks. Provider-only taskId fields remain excluded/no task lookup. Internal
checker returns[] for no references; no public contract change. Focused52/4files
PASS381ms, required count unchanged1,668/453files; rerun pending. A task-bearing
proof adds its existing two current task metadata reads per renewal; this is not
an allocated household bill or permission to increase cost. The new REST route
is a safe primitive, not a claim that the local embedded reader now calls it or
that all replay/cache/bootstrap work is complete. T018/T027/T029/T032 stay open.
Merchant quick 31 PASS28.9sPW/29.27real/37.66user/7.91sys; merchant/transaction12
PASS13.44real. Last full536/20/556408.06real predates merchant API-memory and the
new task-proof primitive. No selectors, timeouts, retries, skips or workflow
changes, migration, cloud writes, push/deploy or Apple edits.

November8 post-save transaction authority foundation (partial T029/T012): raw
mutation DTOs no longer replace retained transaction/search data. One new jsdom
case observed red1failed/2passed3cases2.72s; initial graph-reload implementation
focused14/4files PASS1.85s, required1,669/453files PASS60.97real/242.00user/50.10sys.
That experimental whole-graph reload after each correction was superseded before
browser acceptance because it would repeat legacy history hydration per edit.

Final path: additive GET/finance/transactions/{id} uses canonical locators and
current source/parent authority before returning a row, never forActor/history
Query or a missing-locator fallback. ULID and bounded legacy CSV batch:ordinal
IDs are accepted; tombstones/withdrawn/unauthorized/missing sources return no body.
Optional protocol1 proof headers retain both current-check rounds and canonical
PIN/session checks. Existing actual SDK case asserts0Query commands for current
source and missing locator (initial unsupported route red1case). No migration or
old endpoint/Apple DTO changed. Two new API-memory combination tests bring total
1,669to1,671/453files: red2failed/7passed9cases183ms; opaque combined context
requires same active controller/generation and complete source lease, rejects
ingredient disposal mid-read, survives ordinary disposal of old view tokens and
never persists plaintext. Focused55/5files PASS1.90s.

Transaction saves now point-read the affected row; transfers point-read both
known legs. Existing graph and new rows are combined only from verified contexts;
old callback/query generations cannot clear or overwrite a new snapshot. All
new/old tokens are disposed on lock/unmount/obsolete result. Source proof authority
changes fail closed and ask for explicit refresh. Initial page load remains the
legacy graph GET and is not bounded-read/cost acceptance. Current required1,671/
453files PASS61.16real/243.32user/49.05sys, typecheck/lint/build included. Browser
16affected cases running against current source; quick 31 to follow. No new
selectors/timeouts/skips/retries/workflow changes, task boxes or cloud action.

November8 pending-recovery and known-source failure foundation: invalidating
Finance server cache now atomically retains encrypted record IDs referenced by
Finance outbox intent, preserving legacy CSV account metadata as well as encrypted
payloads/bytes/conflicts/key. Retained rows are not retagged with server trust.
Scope purges retain pending staging, remove ordinary revoked projections and
clear the current user's entire proof checkpoint so a known revoked scope cannot
reappear through an old offline cache generation. Unrelated encrypted rows can
remain but are unproven until a fresh authorized snapshot; offline verifier stays
closed on known revocation. All existing pending bytes/intent remain unchanged.

Two new DB cases (staging/intent byte equality, post-refresh cache-decrypt denial,
commit rollback) bring1,671to1,673/453files: red1failed/23passed24cases211ms; initial
post-fix existing test still expected pending staging deletion (1failed/23passed
209ms), updated to retain encrypted staging. Scope-purge assertion red1failed/
23passed190ms; both pending rows and obsolete checkpoint now handled atomically.
Four API snapshot source-error cases401/403/404/409 bring1,673to1,677/453files:
red4failed/9passed13cases184ms. Known GET failures now invalidate cache authority
only while the original controller is still active, preserving pending staging
under the same invalidator and avoiding a different user's cache. Network-only
failures do not invent a known revocation. Focused85/7files PASS2.01s. Required
validation running. Browser synthetic IDB/AES probe updated for24flags (including
derived snapshots and pending staging); not yet rerun. No task box, selectors,
timeouts, skips/retries/workflow, cloud or migration changes. Apple/outputs intact.

November8 known ordinary-task revocation fence (partial T029/T027): ordinary
task tombstones/deletions now invalidate current Finance cache evidence after
ordinary cursor/storage commit. This covers cached task-link evidence even while
Finance is locked and an active legacy view without a registered snapshot. The
coarse opaque-proof fence does not infer which task is linked; unrelated task
tombstones can conservatively require a Finance refresh. No server request or
task/link existence signal is added to locked task controls. Cleanup preserves
pending staging/bytes/intent and cannot roll back ordinary cursor progress. On
Finance storage failure, the controller stays stale and the helper absorbs the
private cleanup error so ordinary sync continues. Existing empty locked visits
without a checkpoint remain untouched. Three new cases bring1,677to1,680/453files:
red3failed/24passed27cases196ms; focused44/3files PASS210ms. Required rerun pending.
No new timeout/retry/skip/selector/workflow change or task boxes. Previous full
536/20/556408.06s is not acceptance of the new merchant/point-refresh/recovery
changes. Browser25-flag probe prepared; it has not yet run.


Final November8 foundation checkpoint (current frozen source):
- Required `npm run validate`:1,680tests/453files PASS61.86real/242.42user/49.87sys;
  runtime/typecheck/lint/all workspace builds pass.
- Standalone `npm run test`:1,680tests/453files PASS50.43real/222.93user/47.52sys.
- Quick browser command:31PASS28.8sPW/29.11real/38.08user/7.92sys.
- Full browser command:536passed/20existing skips/556selected PASS403.67real/
  256.47user/62.90sys across Chromium/WebKit/iPhone/iPad.
- Actual synthetic browser IndexedDB/non-extractable AES probe:25flags per engine
  PASS1.40real/0.67user/0.30sys in Chromium and WebKit.
No build, other test suite or source mutation ran during the final full matrix.
Existing required workflow/quick/full selection, skips/retries/timeouts unchanged.
Existing CloudFront `/api/v1/*` behavior uses CACHING_DISABLED plus
ALL_VIEWER_EXCEPT_HOST_HEADER, so the source configuration needs no new request
header allowlist for the opt-in proof and expected-owner headers. This is local
configuration review, not hosted request observation. No infrastructure was
deployed. Branch remains codex/task-item-creation-uploads at fdc6505bb17bc6572dfa8d461ee629c037328b7f;
feature pointer remains016. Apple project retains its pre-existing1/1 user diff;
outputs remains untracked and preserved. No push/merge/deploy/production changes,
real DynamoDB calls or migration. $6.50/month including 30% ceiling unchanged.

28/159boxes checked, unchanged. T018/T027/T029/T032 remain open: real capacity,
hosted latency/runtime and complete cost acceptance are deferred; legacy budget/
reusable/other retained-view proof integration, further semantic replay families,
catch-up/bootstrap and full lifecycle acceptance still require their own evidence.
The task privacy cache fence is deliberately coarse and can require a Finance
refresh after an unrelated ordinary task tombstone; ordinary task cursor progress
is committed first and pending encrypted staging/commands/bytes stay retained.
No feature/story or release acceptance is claimed by these local checks.


### November 8 continuation: security refresh and boundary visit isolation

Local T029 work continues; no task or story acceptance is added. An in-flight
security refresh now binds both HTTP requests to the controller's lock lifecycle.
A lock aborts them, and even a transport that delivers responses after cancellation
cannot clear known-stale state. Refresh refuses a different controller owner before
making requests. Synchronization checks its visit generation inside the storage
update and again before publishing the result; cancellation preserves the durable
offline verifier/throttle rather than deleting it. A fresh authorized refresh still
succeeds. These changes add no API requests or DynamoDB reads.

The shared Finance boundary now withholds children if its owner differs from the
active controller. Owner/controller replacement remounts protected children and the
PIN form, discarding the previous component's retained data and typed PIN. This
covers common boundary isolation only: budget/reusable/detail retained source-proof
integration and semantic replay families remain unfinished. PIN-off source revocation
and hosted lifecycle acceptance are not claimed by these component fixtures.

Before adding these six required regression cases, the measured baseline was
1,680/453 files: required 61.86 s, standalone 50.43 s, quick 31/29.11 s,
full 536 passed +20 existing skips/403.67 s. Expected red cases: security refresh
3/3 failed (247 ms; an early assertion also produced an unawaited-assertion diagnostic,
corrected by settling the deferred request); boundary owner/visit isolation 3/3
failed (274 ms), demonstrating retained private DOM. The refresh fixture was then
strengthened with a valid successful response shape, exact AbortError assertion
and a succeeding fresh refresh. Focused final checks: 61 cases/7 files PASS/443 ms.
Intermediate required 1,683/454 PASS/67.03 s, then 62.53 s after fixture strengthening.
Current frozen-source required: 1,686/455 PASS/63.57 real, 252.67 user, 51.84 sys;
runtime/typecheck/lint/build pass. Standalone and current browser results follow.

Required workflow and quick/full selections, retries, skips and timeouts are
unchanged. Hosted duration remains deferred/unmeasured for this unpushed WIP;
local timings do not establish hosted acceptance. Node 24.18.0 / Playwright 1.64.1.
28/159 task boxes remain checked. Apple edit and outputs preserved; migration,
real DynamoDB and hosted acceptance remain deferred, $6.50 ceiling unchanged.


Final November 8 security-refresh/boundary checkpoint, frozen source:

| Command | Result | Real / user / sys seconds |
| --- | --- | --- |
| `npm run validate` | 1,686 passed /455 files; runtime, typecheck, lint, builds pass | 63.57 /252.67 /51.84 |
| `npm run test` | 1,686 passed /455 files | 52.77 /237.46 /50.14 |
| `npm run test:e2e:quick` | 31 passed; Playwright 28.2 s | 28.61 /40.33 /8.06 |
| `npm run test:e2e` | 536 passed, 20 existing skips, 556 selected | 413.26 /271.11 /66.40 |
| Synthetic real-browser encrypted-storage probe | 25 flags each in Chromium and WebKit | 1.96 /0.72 /0.31 |

Commands ran sequentially on Node24.18.0 / Playwright1.64.1; full browser execution
used temporary `caffeinate -i`. No builds, other test suites or source changes ran
alongside the full matrix. The existing browser fixtures log refused requests to
the absent loopback API for some background calls; there were no test assertion
failures in the final required, standalone, quick, full or storage-probe runs.
The six expected red regression cases and intermediate measurements are recorded
above. No selectors, skips, retries, timeouts, workflow, dependencies or Apple files
were changed by this batch. Hosted duration remains unverified; no hosted PASS.

Branch `codex/task-item-creation-uploads`, HEAD `fdc6505bb17bc6572dfa8d461ee629c037328b7f`
and feature pointer `specs/016-finance-experience-expansion` remain correct.
`git diff --check` passes. The pre-existing Apple project 1/1 edit and untracked
`outputs/` remain preserved. 28/159 boxes checked, unchanged; T018/T027/T029/T032
remain open. Budget/reusable retained source proofs, other semantic replay and
catch-up/bootstrap acceptance still need work. No new user answer is needed by
this checkpoint. $6.50 combined monthly ceiling including 30% contingency remains;
no push, merge, deploy, production change, real DynamoDB call or migration.


### November 9 continuation: bounded protected Finance catch-up (T027 partial)

Requirements checklist16/16 complete, no extension hooks. The existing branch,
feature016 pointer, Apple1/1 project edit and untracked outputs remain preserved.
No patch, reset or fresh pull was applied over the continuation WIP.

Server feed reads retain SDK continuation metadata privately in a WeakMap keyed
by the unchanged returned array. The additive `financeHasMore` flag uses that
metadata even for a size-limited page below200 items. SDK keys are not sent to
clients. The hint describes the raw audience feed, which may contain only
ordinary events; it is not evidence of additional authorized Finance records.
Locked/unsupported/refresh-required paths set it false and retain the protected
cursor. Existing source, role, session and proof checks remain in place.

The PWA runs at most five sequential protected pages per foreground cycle,
committing each encrypted page/proof/Finance cursor before requesting the next.
It stops on missing/false continuation, malformed/non-advancing continuation,
failed request, lock or controller replacement. Ordinary task progress commits
first. An older server without the hint permits one page with continuation
unknown. Idle polling gains no speculative follow-up; no timer, history scan,
whole-scope fallback or new AWS resource was added. The original single-page
entry point remains available. Catch-up is not initial history bootstrap.

New required cases: nine, bringing1,686/455 to1,695/455. Before expansion,
required validation PASS62.36real/241.49user/51.91sys; quick 31 PASS28.27real/
38.71user/8.10sys. Expected red:9failed/28passed/37cases/3files,330ms.
Focused implementation:37passed/3files,304ms. Intermediate required1,695
PASS63.88real/246.68user/49.82sys before browser-fixture extension.

The existing PIN journey now verifies three sequential protected pages through
the built PWA and real encrypted IndexedDB, including an ordinary-only middle
page, record version2, matching proof generation, non-extractable key and separate
ordinary cursor. The first attempt used page-route interception: Chromium passed,
WebKit/iPhone/iPad failed with zero intercepted delivery requests (1pass/3fail,
22.4sPW/22.76real/15.19user/2.66sys). Trace inspection showed service-worker
requests bypassing that mock in WebKit. Moving pagination to the existing
synthetic HTTP server fixed all four unchanged projects:4PASS25.9sPW/26.27real/
16.17user/3.16sys. The fixture also returns the proper existing Journal version7
response instead of the old malformed generic body. No timeout/retry/skip change,
new test case, browser encryption change or Keychain intervention was needed.
Synthetic proof responses are not live API/DynamoDB acceptance.

Final frozen-source required validation1,695/455 PASS61.31real/242.24user/51.72sys,
including runtime/typecheck/lint/build. Standalone1,695/455 PASS51.41real/
225.65user/49.44sys. Quick 31 PASS29.3sPW/29.71real/38.34user/7.96sys.
Full556 running sequentially afterward with temporary `caffeinate -i`.
No application or test code changes/builds/other test suites run alongside the
full matrix. Existing workflow, selection, skips/retries/timeouts stay unchanged;
current hosted duration is unverified, and no hosted PASS is claimed.

See `docs/testing/finance-catchup-sizing.json` and the cost report's November9
section for request-count arithmetic and backlog sensitivity. Idle18,000
protected calls per ten-hour-equivalent client/month are unchanged; continuously
full five-page bursts would be a stress90,000 (72,000extra), not a household
forecast or allocation acceptance. Extra dependency reads/compute still need
measurement within the unchanged$6.50 ceiling including 30% contingency.

28/159 tasks remain checked. T018/T027/T029/T032 stay open: initial history
bootstrap, other semantic replay families, remaining retained-view source proofs,
full lifecycle and current cost/hosted/live capacity acceptance are unfinished.
No native Apple edits/validation, push, merge, deploy, production changes, real
DynamoDB calls, migration or transaction deletion were performed.


Final November 9 protected catch-up checkpoint:

| Command | Actual result | Real / user / sys seconds |
| --- | --- | --- |
| Required `npm run validate` | 1,695 passed /455 files; runtime, typecheck, lint and builds pass | 61.31 /242.24 /51.72 |
| Standalone `npm run test` | 1,695 passed /455 files | 51.41 /225.65 /49.44 |
| Quick browsers | 31 passed; Playwright29.3s | 29.71 /38.34 /7.96 |
| Full browsers | 536 passed, 20 existing skips, 556 selected | 407.01 /259.87 /64.23 |
| Existing synthetic encrypted-storage probe | 25 flags per engine in Chromium and WebKit | 1.21 /0.67 /0.29 |

All final commands passed sequentially on Node24.18.0 / Playwright1.64.1. The
single-page compatibility entry point also passes the existing real-browser
storage probe. During the full matrix, application/test code was frozen and no
other suite or build ran concurrently. Existing mock-background loopback proxy
warnings and build-size warnings do not represent assertion failures. The initial
nine regression reds and three service-worker fixture failures are recorded
above; final required, standalone, targeted, quick, full and storage runs are green.
Existing required workflow, case selections, retries, skips and timeouts are
unchanged. These local results do not verify hosted duration or real DynamoDB
capacity, latency, total history coverage or a current combined bill.

28/159 boxes remain checked; T018/T027/T029/T032 remain open. Catch-up delivers
bounded continuation, not initial history bootstrap or other semantic replay
families. The sizing record separates idle polling from backlog stress; extra
read/proof/compute quantities still require acceptance within the unchanged
$6.50 monthly ceiling including 30% contingency. No additional user answer was
needed by this implementation batch.

Branch remains `codex/task-item-creation-uploads`, HEAD
`fdc6505bb17bc6572dfa8d461ee629c037328b7f`; the feature pointer remains016.
`git diff --check` passes. Pre-existing Apple project 1/1 edit and untracked
`outputs/` are preserved. No push, merge, deploy, production change, real DynamoDB
call, native Apple implementation/validation, migration or transaction deletion.


### November 9 continuation: protected reusable creation replay (T027 partial)

The existing v8 sync adapter now supports queued `financeReusableItem/create`
with baseVersion0. It preserves the client ULID, validates business input and
consistent local-only metadata, and binds the receipt to exact method/path/intent.
The server derives creator identity. Exact retries return alreadyApplied without
another canonical write; changed intent or claimed IDs conflict. Unknown fields
are rejected and other unsupported families/operations remain retry/pending.
Ordinary POST keeps server-generated IDs and its existing DTOs.

The header-gated bridge reuses the existing protected proxy/handler/function. It
point-loads the named group, related accounts, active catalogue parents and only
their reference counters. Current membership/session/PIN and final revision checks
remain in place. Foreign pointers are denied before foreign metadata/body reads;
missing locator evidence remains retryable. The record, locator, reference-count
changes, feed and receipt share the existing conditional transaction. Thirteen
additional negative checks on other supported locator namespaces reject known
cross-type claimed IDs without body reads or partial writes. No registry/table,
new IAM permission, scheduler or service was introduced.

Missing metadata is not treated as a new-scope proof. A known row holds replay
pending; otherwise a strongly consistent key-only Query on PK, Limit1, projection
PK/SK checks for any canonical or publication state. A row or continuation holds
replay pending without writes for trusted repair. Only an empty namespace may
initialize metadata under its conditional creation fence. No implicit migration
or empty-history certification of legacy state is performed.

Successful reusable creation acknowledgement retires only its unverified
version1 local draft, atomically with the queue entry, if no sibling intent,
newer draft or verified projection exists. Conflict work and unrelated receipt
bytes stay intact; a late lock rolls back both draft and acknowledgement changes.
Canonical values still arrive through protected feed delivery and gain their
cache generation there; a mutation acknowledgement alone never authorizes a
cached model. This solves first-proof initialization after an offline creation,
not full historical bootstrap.

The existing reusable-item browser journey retains its online creation/copy flow
and now queues an encrypted draft offline, reconnects with the same ID, acknowledges
it, and receives a canonical encrypted copy through the built PWA. Real IndexedDB
assertions verify the non-extractable key, proof generation, original ID, empty
queue and separate ordinary cursor in all four browser/device projects. The
SDK fixture separately verifies the actual replay-to-protected-pull handler path,
zero Finance history queries for existing-metadata creation, and target/unrelated
catalogue counter preservation. These are synthetic API/injected SDK/local browser
checks, not live DynamoDB or hosted acceptance.

Nine required regression cases were added:1,695/455files becomes1,704/455files.
The final focused set is68cases/3files PASS407ms. Targeted browser verification
passes4existing cases/4projects:8.4sPW/8.81real/10.18user/2.04sys; no new browser
case or selection, skip, retry or timeout change. Final required validation:
1,704/455 PASS63.83real/244.82user/51.39sys (runtime/typecheck/lint/build pass).
Standalone1,704/455 PASS52.05real/225.07user/49.42sys. Quick 31 PASS29.2sPW/
29.54real/39.46user/8.32sys. Full556 now running sequentially with `caffeinate -i`.
Application/test code remains frozen during the matrix; no other suite/build runs
alongside it. The runtime report records intermediate failures and corrections.

See `docs/testing/finance-reusable-replay-sizing.json` and the cost report for the
point-Get formula, conditional empty-namespace query,13 transactional admission
checks and exclusions. No new household frequency or billing acceptance is
inferred. The$6.50 monthly combined ceiling including 30% contingency is unchanged.
T018/T027/T029/T032 remain open;28/159 boxes stay checked. Other replay families,
full-history bootstrap, remaining retained-view proofs, lifecycle and hosted/live
capacity/cost acceptance are unfinished. No new user answer was required by this
batch. Apple edit and outputs preserved; no push/merge/deploy/production change,
real DynamoDB call, migration or canonical transaction deletion.


Final November 9 reusable replay checkpoint (runtime source frozen):

| Command | Actual result | Real / user / sys seconds |
| --- | --- | --- |
| `npm run validate` | 1,704 passed /455 files; runtime/typecheck/lint/build pass | 63.83 /244.82 /51.39 |
| `npm run test` | 1,704 passed /455 files | 52.05 /225.07 /49.42 |
| `npm run test:e2e:quick` | 31 passed, Playwright29.2s | 29.54 /39.46 /8.32 |
| `npm run test:e2e` | 536 passed, 20 existing skips, 556 selected | 412.33 /263.17 /64.47 |
| Existing synthetic encrypted-storage probe | 25 flags each in Chromium and WebKit | 1.27 /0.68 /0.30 |

All final runs passed sequentially on Node24.18.0 and Playwright1.64.1. The full
matrix used temporary `caffeinate -i`; no application/test code, builds or other
suites changed or ran alongside it. Existing fixture-background loopback proxy
and build-size warnings did not produce final assertion failures. Required/full/
quick selectors, existing skips, retry counts, timeouts and workflow remain
unchanged. Hosted duration is still unverified; no hosted PASS is claimed.

This batch added nine required cases and extended one existing browser journey.
Exact retries, changed intent, canonical namespace claims, active source checks,
reference counts, missing-metadata retry policy, atomic acknowledgement/draft
retirement and canonical protected delivery have local evidence. The existing
storage probe also passes its prior pending-byte/key/cursor/rollback cases; it is
not a live database or cost measurement. Intermediate failed gates and fixture
corrections remain recorded in the runtime report.

28/159 task boxes remain checked. T018/T027/T029/T032 remain open: other replay
families, initial history bootstrap, retained-view source proofs, complete lifecycle
and external capacity/latency/cost acceptance are unfinished. No $6.50 monthly
ceiling increase is authorized; extra source, condition-check, journal/proof and
compute work remains separately accountable. No new user answer was needed here.

Branch `codex/task-item-creation-uploads`, HEAD
`fdc6505bb17bc6572dfa8d461ee629c037328b7f`, feature pointer016 remain correct.
`git diff --check` passes. Existing Apple project 1/1 edit and untracked outputs
are preserved. No push/merge/deploy, production write, real DynamoDB call, native
Apple implementation/validation, migration or canonical transaction deletion.


## Administrator parity and retained budget boundary — 2026-11-09

User decision: allow an active application administrator's personally owned and
actual active member-group Finance, with ordinary PIN/session checks and group-role
limits. No foreign-owner/nonmember-group, private task or PIN override is granted.
Shared authorization, legacy repository partitions, bounded budget replay and
query actor resolution, canonical source guards and opaque cache proofs now follow
that rule. Finance task relationships explicitly use ordinary task permissions,
without the separate application administrator private-task read override. Existing
administrator MFA and missing-PIN-grant denial remain enforced. The injected-SDK
runtime case exercises own REST reads and protected owner/member feed delivery,
source proofs and bounded budget loading; foreign scopes remain denied before
foreign metadata/body reads.

T029 continuation: budget directory/detail reads now retain verified snapshot
tokens, merge the dependent account/category proofs, recheck before opening/saving,
reload canonical data after writes and fence lock/owner-switch/late-save completion.
Lock clears labels, dependent children and unsaved form values. Partial account-link
failure preserves the created budget and exposes a warning. Existing mobile browser
coverage revokes proof authority with a draft present: the complete Finance boundary
closes, the draft disappears and no budget-create request is made. This does not
complete the reusable-item/receipt/other retained-subview audit or all replay kinds.
No new task was checked: 28/159 remain checked; T018/T027/T029/T032 stay open.

Validation sequence and actual intermediate failures:

- Before expansion: required 1,704 tests /455 files PASS, 66.47 real /251.05 user /
  54.90 sys seconds. Existing quick baseline:31 PASS /29.54 real seconds; full
  selection556 with20 existing skips. No selector/workflow/timeout changes.
- Seven administrator regression cases raised discovery to1,711. Red run:9 failed,
  67 passed /76 (476ms), including two policy expectations updated for this decision.
  First implementation rerun:2 failed,74 passed (501ms): recursive SDK test-spy
  wrapper and a previously blanket-denied same-owner administrator expectation.
  Both fixture expectations were corrected. An HTTP extension initially read the
  proof at the wrong response path (1 failed,47 passed /48,429ms); fixed to the
  existing financeCache.proof envelope. Final focused security/runtime set:91 PASS
  /7 files /467ms. Required 1,711 /455 PASS /66.53 real /253.49 user /55.59 sys.
- Three new budget component cases raised discovery to1,714 /456 files. Red:3 failed
  /2.35s. Green:3 PASS /398ms. Separate typecheck first rejected a React19 useRef
  without explicit undefined initial value; corrected, then typecheck passed.
- Required 1,714 /456 PASS /65.03 real /250.78 user /54.51 sys. Standalone 1,714 /456
  PASS /53.82 real /235.63 user /52.99 sys. Required local runtime remains well
  below ten minutes; current hosted runtime remains deferred/unmeasured.
- Initial targeted budgets:12 passed,4 failed /16 /24.1s Playwright /24.53 real /
  15.73 user /3.38 sys. The new revocation assertions expected a page-level message,
  but traces showed the enclosing Finance boundary correctly closed first. Assert
  the closed boundary and cleared draft/no POST instead. Rerun16 PASS /13.3s
  Playwright /13.64 real /14.00 user /2.93 sys. No retries or timeout increases.

Logs: /private/tmp/finance016-admin-{baseline,red,focused,http,validate}.log and
/private/tmp/finance016-budget-snapshot-{red,focused,typecheck,validate,standalone,
browsers,browsers-rerun,quick,full,storage-probe}.log. Final browser/probe results
follow below when complete. Synthetic browser fixture proofs are not server crypto
acceptance; the independent security and SDK suites cover actual proof issuance.
No production access, real DynamoDB calls, migration, native implementation or
validation, push, merge or deployment. Existing Apple project 1/1 edit and untracked
outputs/ preserved. The approved combined AWS ceiling remains $6.50 with30% contingency.

Quick checkpoint: first run30 passed /1 failed /31 /32.2s Playwright /
32.53 real /41.26 user /8.42 sys. The representative fixture lacked the
canonical budget-detail GET newly required when opening a retained budget;
added its synthetic detail/proof response. Rerun31 PASS /29.1s Playwright /
29.44 real /40.95 user /8.65 sys, versus pre-change31 /29.54 real.
Final lint passed after the browser fixture/assertion changes. Request accounting
is in docs/testing/finance-budget-snapshot-sizing.json, not a metered bill.

Full browser intermediate checkpoint:524 passed /20 existing skips /12 failed
of556,443.45 real /276.79 user /68.09 sys seconds. All twelve were the three
reconciliation journeys across four projects: an inline budget-detail fixture
lacked the synthetic source-proof header. After adding that header, targeted
reconciliation returned8 passed /4 failed /12 /22.1s Playwright /22.53 real /
15.83 user /3.01 sys: the success fixture returned a reconciliation from POST
but did not persist it for canonical GET. Updated that synthetic fixture's state,
without changing production access checks. Targeted rerun12 PASS /9.6s Playwright /
9.97 real /11.79 user /2.08 sys. Full fresh rerun remains separate evidence.
These failures were not accepted as PASS or hidden with retries, timeout increases
or selector changes. Source remained fixed during each full browser run.

Second full checkpoint:535 passed /20 existing skips /1 failed of556,
412.49 real /268.02 user /63.64 sys. All Finance journeys passed. The existing
nested-subtask journey failed on iPhone; an unchanged four-project targeted rerun
reproduced it on WebKit (3 passed /1 failed /10.7s Playwright /11.19 real /
10.08 user /1.76 sys). The test entered its second task before the first asynchronous
save had necessarily reset the form. Added assertions waiting for the empty task
label and enabled Add task button before entering the child; no application-code,
selector, retry or timeout changes. Corrected targeted run4 PASS /6.5s Playwright /
6.87 real /9.17 user /1.48 sys. The required quick selection includes this existing
journey; its before-change baseline remains31 /29.44 real, with a final measurement
required after this correction. These failed full runs remain explicitly failed;
separate targeted passes do not turn them into a full-suite PASS.

Third full checkpoint:535 passed /20 existing skips /1 failed of556,
424.95 real /277.66 user /69.40 sys. Finance and corrected subtask cases passed.
The existing global-list-directory navigation case failed on iPad: after Lists
activation it remained on Global Directory. Unchanged targeted rerun4 PASS /
10.0s Playwright /10.56 real /10.37 user /1.97 sys. No Lists application or test
source change was made; the intermittent failure is preserved as unresolved
stability evidence, not represented as repaired by a passing targeted repeat.

Final quick after the subtask test correction:31 PASS /29.0s Playwright /
29.35 real /41.06 user /8.28 sys (before correction31 /29.44 real; original
batch baseline31 /29.54 real). Selection remains31; no added cases/timeouts.
Existing synthetic encrypted browser probe:25 checks each in Chromium/WebKit
PASS /1.05 real /0.72 user /0.22 sys; no Keychain crash, consent prompt or change
to encryption. A further complete browser confirmation is recorded separately.

Final full confirmation on the fixed source:536 passed /20 existing skips /
556 selected PASS,417.31 real /273.15 user /67.79 sys seconds. All four browser
projects ran uninterrupted and the previously intermittent iPad Lists case passed.
No further Lists source/test change was made; the earlier intermittent failure
remains documented, not claimed fixed. No retry, selector, worker-count or timeout
change. The complete gate is distinct from earlier failed runs and targeted repeats.
Final quick 31 PASS /29.35 real; storage probe 25 checks each Chromium/WebKit PASS /
1.05 real; final lint and git diff --check PASS. Required production-source checkpoint
remains 1,714 tests /456 files /65.03 real, standalone 1,714 /53.82 real.

Next household cost input: one visible active device at a time versus two visible
clients simultaneously during the already confirmed daily use window. Do not
re-ask daily hours, account/transaction/correction quantities, initial import scope,
receipt quantities/tier or retention. Device concurrency remains unconfirmed until
Steve answers. No cost acceptance, migration, production access, AWS write, push,
merge, deployment or native Apple work; $6.50 including 30% contingency remains.
28/159 task boxes stay checked; T018/T027/T029/T032 are still open.


### Household concurrency answer — November 9, 2026

Steve confirmed usually two visible devices simultaneously. Use that as the
primary household scenario during the already confirmed ten-hour daily Na'aseh
window, including two Finance hours. The one-client case is now a sensitivity.
At the unchanged 60-second visible/online/unlocked scheduler and 30-day month,
this means36,000 scheduled protected pulls and72,000 ordinary-plus-protected
core requests, excluding focus/manual calls and other sync/API traffic. The
existing injected idle fixture's small-item arithmetic is846,000 protected RRU
without PIN or1,062,000 with PIN, before active-group/source work; these are
planning quantities, not AWS metering, an upper bound or a combined accepted bill.
No new traffic allowance or $6.50 ceiling increase is implied. Authentication,
groups, proof reads, active operations, compute and other costs remain accountable;
do not add traffic twice against existing allowances. Real DynamoDB/hosted
acceptance remains deferred; no migration or production operation is authorized.
Do not re-ask the device count or the already confirmed household inputs.


### November 9 match-review source boundary (T029 partial)

Four new component cases reproduce revoked-action, superseded-query, late-lock
completion and removal-preview retention failures. Red4 failed /2.59s; green4
passed /461ms. Required discovery increases 1,714→1,718 and files 456→457. The
pre-change required checkpoint was1,714 /65.03 real seconds, quick31 /29.35 real.
Current required 1,718 /457 PASS /68.29 real /256.88 user /53.97 sys; standalone
1,718 /457 PASS /59.14 real /244.89 user /56.57 sys. No required selector,
workflow, retry or timeout changes; current hosted duration remains unmeasured.

TransactionMatches loads and retains opaque API snapshots rather than raw GET
results. A decision rereads the current match and transaction versions under a
complete source lease before POST, ignores the raw write response for display,
and reloads canonical GET results. Removal previews are independently snapshotted.
Changing the transaction input disposes old results; lock/unmount/superseded-load
and late write/preview completion cannot restore private rows, IDs or messages.
No outbox or pending bytes are removed and no new persistent DTO/API is added.
The existing matching browser journey now performs accept, undo and reject while
its synthetic API asserts canonical versions on every decision. Targeted 12 PASS
/14.7s Playwright /15.77 real /14.20 user /3.15 sys. Counts remain quick31/full556
with20 existing skips; no new browser cases. Other reusable/embedded/receipt views
still need their audits, so T029/T032 remain unchecked and28/159 tasks stay checked.

See docs/testing/finance-match-snapshot-sizing.json for four/seven/six Finance HTTP
calls for load/decision/preview, excluding auth/other traffic and source work. The
user confirmed two simultaneously visible devices; group/private layout is asked
separately for cost sizing, not as an access-policy change. No new cost acceptance,
ceiling increase, real DynamoDB, migration, deployment or Apple changes. Logs use
/private/tmp/finance016-match-snapshot-{red,focused,validate,standalone,browsers,
quick,full,storage-probe}.log. Final quick/full/probe evidence follows separately.


November 9 follow-up: Steve confirmed a mix of private personal and shared
accounts. Do not model all eight as exclusively private or exclusively one shared
group, or infer a numerical split. Device count remains two simultaneously visible
clients. He also requested models per budget with a dashboard overview; the meaning
of models (in-app financial planning versus AWS cost estimation) is being clarified
before changing specification or implementation scope. No new story is claimed
implemented from this ambiguous wording. Current validation proceeds independently.


Final match-review checkpoint — November 9, 2026:

- Quick: 31 PASS /30.0s Playwright /30.68 real /41.22 user /9.23 sys seconds,
  versus the unchanged31-case pre-batch baseline29.35 real. No case, timeout,
  worker, retry or workflow expansion; required validation target stays ten minutes.
- Full: 536 passed /20 existing skips /556 selected PASS /420.95 real /
  285.70 user /73.18 sys. Source fixed during the complete uninterrupted run.
- Existing encrypted API-memory/IndexedDB probe:25 flags each Chromium/WebKit PASS
  /1.93 real /0.76 user /0.37 sys. All flags true; no Keychain consent/crash issue.
- Required 1,718 /457 PASS /68.29 real; standalone1,718 /59.14 real. No failures
  after the expected four-test red baseline in this batch. Earlier failed runs are
  preserved separately; none were relabeled PASS. git diff --check passes.

Steve confirmed two simultaneous visible devices and a mix of private/shared
accounts; no numerical private/shared split is assumed. The ten-hour app window
includes two Finance hours. Foreground sizing distinguishes an all-ten-hours
unlocked scenario from two Finance-authorized hours while ordinary sync continues
for ten. These are conditional request/read quantities, not an accepted bill.

He then requested models per budget with a dashboard overview. Clarification is
pending on whether models means in-app financial planning or AWS cost estimation;
no corresponding feature/spec/plan changes have been guessed or implemented.

Branch codex/task-item-creation-uploads, feature016, existing Apple project 1/1 edit
and untracked outputs/ preserved. Extension file absent; no hooks.28/159 tasks
checked; T018/T027/T029/T032 remain open. No deployment, production/AWS write,
real DynamoDB, native Apple change/validation, push, merge or migration. Combined
Finance ceiling remains $6.50 including 30% contingency. Relevant logs and new sizing
artifact are linked/described in the preceding continuation entry.


### Financial planning scope clarification — November 9, 2026

Steve clarified that models means financial forecasts/planning inside Na'aseh.
Detailed models belong to individual budgets; the Finance dashboard should provide
an overview under the viewer's existing access rights. This does not change the
household AWS estimate or ceiling, grant access to another person's private data,
or authorize deployment. Keep the existing spec, plan and task list. The existing
budget/dashboard work provides composition points; no financial forecasting
calculation has been implemented or accepted from this scope clarification.
Resolve the model's calculation/inputs before implementing that dependent feature;
continue the unfinished access/replay foundation first.

Forecast calculation decision is pending: the proposed first version combines
actuals with remaining planned income/expenses and unpaid Upcoming Expenses,
deduplicated by existing links, separately by currency and authorized budget.
The alternative is predicting future amounts from historical patterns. This is
a product-method clarification, not an AWS cost question. No forecasting
implementation or task completion is claimed. See the appended plan proposal.


### Both budget forecast methods — November 9, 2026

Steve selected both known-plan and history-based forecasts. Retain the earlier
per-budget detail and authorized Finance dashboard overview direction. Replace
the proposed either/or decision with two clearly labeled methods/scenarios. Never
sum alternative forecasts, silently convert currencies, disclose inaccessible
history, or count a linked planned/upcoming/actual obligation more than once.
Keep projected budget surplus/shortfall separate from actual bank cash balances.

Known-plan inputs are actual activity plus remaining explicit plans and unpaid
Upcoming Expenses. The historical method must show its observed period, missing
coverage and insufficient-history state; its statistical result is an estimate,
not an exact committed obligation. No algorithm, historical input scope or model
training has been implemented/accepted from this selection alone. Determine whether
older currently authorized transactions from linked accounts may inform a new
budget even when they were never assigned to that budget. This matters because
there is no existing Na'aseh financial history or prior budget assignment and the
initial five-year import contains transaction records only. Continue foundation
access/replay work before these dependent forecast/dashboard implementations.

No AWS service, AI API, scheduled model job, deployment, migration, ceiling change
or new data access is authorized by choosing both forecasting methods. Existing
plan/task structure is preserved; future work must be additive and evidence-based.


### November 9 reusable-item retained-source boundary — T029 partial

Reusable item lists, budget-specific offers and impact previews now use existing
opaque API snapshot proofs. Form entry and save recheck the retained source lease;
known revocation closes the private view rather than preserving stale selectors.
Lock clears item/offer rows, descriptions, dates, amounts, group/category choices,
notices and the dependent match child. Late loads, previews and writes cannot
repopulate the closed visit. Returning to budgets rechecks the parent's retained
snapshot. An online create ignores the raw write DTO for display and refreshes
canonical items. Copy uses canonical offer data and a freshly loaded budget version,
then reloads offers/budget state instead of locally assuming success data. A valid
offline create still uses the existing encrypted outbox; revocation does not delete
already queued work and no queued notice is published before persistence succeeds.

Four new cases raised required discovery 1,718→1,722 and files 457→458. Expected red:
4 failed /3.75s. Focused reusable/budget/match set:11 PASS /3 files /457ms. Separate
typecheck passed. First required 1,722 PASS /62.00 real /241.38 user /48.69 sys.
Review then closed the Save-button window while its asynchronous preflight ran;
final required 1,722 /458 PASS /60.49 real /243.28 user /48.01 sys. Standalone 1,722
/458 PASS /49.91 real /226.07 user /46.19 sys. No failure after the expected red.

The existing synthetic browser API now persists reusable creates and budget copies
for canonical GETs, supplies source-proof headers and checks expected budget version
on copy. Targeted 12 PASS /12.9s Playwright /13.27 real /13.40 user /2.85 sys,
including encrypted offline draft replay in all four projects. Quick 31 PASS /28.4s
Playwright /28.72 real /38.78 user /7.69 sys, versus pre-batch31 /30.68 real.
No browser cases, selectors, retries, workers, workflow or timeouts changed; full
selection556 with20 existing skips remains. Required hosted duration remains deferred.
The prior required baseline was1,718 /457 /68.29 real. Timings are actual local
measurements, not proof that the added checks improve runtime or pass AWS latency.

Request quantities are in docs/testing/finance-reusable-snapshot-sizing.json.
Proof/GET/group-source work is not folded into an accepted household bill. Both
financial forecast methods are selected; linked-account versus strictly budget-
assigned historical input is pending. Forecast implementation remains dependent on
Foundation and the access story.28/159 task boxes stay checked; T018/T027/T029/T032
remain open. No forecasting UI/algorithm, AWS resource, migration, production write,
native Apple work, push, merge or deployment is introduced. Keep $6.50 including
30% contingency. Apple project 1/1 edit and untracked outputs/ preserved.
Logs: /private/tmp/finance016-reusable-snapshot-{red,focused,typecheck,validate,
validate-final,standalone,browsers,quick,full,storage-probe}.log.


Final reusable-snapshot validation — November 9, 2026:

- Required: 1,722 tests /458 files PASS /60.49 real /243.28 user /48.01 sys seconds.
- Standalone: 1,722 /458 PASS /49.91 real /226.07 user /46.19 sys.
- Targeted matching/reusable: 12 PASS /12.9s Playwright /13.27 real /13.40 user /2.85 sys.
- Quick: 31 PASS /28.4s Playwright /28.72 real /38.78 user /7.69 sys, versus
  pre-change31 /30.68 real. No required selector/workflow/timeout expansion.
- Full: 536 passed /20 existing skips /556 selected PASS /412.09 real /264.53 user
  /64.11 sys. Source fixed throughout; all four projects completed uninterrupted.
- Existing encrypted API-memory/IndexedDB probe: 25 flags each Chromium/WebKit PASS
  /1.25 real /0.67 user /0.30 sys, all flags true. No Keychain prompt/crash issue.

No failing checkpoint after the expected four-case red baseline in this batch.
Earlier failed runs remain documented separately. These are local results, not
hosted runtime, live DynamoDB capacity/latency, forecast accuracy, or combined-cost
acceptance. Both forecast methods are approved direction, not implemented forecast
algorithms. The pending question is whether historical prediction may use older
currently authorized transactions from linked accounts that were never assigned
to the particular budget, or only that budget's assigned transactions. This affects
whether imported history can inform a new budget. Do not infer the choice.

28/159 tasks remain checked; T018/T027/T029/T032 stay open. Existing spec, plan and
task sequence are preserved with additive clarification/evidence only. Correct
branch and feature016; Apple project 1/1 edit and untracked outputs/ preserved.
No push, merge, deployment, production/AWS operation, native Apple implementation
or validation, real DynamoDB call, migration or $6.50/30% ceiling change. Extension
file absent: no before/after hooks. git diff --check passes. Full logs and source-
path request accounting are in the preceding continuation entry.


### Historical input rule accepted — November 9, 2026

Steve permits non-budgeted history when a user explicitly requests it. Budget-only
reporting must use only budget transactions. Default expanded forecast history off;
keep it a separate forecast input rather than widening report filters/actuals.
Use only currently authorized history from the budget's linked accounts for that
explicit opt-in. Do not silently include records assigned to other budgets or
classify missing/unresolved budget metadata as non-budgeted data. Preserve canonical
allocation boundaries for partly budgeted transactions. An option grants no new
account/group rights and does not permit sharing private inputs through a dashboard.

Both forecast methods and the per-budget/dashboard scope remain accepted direction.
History selection is not a forecasting algorithm, model training or completed
dashboard story. Continue foundational authorization/read work before dependent
forecast implementations. No new AWS resource, changed $6.50/30% ceiling, migration
or production operation is authorized.


### November 9 budget-only reporting / optional forecast history policy

User rule: requested non-budgeted history may inform a forecast, but budget-only
reporting uses only that budget's transactions. Existing report predicate and
per-allocation totals already satisfy this boundary. The new shared domain selector
returns budgetRows and optional nonBudgetedRows separately. It defaults opt-in off,
checks supplied canonical budget/account rights, limits extra history to linked
accounts, excludes other-budget/unresolved assignments, preserves historical
budget-assigned portions after unlinking where still authorized, and never mutates
assignment. Inputs completeness is not full query coverage; producer authorization,
canonical assignment resolution and bounded reader coverage remain mandatory.
Existing report filter contracts reject the forecast-only flag. This kernel is not
a model algorithm, model endpoint, trained result or completed dashboard feature.

Added five domain cases and one report security case: required 1,722→1,728,
files458→460. Before:required 1,722 /60.49 real, quick31 /28.72 real. Initial red:
one failed suite (new policy module absent; five tests uncollected), one existing
report case PASS /177ms. First focused implementation:1 failed /5 passed /160ms;
the fixture expected inaccessible linked-source incompleteness while its account
was not linked. First required run:1 failed /1,727 passed /460 files /56.45 real /
234.49 user /49.10 sys; build not reached. Corrected the linked-source fixture and
made unknown legacy assignment kinds fail closed. Final focused6 PASS /2 files /
150ms. Final required 1,728 /460 PASS /62.82 real /245.53 user /50.51 sys;
standalone 1,728 /460 PASS /51.44 real /225.25 user /48.02 sys. Quick31 PASS /
28.3s Playwright /28.69 real /38.61 user /7.92 sys. No selector/workflow/timeout,
worker or retry changes. Hosted duration remains unmeasured/user-deferred.

The clarified forecasting extension is US13 /FR-057–FR-060 /SC-016. Seven additive
T160–T166 preserve all original 159 IDs/checks and run after their Foundation,
access, budget/upcoming, dashboard and reporting prerequisites and before final
feature acceptance. Total166, checked 28 (no task newly checked). This reflects new
user-requested forecast work, not relabeling original unfinished tasks as complete.
Both methods and explicit opt-in were accepted at this checkpoint. The forecast
window decision is recorded in the November 9 forecast window checkpoint.

Selection is pure shared TypeScript: zero AWS/network/persistent operations, no new
route/poller/resource, no migration and no model-cost acceptance. See
`docs/testing/finance-forecast-history-scope-sizing.json`; future forecast costs
remain separately accountable under $6.50 including 30% contingency. Earlier
$6.47 assumptions are not an accepted current bill. Logs:
/private/tmp/finance016-history-policy-{red,focused,focused-final,validate,
validate-final,standalone,quick,full,storage-probe}.log. Full/probe results follow.
Apple directories/project 1/1 edit and untracked outputs/ preserved. No production
operation, native Apple validation, push, merge, deployment or real DynamoDB.


Final history-policy checkpoint — November 9, 2026:

- Required: 1,728 /460 files PASS /62.82 real /245.53 user /50.51 sys seconds.
- Standalone: 1,728 /460 PASS /51.44 real /225.25 user /48.02 sys.
- Quick: 31 PASS /28.3s Playwright /28.69 real /38.61 user /7.92 sys, versus
  pre-batch31 /28.72 real. Required/quick selection and timeout stay unchanged.
- Full: 536 passed /20 existing skips /556 selected PASS /409.95 real /
  260.56 user /63.94 sys, uninterrupted with source fixed throughout.
- Existing encrypted API-memory/IndexedDB probe: 25 flags each Chromium/WebKit
  PASS /1.30 real /0.69 user /0.33 sys; all true, no Keychain prompt/crash issue.

Expected module-absence red and the failed linked-source fixture/required run
remain in the preceding evidence, not relabeled as passes. Final local checks
pass. These results do not claim forecast accuracy or complete forecast models,
hosted runtime, live DynamoDB or a currently accepted combined bill. Existing
budget-only report behavior is reinforced by regression tests; the new helper is
pure source selection with no active model/API consumer or AWS side effects.

All original 159 task IDs/checks are preserved. Seven tasks for new US13 clarify
accepted additional feature work (T160–T166); total 166, checked 28, remaining 138.
No original task was newly checked or renumbered. T018/T027/T029/T032 remain open;
new forecast tasks await their prerequisites and their own evidence. User history
rule was resolved at this checkpoint. The later forecast window decision is
recorded below.

Correct branch codex/task-item-creation-uploads and feature016; Apple project 1/1
edit and untracked outputs/ preserved. git diff --check passes. Extension file
absent, no hooks. No push, merge, deployment, production/AWS write, real DynamoDB,
native Apple implementation/validation or migration. $6.50 including 30% contingency
unchanged. Original receipts stay S3 Standard and transactions do not expire.

November 9 forecast period decision for T160/T162. Use inclusive budget dates for
dated budgets and the next 12 calendar months for open-ended budgets, starting at
the reference date or a later budget start. Users can override either forecast
range without editing the budget. Shared date resolution is implemented. Model,
contract and integration evidence remains outstanding. No task check changed.

November 9 partial T029 evidence. The local Finance handler admits only
the explicit retained budget, reusable-item, match and relevant removal-preview
GET paths for protocol 1. The integration fixture exercises the handler and
cache-only pull against injected storage, including legacy CSV IDs and
membership withdrawal. A match requires current visibility of its transaction,
budget, and the budget item's related accounts. The web transaction removal
preview clears on lock or selection changes and discards late results. Account
removal preview, remaining retained reads and whole-story verification remain
open. T029 and T032 stay unchecked.

November 9 follow-up for T029. The account removal preview now uses the
protected snapshot path and disposes proof-backed temporary state after
publishing display fields or discarding a late response. Match generation and
matching endpoint retries check current access to the budget item's related
accounts. These checks cover the REST paths exercised here. They do not finish
general Finance outbox replay or the whole-story gate.

November 10 partial T027 evidence. The CSV wizard omits excluded rows from
both online import and encrypted staging, and marks explicitly included
duplicates for the current server contract. Online requests carry the chosen
mapping and the duplicate-review digest and counts. Older pending chunks
remain encrypted. Recovery of incomplete import metadata and outbox replay
remain open.

The user approved recovery from saved rows when the original CSV is unavailable.
New offline chunks bind account and scope inside their encrypted payloads.
CSV submission is tied to its original unlocked visit. Generic sync holds
CSV chunks locally until the reviewed recovery and dispatch path is available.
T027 remains unchecked.

November 10 partial T027 evidence. The account screen can inspect saved CSV
imports after verifying current account access. The reader compares encrypted
staging with the paired encrypted outbox payload and checks chunk identity,
scope and ordinal uniqueness. It reports the row count and whether the batch
was fully staged. Inspection leaves the queue intact. Fresh duplicate review,
account confirmation, dispatch and acknowledgement remain open.

November 10 partial T027 evidence. The selected saved batch can display the
first 100 verified rows under the current account snapshot. The existing
import commit uses a reusable exact duplicate comparison restricted to the
selected account and preserves the same-batch retry exemption. A bounded
canonical comparison path, fresh duplicate decisions and reviewed dispatch
remain open.

November 10 partial T027 evidence. Saved CSV previews can explicitly check
their displayed rows against the selected account's current verified index.
The read is capped at 200 references and returns only input ordinals. It
requires current import access and stable source coverage. Dense ranges or
unavailable coverage produce a conflict rather than an empty match list.
Destination confirmation, duplicate decisions, reviewed dispatch and durable
queue acknowledgement remain open.

November 10 partial T027 evidence. Saved CSV review can page through all
verified rows and reduce the page size when the bounded duplicate check needs
a narrower date range. Include and Exclude choices are tied to the batch and
row content in the current unlocked visit. The recovery flow still needs
destination confirmation, final review evidence, reviewed dispatch and durable
queue acknowledgement.

November 10 partial T027 evidence. Fully staged CSV batches can be submitted
after destination confirmation and complete duplicate review. The client
persists the reviewed replacement encrypted before dispatch and checks the
server batch, account, digests and final committed count. It removes the
matching original queue in one local transaction after acknowledgement.
Generic CSV replay remains held. Incomplete batch recovery, broader protected
replay and whole-story validation remain open.

The user approved recovery of available rows from an interrupted offline
save. The client allows a verified contiguous prefix with an explicit
destination confirmation. It leaves batches with interior gaps available
for inspection. An uncertain submission exposes an explicit retry for the
encrypted approved plan. T027 and the independent story gate remain open.

November 10 partial T027 evidence. Manually reviewed CSV imports stay
encrypted and queued while ordinary automatic sync and task resync proceed.
The held chunks are excluded from automatic retry accounting. The regression
verifies restored tasks and an advanced ordinary cursor alongside the
unchanged queued import.

November 10 partial T029 evidence. Category and merchant removal previews use
their own verified source proofs. Confirmation reads the current preview again
before sending the existing mutation. Lock and selection changes discard the
preview. The merchant regression covers revocation after preview and the
category handler regression covers proof issuance with private references.

Partial T029 evidence. Provider reconciliation rechecks the selected
transaction, review issue and candidate versions through the current source
proof before sending a decision. A successful decision reloads the
authorized transaction and review graph. The API verifies current account
access before returning a reconciliation replay receipt.

November 10 partial T029 evidence. Allocation and transfer writes recheck
the displayed transaction proof before dispatch and refresh the affected
transactions from verified reads before reporting success. The API rejects
stale transfer leg versions when supplied. Transaction write receipts
require current account access on replay.

Manual account creation and balance retries also recheck current account
scope before returning stored receipts. This adds partial T029 evidence
without changing checklist status.

November 11 partial T029 evidence. Account name and balance edits verify
retained access before dispatch and publish success after verified reload.
Legacy budget creation, editing, account links, and item retries check
current group and applicable account access.

November 12 partial T029 evidence. Budget-item creation and budget reconciliation
now check the parent's retained source proof before dispatch, check it again after
the response, ignore raw mutation DTOs and reload the canonical budget through the
proof-bearing GET path. Five new component cases raise required discovery from
1,762/464 files to 1,767/465 files. Required validation and standalone pass; the
unchanged quick suite passes 31 and all 16 budget browser cases pass across the
four projects. T029 and T032 remain unchecked pending the remaining retained-view
and full lifecycle audit. T018 and T027 retain their separately documented gaps.

November 12 additional partial T029 evidence. Financial task creation checks its
parent budget snapshot before and after the request. Normal CSV commits check the
displayed account before online dispatch or encrypted offline persistence and
again before publishing success; already queued encrypted bytes remain intact if
access changes. Offline reusable-item persistence follows the same rule. Budget
creation rechecks its retained budget/account source after creation and every
account link before issuing another dependent write. Ten new component cases raise
required discovery from 1,767/465 files to 1,777/466 files. Required validation,
standalone and quick suites pass; targeted account, budget and task-link browser
matrices pass across all four projects. T018/T027/T029/T032 remain unchecked for
their separately documented external, bootstrap/replay and lifecycle gaps.

November 12 additional partial T027 evidence. Fresh PWA Finance setup now uses an
opt-in v8 current-state bootstrap on the existing sync route. The server directly
queries current canonical catalogue/owner/active-group partitions in bounded
100-row pages; an encrypted continuation binds the user, exact partition set, all
captured revisions and one feed frontier. Each page rechecks canonical revisions,
source parents, memberships and task authority. The browser atomically stores each
encrypted page with its proof and continuation and advances the independent Finance
cursor only when the snapshot completes. Restart-required/expired continuations
discard downloaded cache pages while preserving encrypted outbox intent. No table
scan, whole-scope Lambda hydration, new AWS resource/index, migration, timer or
Apple DTO field was added. Focused API/route/client/checkpoint checks pass 74/4;
required validation and standalone each pass 1,787/467, and the unchanged quick
browser suite passes 31 in 27.78 s. T027 remains unchecked for the additional
semantic replay families and complete story acceptance; T018/T029/T032 retain
their separately documented gaps.

November 12 additional partial T027 evidence. Queued `financeBudget/create`
mutations with baseVersion0 retain their stable ULID and pass only strict budget
business input through a replay-only protected POST path. Ordinary POST keeps its
server-generated ID. The targeted repository loader verifies current group edit
access, group revision, exact locator and exact retry row without hydrating group
history; missing metadata uses one strongly consistent key-only `Limit:1` empty-
namespace proof. Canonical budget, locator, feed and fingerprinted receipt commit
under the existing conditional revision fence. Exact retries acknowledge version1
without another write, changed intent conflicts, direct replay-path requests fail,
and sync results do not echo the private budget. Four required cases raise the
suite to 1,791/467. The PWA additionally queues an unlinked offline budget draft
and matching intent atomically, retires only the unverified draft on exact
acknowledgement and waits for canonical protected delivery. If account links are
selected, the form and choices remain available for reconnect instead of being
silently dropped. Four client/atomic-write cases bring required discovery to
1,795/467. Final required validation passes in 63.62 s; standalone passes in
53.53 s; focused replay/PWA/runtime coverage passes 88/4 in 0.49 s. Targeted
budget browsers pass 16/16 in 13.70 s and quick passes 31/31 in 26.48 s. The full
536-pass/20-skip matrix remains current because selection and browser infrastructure
are unchanged. An intermediate required run hit only the documented unrelated
one-second expiry-fixture boundary and passed completely on unchanged repeat.
T027 stays unchecked for remaining semantic replay families and full story
acceptance; T018/T029/T032 remain open. No migration, Apple/cloud/production
change, new AWS resource or approved-cost increase occurred.

November 13 additional partial T027 evidence. An offline budget with selected accounts
now commits its encrypted budget, stable link records and dependency-ordered mutations
atomically. Link replay uses a protected exact-intent POST and server-side point reads
of current budget/account locators, authorization revisions, the requested link, retry
receipt and a deterministic same-table pair singleton. It never downloads relationship
history to the browser. A bounded restartable group-scope phase verifies and repairs
the pair singletons before stamping coverage; missing coverage safely retries without a
protected-row scan. Required validation passes 1,805 tests in 468 files, standalone
passes the same 1,805, targeted budget browsers pass 16 and quick browsers pass 31.
The migration was not run. No checkbox changes: 28/166 remain checked and
T018/T027/T029/T032 remain open.

November 13 additional partial T029 evidence. Category creation/rename and merchant
creation ignore mutation response bodies for display and publish only a fresh authorized
canonical catalogue read. Category rename first refreshes and confirms the displayed
version; merchant selection waits for one matching new canonical row. Three focused
component cases pass. Final required validation passes 1,813/469 in 61.82 seconds,
standalone passes 1,813/469 in 55.34 seconds and the unchanged quick selection passes
31 in 28.86 seconds. No checkbox changes: 28/166 remain checked and T018/T027/T029/
T032 remain open.

November 13 additional partial T027 evidence. Budget-item creation is now a complete
local protected replay loop: an authorized item form that loses connectivity atomically
queues a stable encrypted item/intent, queue failure retains the form, and acknowledgement
still waits for canonical delivery. Strict replay point-loads the current budget,
requested item/receipt, category and optional references, related accounts and their
active budget/account pair singletons. Missing link proof conflicts without a scope
query; exact retry writes once. Focused coverage passes 63/4. Final required and
standalone suites pass 1,810/468; targeted budget browsers pass 16 and quick passes 31.
No task checkbox changes: 28/166 remain checked and T018/T027/T029/T032 remain open.

November 13 additional partial T029 evidence. SimpleFIN claim and refresh responses are
not rendered as current connection state. The PWA loads the actor-authorized canonical
connection list through retained cache proof, checks the retained id/version before a
refresh write and reloads canonical state after both mutations. Failed reads expose a
reconnect state rather than a false empty setup. The API omits encrypted credentials and
filters inaccessible scopes. Focused coverage passes 7/2; required and standalone pass
1,816/470, account browsers pass 12/12, quick passes 31/31 and the full unchanged matrix
passes 536 with 20 existing skips in 408.55 seconds. The first full attempt identified
and corrected a synthetic PIN fixture missing the new proof-bearing GET. This supplied
the last retained-view evidence used by the following T029 completion audit;
T018/T027/T032 remain open.

November 13 T029 completion evidence. The named-path audit confirms that protected
decrypts and search indexing use proof-bearing controller leases; HTTP and replay work
belong to one abortable visit; sign-out disposes the controller before local purge;
pagehide/pageshow, expiry, reconnect and security revision changes close stale visits;
CSV workers terminate on lock; retained snapshots and in-memory indexes clear; and no
Finance Blob URL producer exists. The focused lifecycle set passes **87 tests / 7
files**. Required validation remains **1,816 / 470**, quick remains **31/31**, and the
complete browser matrix remains **536 passed / 20 existing skips / 556 selected**.
T018/T027/T032 remain open; this does not claim their external, replay or complete-story
acceptance.

November 13 T027 completion evidence. The implementation audit covers independent
ordinary and Finance delivery cursors, current source checks before delivery, legacy
locked/upgrade behavior, and continued ordinary sync without acknowledging withheld
Finance rows. Every mutation the current PWA queues has a bounded path: reviewed CSV
chunks remain held for explicit verified retry; budget create/update, account-link and
item create, and reusable-item create use strict protected replay. Unknown future
Finance intents return retry without exposing stored results or blocking later ordinary
mutations. The delivery/replay/source/client focused set passes **82 tests / 6 files**;
required validation remains **1,816 / 470** and the full browser matrix remains **536
passed / 20 existing skips**. T018/T032 remain open for external Foundation acceptance
and the final US2 story gate.

November 13 T032 completion evidence. The consolidated PIN contract, server security,
password-reset, controller, embedded, sign-out, sync, cache, search and protected-write
set passes **168 tests / 14 files**. All **12/12** PIN browser cases pass across
Chromium, desktop WebKit, iPhone and iPad, and the full unchanged matrix passes **536
with 20 existing skips**. Online reset preserves encrypted pending intent and rejects
the old PIN/session; offline unlock uses only the encrypted verifier already established
on that device and never persists or mints an online grant. A new device, a device with
missing verifier material, or one whose revision is known stale must reconnect. The
audits found no ungated production entry path in the implemented API/web/sync scope.
T032 is complete. T018 remains separately open for deferred real DynamoDB, hosted
latency and combined-cost acceptance.
