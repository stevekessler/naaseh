# Feature 016 Validation Guide

This is a future implementation/acceptance guide. Planning generated design files only; new endpoints/test files named by the future tasks must be implemented before they can pass. Use [finance-api.md](contracts/finance-api.md), [sync-security.md](contracts/sync-security.md) and [data-model.md](data-model.md) as expected behavior, not duplicate implementation code.

## Prerequisites

- Work from the repository root with Node 24 and the existing lockfile dependencies (`npm ci` on a clean setup).
- Keep all existing uncommitted work; do not reset the checkout to reproduce this plan.
- Use isolated test data and mocked SimpleFIN, not live bank credentials. Baseline Finance 015 routes/domain/sync must be available before the new slices are validated.
- For browser validation, install the pinned Chromium/WebKit engines using `npx playwright install chromium webkit`; local release tools may install platform-specific prerequisites.
- Start the development application with `npm run dev` for manual inspection; use the existing Playwright-managed fixture/server setup for automated journeys. The browser dev server alone does not provision AWS or make missing production API routes exist.
- AWS integration/restore checks use an approved isolated environment, never production financial data or direct unreviewed deployment. This guide does not authorize deploy/merge.

## Baseline and required runtime measurement

Existing commands (runnable now against the current checkout, subject to its unrelated in-progress changes):

```sh
npm run check:runtime
npm run typecheck
npx vitest run tests/integration/finance-transactions.test.ts tests/integration/finance-task-link.test.ts tests/integration/finance-budgets.test.ts
npx playwright test --config playwright.quick.config.ts --list
/usr/bin/time -p npm run test:e2e:quick
```

Before adding any required test cases, save the discovered **test-case count**, selected project count, command real/user/sys time, machine/runtime context, and current hosted PR total. Twenty selected quick spec filenames is not twenty cases. Also measure any required unit/contract command being expanded. After the change repeat the same measurements and inspect the total hosted Validate run, including dependency audit/build/browser install. Keep target ≤10 minutes; the current timeout of 15 minutes is headroom, not the target. If the expected hosted target exceeds ten minutes, explicit approval and rationale are needed before merge. Do not repeatedly broaden/re-run validation without a new failure or change justifying it.

Planning does not need to run these application commands and has not measured them. Test-count/runtime evidence becomes mandatory when implementation expands the required validation surface.

## Reference fixture set

Use users A and B in group G, user C without G/account access, and an administrator without private-account access. Include a second group H, a personal account P belonging to A, group manual checking/savings/card/loan accounts, a SimpleFIN-connected account S, an existing group with no Finance accounts/budgets, and a revoked membership. Include an open zero-plan budget, an open overspent budget, active-on-save, inactive, inactive-and-closed, legacy draft and reconciled budgets (distinct activity/closure states), two currencies, parent Food/child Eating Out, and a merchant created by A.

Transactions cover posted expenses, ordinary unlinked credits, explicitly linked full/partial/multiple refunds with original-allocation capacity and later-period/cross-account examples, pending/provisional entries, transfers, equal-value legitimate observations, allocation splits, preserved check `000123`, every payment type and unspecified legacy types. Include several budgets on one transaction, local-day boundaries, timezone period boundaries, and task viewers with different access from Finance viewers.

Upcoming expenses include tomorrow/today/overdue, immutable original browser entryContext with travel/DST/server-zone and delayed-overdue sync cases, unpaid/partial/paid/cancelled, a private-account/group-budget intersection, optional planned-source identity, and several tasks pointing to one expense. Receipt fixtures cover every allowed extension, exact 10,000,000-byte limits, empty/oversized files, disguised executable, invalid/macro/encrypted Office, active PDF, decompression bomb, malware verdict failure and clean-policy/version mismatch. Use generated test files, not real receipts.

## End-to-end acceptance scenarios

1. **Navigation/accounts/manual entry — Stories 1/10, SC-001/002/013:** Verify exact main-menu order and authorized Admin visibility. Finance opens Dashboard; each dropdown destination is deep-linkable. Create an account on its own page, inspect separated account sections, add a manual transaction to every editable source/type and observe one saved row. SimpleFIN entry is provisional and preserves provider balance. Later provider reconciliation retains ID, payment data, receipts, tasks and fulfillment, without double spending.
2. **Finance PIN — Story 2, SC-003:** Enable through password-verified self settings; prove Journal/recovery PINs are independent. Menu, direct/history/modal/search/task/receipt/generic-sync entry stays protected. Wrong PIN five times yields ≥30-second delay then increasing waits. Correct PIN resumes destination; cancel returns safely. Leaving/locking/reloading/expiry clears plaintext. Another tab/session does not inherit the token. Forgotten-PIN password reset preserves queued data. Admin can reset password, cannot change/disable the PIN, and old grants fail after epoch change.
3. **Transaction review/catalog/budgets — Stories 3–5, SC-004/005:** Combine text/date/amount/account-name/check filters and clear them. Open/close a modal with focus/scroll preserved, follow each accessible budget to a full page. Record every payment type and zero-preserving check; use parent/child allocation filters. Edit merchant only with permitted actor; retain source descriptions. Create an account-less budget for an existing group and reject revoked membership without losing entered form values. New budgets are active immediately. Deactivate/reactivate preserves history/flags/links, excludes inactive budgets from new selection/open dashboard status and does not alter separate close/archive/reconciliation. Legacy drafts remain unchanged until explicitly saved as active.
4. **Upcoming lifecycle — Story 11, SC-014:** Create using required date/account/budget/group and positive expected amount; reject missing/incompatible references. Locate the same obligation on dashboard, reschedule, become overdue, cancel/reopen, and link partial/full posted payments. Expected money never changes current balance or actual Spend. Retry and competing claims cannot use payment amount twice. Reverse/unlink payment restores correct remaining state. Pending/provisional links remain awaiting posting. Capture local original entry context and reconnect after dueDate/in a different zone: the same date must be accepted unchanged as overdue. Inactive budgets reject new/reassigned expenses while preserving review/reschedule/fulfillment of existing associations.
5. **Tasks/post-its — Story 12, SC-015:** From both expense types use Add Task and normal editable task fields; cancellation creates neither task nor link. In normal create/edit choose upcoming expense or transaction; multiple links and reverse navigation work. Enable optional task column/post-it detail, default off, and preserve display preference. No Finance information is copied automatically to titles/memos/export/search/notifications. Locked authorized viewers can unlock embedded content; unauthorized viewers learn no source existence/counts. Completing/deleting a task leaves financial state unchanged. Partial link failure retries without another task.
6. **Receipts — Story 6, SC-006:** Attach all allowed formats and boundary sizes; progress/retry/cancel are accurate. Actual-format/policy and malware checks must approve the exact version. View supported preview or Office download fallback. Assemble ≤1 MiB ranges, verify checksum and original bytes. A grant/access/ETag change between ranges aborts; generic attachment routes cannot bypass Finance. Receipt browser combines date/budget/category/vendor and deduplicates split matches.
7. **Dashboard/report — Stories 7–9, SC-007/008:** Flag each record kind for A; B's flags do not change. Select upcoming counts 5/10/15/20; future and overdue stay distinct. Compare account balance/freshness, open-budget percentage/spent/remaining, recent merchant/category rows, month/quarter/year series and multi-account scope against reference calculations. Verify splits, explicitly linked refunds, transfers, zero-plan/overspending and mixed currencies. Confirm partial split refund amounts/default original associations, capacity races, link/remove/retry conservation and received-date reporting; original recategorization must not silently rewrite confirmed refund snapshots. Ordinary unlinked credits do not offset Spend. Spend defaults current month and supports every intersection; pending/partial coverage never masquerades as exact final totals.
8. **Offline/reconnect/recovery — SC-011:** Cache authorized records, unlock offline, create supported transactions/expenses/links and select durably retained receipt bytes, then reconnect. Verify security/revocation first, dependency-ordered replay, visible conflicts and no silent loss/duplicate effects. Missing verifier/cache quota exhaustion is actionable. Restore records and original S3 versions in isolation, verify hashes/link graph/claim capacity, and ensure old grants do not revive. Test interrupted migrations and untouched legacy budget-item task links.
9. **Responsive/accessibility — SC-009:** Run current Chromium/WebKit desktop, 375px phone and 768px tablet task/Finance/file/modal journeys. Measure actual adjacent button/button and button/text-entry visible gaps ≥5 CSS px across affected app layouts. Check wrapped layouts, touch targets, keyboard focus/dismissal, zero-result messages, graph table equivalents and mobile download fallback.

## Automated coverage placement

During task generation, allocate pure money/classification/upcoming/claim invariant tests in domain; request/schema/compatibility tests in contracts; real repository/authorization/idempotency/partial failure paths in integration/security; encrypted pending bytes/lock and column/modal interactions in web tests; restore graph/file integrity in restore tests; infrastructure IAM/private-prefix/check/retention assertions in infra tests. Do not write tests that simply repeat field assignments.

Use the existing commands after the corresponding implementation/test slices exist:

```sh
npm run validate
npx vitest run tests/contract tests/integration tests/security tests/restore
npm run test:e2e -- --list
npm run test:e2e
npm run test:performance
npx playwright test --config playwright.performance.config.ts
npm run validate:pre-aws:browsers
```

Some commands overlap; choose the smallest meaningful set for the changed slice, then run required gates once. Do not run every broad command repeatedly. Add one compact representative Finance journey to quick validation only if measured case count/runtime permits; prefer extending/replacing representative coverage over exhaustively multiplying it. Full browser/release gates retain comprehensive device/role/failure combinations.

## Performance protocol — SC-010

Seed 50 accounts/100k accessible transactions/20 active budgets/5k receipt metadata/1k active upcoming expenses. Use a mid-range mobile profile at 4× CPU slowdown, 10 Mbps, 100 ms latency for 20 measured Chromium runs per critical journey; report p95 and raw samples. Separate cold cache and warm synchronized state, including an unselective arbitrary-filter report and first-entry Worker initialization. Measure actual matching rows or a verified full-scope empty state ≤2 seconds at p95, exact connected transaction/report counts and spending totals ≤10 seconds at p95, locally available modal content ≤1 second and long-action progress ≤1 second. A progress-only or empty intermediate page with continuation never passes first-results timing. Exercise sparse/zero-match cold scopes and automatic total completion without user page clicks; record both readiness timestamps, examined rows/calls and query job/revision behavior. Assert no full-scope repository hydration/table scan on new views. Compare all final aggregates to the reference ledger, not just latency. Re-run functional supported-WebKit journeys; performance profile does not substitute for compatibility.

## Operations, cost and completion record

Before foundation acceptance and release, replace [research.md](research.md)'s assumed $4.55 envelope with current regional rates and measured workload assumptions; include Finance 015 in the same $5 total ceiling. Record storage versions/backup, scanned objects/bytes, API range transfer, projection writes, KMS, logs and alarm costs without permanent free-tier deductions. Forecast >$5 requires explicit approval before higher-cost work/release.

Before release, record required check counts/before-after timings/hosted total if expanded; supported-browser and timed-user outcomes; p95/full-completion data; negative authorization/compatibility evidence; migration/restore RPO/RTO evidence; scan/policy failure/cleanup observability; cost forecast; and final-diff/security/data-durability review. Update user guidance and operations/recovery runbooks with self PIN recovery, receipt fallback, private task links, projection lag and source access. Do not mark implementation done while any mandatory gate fails.
