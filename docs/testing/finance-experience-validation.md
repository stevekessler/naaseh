# Finance Experience Expansion Implementation Validation

## US3 account and multi-account transaction browsing — 2026-11-14

The web transaction table uses the existing owner-bound query jobs, bounded
account indexes and canonical point reads. Scope and filter bindings are checked
before delivering rows or exact counts. Transaction browsing totals sum signed
principal by currency. Detailed budget and refund references are resolved using
current source access, and restricted linked identities are omitted. Existing
Apple requests retain their established routes and response shapes. Transfers
and refund editing can load later candidate pages through the same bounded query
and verify each candidate before showing it.

Synthetic query tests use up to 1,250 transactions per account and exercise
sparse and zero-match results, bounded reads, independent row and aggregate
readiness, and release under revoked source access. The focused HTTP test verifies
that an account table request is handled before the legacy scope loader and rejects
attempts to broaden its account. The cold fixture gates require actual rows or
confirmed empty results within two seconds and exact count/totals within ten.

Browser journeys cover account and multi-account table entry, combined filters
and reset, direct transaction entry, back and forward navigation, scroll and
keyboard focus restoration, and navigation from an authorized budget link to its
full page. At 375px the table scrolls within its own region and the page fits
the viewport. In the disconnected API fixture the browser runs the memory-only
worker against verified encrypted cache data, shows cache freshness and coverage,
and retains filters when it rechecks online access. The built app's service worker
precache includes the transaction filtering worker. Receipt and task data are
reserved for their owning stories.

The focused contract, integration and component checks passed **50 tests in 6
files / 2.34 seconds real**. The 12 new browser cases passed across Chromium,
WebKit, iPhone and iPad. The combined focused browser run, including candidate
pagination and existing editing journeys, passed **38 / 2 existing skips /
40 selected / 34.52 seconds real**.

| Local gate | Result | Real time |
| --- | --- | --- |
| Required validation | 1,886 passed in 485 files, plus runtime, typecheck, lint and builds | 69.67 s |
| Standalone tests | 1,886 passed in 485 files | 55.41 s |
| Quick Playwright | 31 passed | 28.65 s |
| Full Playwright | 572 passed, 28 existing skips, 600 selected | 435.13 s |

Node 24.22.2 and Playwright 1.64.1 were used. The quick selection, required test
configuration, browser projects, retries and timeouts were retained. Earlier
diagnostics exposed stale browser and component fixtures and loss of filters
when Finance refreshed on reconnect. The corrected validation sequence passed
with zero failures. Phase 8 completes T072–T081, bringing the checked task count
to **80 of 166**.

The 100,000-transaction p95 profile, real DynamoDB latency, combined AWS cost and
hosted acceptance remain deferred under T018. The approved combined AWS ceiling is **$6.50 per month including
contingency**, and the migration remains unrun.

> Current local checkpoint (November 14, US10 manual transaction entry complete):
> 70/166 tasks checked. T064–T071 are complete. Manual debit/credit entry works for
> every editable account type/source with exact validation, current-access fencing,
> stable idempotency and encrypted offline replay. SimpleFIN manual entries remain
> provisional without changing provider balances. User payment/classification data,
> refund capacity and canonical references survive provider reconciliation. The
> focused set passes **70 tests / 6 files**, the new Chromium/WebKit journeys pass
> **6/6**, required validation and standalone each pass **1,876 / 483 files**, quick
> passes **31/31**, and the full matrix passes **560 with 28 existing skips out of
> 588 selected**. No timeout, retry, project or required selection changed.

## US10 manual transaction entry gate — 2026-11-14

The canonical account transaction path accepts all five supported account types and
both manual and connected sources. It validates the exact date, non-zero amount,
debit/credit direction and account currency, rechecks current edit authority and the
account revision, and conditionally saves the canonical row, locator, feed change and
exact-intent receipt. Exact retries return the already-saved transaction; a changed
intent conflicts. Manual accounts update their balance, while connected-account
entries remain provisional and never modify the provider balance.

The account and global Transactions forms support account preselection, merchant,
payment/check/memo metadata, notes and category allocations. Field failures and denied
saves retain input. Accepted online saves refresh the protected canonical list once.
Offline saves atomically encrypt the transaction and stable replay intent, remain
visibly provisional rather than posted, and are retained on access conflict.

Provider reconciliation preserves the manual row's user-owned payment metadata,
classification snapshot, accepted refund relationships/capacity and canonical source
references while retaining stable transaction/refund IDs. The canonical reference
rewrite hook is tested for future relationship consumers. Receipt, task and fulfillment
relationship fixtures will be validated when T122 and the corresponding downstream
stories add those consumers; Phase 7 does not invent them early.

The focused contract/integration/runtime/reconciliation selection passed **70 tests in
6 files**. The dedicated Chromium/WebKit journeys passed **6/6** in **8.63 seconds
real**. Required validation passed **1,876 tests in 483 files**, plus typecheck, lint
and builds, in **67.19 seconds real**. Standalone passed the same **1,876 / 483** in
**53.57 seconds real**. The unchanged quick gate passed **31/31** in **28.89 seconds
real**. The full unchanged matrix passed **560 / 28 existing skips / 588 selected** in
**433.96 seconds real**. No retry was needed and no timeout, retry, project or required
selection changed. These results complete T066–T071. T018 real DynamoDB/hosted
acceptance remains deferred, and the migration remains unrun.

> Current local checkpoint (November 14, US5 active-budget/group gate complete):
> 62/166 tasks checked. T057–T063 are complete. New budgets save active for named
> current memberships even with no linked account. Deactivate/Reactivate and
> Close/Reopen are separate versioned controls; existing links/history survive,
> new or reassigned upcoming associations require an eligible budget, and legacy
> drafts require explicit activation. The focused set passes **71 tests / 12 files**,
> the new Chromium/WebKit browser file passes **6/6**, required validation and the
> standalone suite each pass **1,866 / 482 files**, quick remains **31/31**, and the
> final full matrix passes **548 with 28 existing skips out of 576 selected**.

## US5 active budgets and group membership gate — 2026-11-14

Budget creation now uses the current membership directory rather than inferring group
IDs from accounts. The UI shows group names and distinct loading, failure and no-eligible
states, preserves entered fields when membership is revoked, and permits an immediately
usable budget with zero account links. Ordinary server creation is active; compatibility
paths may still carry a legacy draft, which is never silently activated or reopened.

Activity, closure and reconciliation remain separate. Versioned deactivate/reactivate
and close/reopen endpoints recheck current access. Deactivation preserves flags,
history and existing expense links while the shared eligibility predicate rejects new
or reassigned upcoming links for inactive or closed budgets. Reactivating a closed
budget leaves it closed. Offline activity intent is encrypted, replayed through its
strict protected action and retained as a conflict if membership is no longer current.

The focused domain/contract/API/replay/migration/component/security selection passed
**71 tests in 12 files**. The dedicated Chromium/WebKit journeys passed **6/6** in
**8.2 seconds**, and the affected desktop budget/matching set passed **20/20** in
**14.7 seconds**. Required validation passed **1,866 tests in 482 files**, plus
typecheck, lint and builds, in **63.69 seconds real**. The standalone suite passed the
same **1,866 / 482** in **52.20 seconds real**. The unchanged quick gate passed
**31/31** in **27.52 seconds real**.

The first full matrix passed 546 cases and skipped 28, with two enhanced-list navigation
failures unrelated to Finance. A focused retry isolated a WebKit synthetic touch/mouse
ordering race after hover-driven menu rendering. The shared helper now activates the
same accessible Lists button by keyboard; its four-project file passed **4/4** and the
complete rerun passed **548 / 28 existing skips / 576 selected** in **506.68 seconds
real**. No timeout, retry, project or required selection changed. These results complete
T063. Real DynamoDB/hosted acceptance remains deferred under T018, and the migration
remains unrun.

> Current local checkpoint (November 13, US4 payment classification/refund gate
> complete): 55/166 tasks checked. T042–T056 are complete. Payment/check metadata,
> one-level category hierarchy, immutable historical classification, authorized
> merchant correction and explicit full/partial refund relationships are implemented.
> The focused set passes **59 tests / 14 files**, the new desktop browser journeys
> pass **2/2**, required validation passes **1,854 / 480 files**, quick remains
> **31/31**, and the complete matrix passes **542 with 22 existing skips out of
> 564 selected**. No timeout, retry, project or required selection changed.

## US4 payment classification and refund gate — 2026-11-13

Payment types and optional check numbers preserve user-owned values, including
leading zeroes. Categories permit one child level, reject cycles/reparenting and
retain the classification path recorded when a transaction or budget item was
classified. Merchant edits require current creator/admin authority and canonical
collision checks; provider refresh does not overwrite user-owned metadata.

Refunds are explicit relationships rather than inferred credits. A relationship
requires edit access to the refund and read access to the original/association,
supports confirmed partial allocation, keeps the refund's received date as its
reporting date and leaves excess credit unlinked. Same-currency cross-account and
later-period relationships are supported. Version/capacity fences make competing
principal claims atomic; exact retries do not double-apply, and correction,
unlink/relink, provider review and canonical alias repair reverse or retain only
the compatible contribution. Original recategorization leaves the confirmed
historical snapshot intact.

The focused metadata/catalog/refund domain, contract, integration and security
selection passed **59 tests in 14 files** in **2.92 seconds real**, including
offline retry and every T056 failure path. The dedicated Chromium/WebKit browser
journeys passed **2/2** in **9.9 seconds real**. Required validation passed **1,854
tests in 480 files**, plus typecheck, lint and builds, in **65.18 seconds real**;
the standalone suite passed the same **1,854 / 480** in **52.66 seconds real**.
The unchanged quick suite passed **31/31** in **26.99 seconds real**.

The first full matrix found browser-test contract drift and a completion-feedback
layout race: **532 passed / 22 skipped / 10 failed**. Scoping duplicated Finance
destinations, closing the transaction modal before navigation and waiting for the
completed-task region corrected the tests. The final unchanged matrix, run with a
temporary awake hold after one diagnostic Mac suspension, passed **542 / 22
existing skips / 564 selected** in **417.68 seconds real**. Application and test
timeouts were not increased. These results complete T056 before dashboard/report
consumers depend on the new fields. They do not satisfy T018's deferred real
DynamoDB, hosted-latency and combined-cost acceptance; the migration remains unrun.

> Current local checkpoint (November 13, US2 access story gate complete): 31/166 tasks checked.
> T027/T029/T032 are complete. The consolidated PIN/delivery/controller story set
> passes **168 tests / 14 files**, all **12/12** PIN browser cases pass across the
> four projects, and the full matrix passes **536 with 20 existing skips**.
> Online reset preserves encrypted pending intent while rejecting the prior PIN/session.
> Offline unlock uses only the encrypted verifier already established on that device;
> it never stores or mints an online grant. New devices, missing verifier material and
> known-stale revisions must reconnect. No ungated production entry was found in the
> implemented API, web/PWA or sync audit.
> Queued budget creation now preserves its stable ULID through an exact-intent,
> replay-only protected POST. The server point-loads current group/locator/retry
> evidence without group-history hydration; exact retries do not write twice and
> changed intent conflicts. Ordinary creation still generates IDs server-side.
> Unlinked offline forms atomically encrypt their draft and intent; acknowledgement
> retires only the unverified draft before protected delivery. Forms with selected
> accounts remain open for reconnect so link intent is never discarded.
> Fresh PWA setup reads current authorized catalogue/owner/group state in bounded
> 100-row pages, commits encrypted records/proof/continuation atomically, then moves
> the Finance-only cursor to one captured feed frontier. Revision/access races restart
> without deleting encrypted pending intent. No scan, new AWS resource or migration.
> Saved CSV recovery supports confirmed imports and explicit retries.
> An interrupted save can recover its verified available rows after review.
> Original T001–T159 remain intact; seven dependent forecast tasks T160–T166 were
> added for the requested known-plan/history methods and dashboard overview.
> Required **1,816 / 470 files PASS / 64.63 s**; standalone **1,816 PASS / 53.56 s**.
> Focused budget replay/PWA/runtime set **88 / 4 files PASS / 0.49 s**.
> Targeted budget browser matrix **16 / 13.70 s**; quick **31 / 26.48 s**.
> Focused bootstrap/checkpoint set **74 / 4 files PASS**; unchanged quick
> **31 passed / 27.78 s real**.
> Focused retained account/budget/reusable batch **22 / 4 files PASS / 0.87 s**.
> Full **536 passed / 20 existing skips / 556 selected / 408.55 s real** and
> unchanged quick **31 passed / 26.98 s real**. Targeted account, budget and
> task-link matrices passed **12 / 18.81 s**, **16 / 14.07 s** and **12 / 10.50 s**
> across Chromium, WebKit, iPhone and iPad.
> Previous separate storage probe **25 checks
> each Chromium/WebKit PASS / 1.30 s**.
> Optional non-budgeted historical inputs require an explicit forecast request;
> budget report rows/totals stay budget-only. Shared selection/regression coverage
> is implemented; the forecast algorithms, API and UI remain dependent work.
> Open-ended forecasts default to the next 12 months. Dated forecasts use budget
> dates by default. Either forecast range is adjustable.
> Account and transaction removal previews use current source proofs. Match
> reads and retries check current budget and related-account access.
> Budget-item creation and reconciliation recheck retained access before and after
> writes and publish only a subsequent canonical proof-bearing reload.
> Task links, online/offline CSV commits, offline reusable-item persistence and
> budget creation/account linking also recheck their retained source before
> publishing success or issuing the next dependent write.
> Household: two visible devices, mixed private/shared accounts, ten daily overall
> hours including two Finance hours. Receipts: 50/month about 2 MB, S3 Standard,
> no initial receipt imports; two total views/month primary, 100/month sensitivity.
> T018 remains open; T027/T029/T032 are checked. No hosted, real DynamoDB or combined-cost PASS;
> keep $6.50 including 30% contingency, no transaction expiry and migration unrun.

## US2 Finance access story gate — 2026-11-13

The final local access-story audit found no unguarded implemented Finance entry path.
Canonical HTTP requests, protected sync delivery/replay, cached decrypts, search and
embedded task links all use the current controller visit. Lock, sign-out, page restore,
expiry, reconnect revision change and source invalidation abort outstanding work and
clear retained plaintext snapshots, indexes and CSV workers. There is no Finance Blob
URL producer in the current web implementation.

The consolidated contract/security/component set passes **168 tests in 14 files**.
The unchanged PIN browser selection passes **12/12** across Chromium, desktop WebKit,
iPhone and iPad. The complete unchanged browser matrix passes **536**, with **20
existing skips**, out of **556 selected** in **408.55 seconds real**. Required validation
passes **1,816 tests / 470 files** with runtime, typecheck, lint and builds in **64.63
seconds real**; the standalone suite passes the same tests in **53.56 seconds real**.

The online reset journey proves that encrypted pending edits and receipt bytes remain
recoverable while the prior PIN and grant cease to work. Offline unlock is deliberately
device-local: it requires the encrypted verifier previously established during a
successful online unlock on that device, opens only the existing encrypted cache, and
does not persist or mint an online grant. A new/disconnected device, missing verifier,
known-stale security revision or unavailable trusted cache cannot unlock until it
reconnects and refreshes canonical security/cache evidence. Five failures retain the
durable minimum delay, and browser/session storage contains neither PIN nor grant.

These results complete T027, T029 and T032. They do not satisfy T018's separate real
DynamoDB, hosted latency and combined-cost acceptance, which remains user-deferred.

## Receiving checkout — 2026-11-05

Fetched and fast-forwarded the existing `codex/task-item-creation-uploads` branch
to published handoff commit `fdc6505b`; the feature pointer is still 016. The six
untracked `outputs/` files were preserved. Requirements checklist: 16 complete,
zero incomplete. No extension hooks are configured, and existing ignore files
cover this private TypeScript workspace's generated artifacts; no setup files
were changed.

Under Node 24.18.0 with exact Playwright 1.64.1 and matching installed browsers,
required validation passes all 1,415 cases / 435 files, typecheck/lint/build
(74.01 seconds). Standalone tests pass all 1,415 in 57.95 seconds. Quick passes
31/31 in 31.73 seconds. The full 556-case run was interrupted after four WebKit
startup failures: 134 passed, 4 failed, 2 interrupted, 5 skipped, 411 not run,
171.68 seconds. It is not accepted. The three Chromium PIN cases pass, including
offline verification; WebKit/iPhone/iPad PIN acceptance remains unverified here.

The handoff's synthetic non-extractable CryptoKey IndexedDB probe fails twice
without any application code. A browser call-stack sample confirms a wait in
WebKit's master-key queue and macOS Keychain APIs. This reproduces the local OS
prerequisite on the receiving Mac, independently of the sending machine. No
credentials/key values/access rules were read or changed, and no timeout or
encryption property was relaxed. User-controlled Keychain access review is the
current prerequisite. Exact failures, counts, timings and diagnostic limits are
recorded in [the runtime report](finance-experience-validation-runtime.md).

Per the implementation skill's failure checkpoint and the handoff's browser gate,
no new foundation implementation or task checkbox was advanced past that failed
baseline. T012/T013/T017 remain unfinished; T018's actual DynamoDB and hosted
acceptance stays explicitly deferred. Keep the $6.50 combined ceiling and leave
the over-budget initial migration unrun. No Apple source, spec, plan, task list,
lockfile, workflow or quick selection was changed. No push, PR merge, deployment
or production action occurred.

### Receiving-machine Keychain resolution and local continuation

The user approved a single persistent browser's Keychain prompt after restart.
The synthetic non-extractable key commit passes (33.00 seconds including consent),
followed by all 12 unchanged Finance PIN cases across Chromium/WebKit/iPhone/iPad
in 24.89 seconds. This supersedes the OS blocker above. The first post-consent
full run reports 535 passed / 20 skipped / 1 iPad attachment-creation failure in
418.33 seconds; three unchanged repetitions of that case pass in 9.29 seconds.
The shared successful-sync fixture was independently corrected to answer Journal
pulls using the Journal contract, without weakening application validation or the
attachment journey. Quick remains 31 passed, 30.03 seconds. The full repeat passes
all 536 runnable cases with 20 existing skips and no failures in 422.34 seconds.
The earlier failed run remains recorded; its iPad case passes within the repeat.

Five new Foundation security cases first fail on the missing query-start method,
then pass with a strict shared request and server-derived canonical authority.
The runtime now starts owner-only revision-bound jobs from bounded account and
coverage reads, handles canonical account-name scope and verified empty results,
and rejects forged authority, incomplete coverage and missing/stale unlock state.
The focused authority/job/HTTP batch passes 21 cases; type checking, focused lint
and formatting pass. Required post-batch timing/counts are recorded separately.

This internal primitive is not public transaction HTTP creation/pagination or
automatic incremental publication. T012/T013/T017 remain open, and T018's actual
DynamoDB/hosted evidence stays deferred. No dependent story or task checkbox was
advanced. A new user-side Apple project edit was observed and left untouched.
The approved combined $6.50 ceiling and migration deferral remain in effect.

The following batch connects `POST /finance/queries` to the existing protected
status route and trusted worker, before legacy whole-scope registry construction.
Strict request parsing, current-owner/security context, CSRF/origin checks,
request identity and final lock checks have HTTP coverage. An owner-only hashed
request receipt commits atomically with the initial job; persistence tests cover
current-checkpoint reuse, lost responses, identical concurrent retries and changed
scope conflicts without duplicate jobs. These are generated conditional-command
fixtures, not actual DynamoDB evidence. Seven new cases bring required tests to
1,427 across the same 435 files; the focused query batch passes 28 cases.

Final review strengthened the request-conflict case with a concurrent different-
scope race. It first failed with a raw conditional error, then passed after
classifying the winning request receipt as a semantic 409 conflict. No new case
or timeout was added by that correction. The required check repeated after
the correction passes all 1,427 cases / 435 files, typecheck/lint/build in 72.13
seconds. Final quick remains 31 passed in 30.97 seconds. Exact counts/timings
remain in the runtime report. This progress
does not finish row pagination, automatic incremental publication, other user
stories, or Foundation acceptance. Task checkboxes remain unchanged.

The following pagination batch adds nine cases in existing files, bringing
required validation to **1,436 cases / 435 files**. Owner-only independent pages
now use encrypted root-bound cursors, bounded continuation windows, original
expiry, exact root totals and final source/grant checks. Tests cover all 1,050
matching rows across three accounts without skips/duplicates, timestamp precision
ties, resized page limits, pending retries, count conservation, cursor tampering,
revocation and expiry during hydration. Initial failures and review corrections
remain recorded in the runtime report. Step receipts now retain a job identifier
rather than duplicate growing job bodies; lost-response/concurrent-worker recovery
remains covered. Final required validation passes in **64.96 seconds**; quick
remains **31 passed / 30.33 seconds**. The exhaustive matrix was not repeated for
this backend batch; its latest evidence is the 536-pass/20-skip run above.

The [offline query checkpoint sizing](finance-query-checkpoint-sizing.json)
records generated conditional writes and reference/fact reads. It exposes a
remaining broad-query amplification problem: advancing beyond the first 200 rows
can re-examine most candidates. The rows route waits for an exact window and is
not evidence of the two-second first-row requirement. Canonical write publication,
source-dependency integration, transaction-table integration, broad-query
optimization and infrastructure review remain unfinished. The subsequent user
answer sets one broad search daily, usually the first 200 rows; no increased
ceiling is assumed. Actual DynamoDB and hosted
acceptance remain deferred, the migration remains unrun, and all four open
foundation tasks stay open.

The November 6 common-read optimization adds six regression cases, bringing
required validation to **1,442 / 435 files**. Compact aggregate inputs on existing
account references avoid full-fact hydration during unfiltered private scans,
while public rows and unsupported filters still read full facts. Corrections
atomically replace compact inputs even when index keys stay unchanged; interrupted
publication remains hidden behind incomplete coverage. Tests preserve linked
source/budget authorization, posted-only/active behavior, signed refund amounts,
mixed legacy references, malformed input rejection and boundary ordering.
Packed checkpoint references support earlier plain records and reject invalid
scope indexes. Pages hydrate their selected rows only.

Required validation after compact inputs passes all 1,442 cases in **66.41 s**;
the final repeat after packed references/page hydration passes in **64.72 s**.
The cost report records about 87% fewer estimated scan RRUs for the synthetic
unfiltered 100k path, plus the added projection bytes/writes and remaining
allowance. Candidate count still scales with scope, dense text remains expensive,
and actual first-row/exact-total deadlines are unmeasured. No task checkbox or
external acceptance is inferred from these local estimates.

The next four cases bring required tests to **1,446 / 435 files** and cover
canonical proof accumulation/restart, server-derived original-source expansion,
malformed/unavailable/oversized dependency rejection, and revocation during
hydration after a successful authorized read. Required validation passes in
**63.79 s**. These dependencies affect authorization/revision pinning, not selected
row scope. Automatic incremental canonical publication remains unfinished.

Three further cases bring the count to **1,449 / 435 files**. Text estimates now
track occupied bitmap bucket transitions, preserving neighbors/corrections and
legacy conversion while avoiding repeated per-bit counter writes. Missing or
legacy text hints are unknown; valid chunk estimates can still select a narrower
probe. Account/dimension counters used for coverage remain exact. Focused tests
pass **34 / four files / 270 ms**; required validation passes **1,449 / 435 files**
in **63.80 s**. The fresh synthetic publication sample falls to **327.38 estimated
WRUs/new source** and **95.60/correction**. Full-text candidates still load facts,
and live capacity/deadline/cost acceptance stays deferred.

Six independent-row cases bring required coverage to **1,455 / 435 files**.
Verified normalized compact account indexes can expose a stable first 200 while
automatic aggregates remain pending; complete small/empty scopes avoid dispatch.
Legacy/unproven indexes retain bounded full completion. Coverage now rejects
missing account references or stale compact inputs, closing a possible false
empty proof. An older reconstruction fixture was corrected to use real
publication instead of a fact/count-only guess; its failed run remains recorded.
Final required check passes **1,455 / 65.45 s**; quick **31 / 28.35 s**.

Six durable-write cases bring the count to **1,461 / 435 files**. Canonical writes
and mutation receipts now atomically include a pending manifest and per-scope
revision journal in both the legacy repository and targeted UOW. Lost responses,
competing retries, outages, revision guards and the expanded atomic limits have
coverage. Manifests retain identities/version metadata, not copied financial
content or name-bearing lock keys. Initial required validation passes in **63.71 s**;
the final repeat including a request-byte-budget guard passes in **62.64 s**.
The consumer, dependency enrollment and coverage advancement remain unfinished;
no automatic publication or task completion is claimed from durable capture.

Five dependency enrollment cases bring required tests to **1,466 / 435 files**.
Proofs now remain unavailable through private directory enrollment (ten entries/
step, 80 scopes maximum), and revalidate earlier dependencies before final ready.
Coverage includes injected outages, source changes/restart, conflicting identities,
and concurrent lost-response recovery. Earlier tests were adjusted to assert the
new unavailable enrollment stage, preserving source-page/readiness checks. A
fixture's spread getter was corrected so injected write failures really occur.
The five-file focused batch passes **53 / 318 ms**; initial required validation
passes **1,466 / 61.21 s**. An existing authority case was also strengthened to
require revision-only preference projection; the PIN verifier/salt is no longer
loaded by query validation. Automatic consumers/coverage advancement and external
acceptance remain unfinished, with task checkboxes unchanged.

Five private source-dependency publication cases bring required tests to **1,471 /
435 files**. They cover correction/unlinking, neighbor preservation, unordered-map
replay, and upgrading completed/interrupted older publication formats without
double counting or changing their saved operation order. Canonical coverage also
requires a matching current publication fingerprint. Final focused repeat passes
**42 / 311 ms**; required validation passes runtime/typecheck/lint/build and all
**1,471 tests in 59.97 s**. Failures and fixture corrections are recorded in the
runtime report. Automatic consumption, incremental coverage advancement and real
DynamoDB/hosted acceptance remain unfinished/deferred. No task was newly checked.

Five coverage-baseline cases bring required tests to **1,476 / 435 files**, all
passing in **69.08 s** with runtime/typecheck/lint/build. Per-source applications
and exact dependency/original-account use counts share a proof-generation ID.
Source publications preserve the baseline while withholding coverage. Five atomic
application cases then bring required tests to **1,481 / 435 files**, all passing
in **65.24 s** with the same checks. Replacements preserve other sources, prune
only a dependency's last use, and replay lost responses without double counting.
An actual pre-commit canonical revision race fails the transaction atomically.
This private step never certifies readiness; journal processing and final vector
advancement remain unfinished. No additional task checkbox is justified yet.

User clarification: one couple with modest usage; canonical transactions remain
until user deletion. Multi-year 100,000-source sizing is stress evidence rather
than an expected usage forecast or a transaction retention policy. The updated
offline artifact includes source applications/account baselines; live acceptance
and the migration remain deferred/unrun, with the $6.50 ceiling unchanged.

Private bounded impact/journal readers, generation-bound applications, proven new
sources/accounts and durable account/outbox consumers now have local coverage.
The outbox waits for child work, handles interrupted/lost-response/concurrent
steps, and archives completed bookkeeping with replayable journals. Trusted full
verification excludes incremental work until its new generation finishes.
Final required validation passes **1,524 tests / 438 files / 65.80 s**, with
runtime/typecheck/lint/build. The unchanged quick selection passes **31 / 29.92 s
real** (Playwright 29.5 s). No workflow/matrix/timeout expansion occurred.

The offline publication utility measures generated command overhead for actual
single-account work and 10/50-account routing lower bounds. See
`finance-publication-sizing.json` and the cost document; omitted child work,
read/compute capacity, retries and real p95 remain unaccepted. The previous
conditional $6.466201 scenario does not prove the $6.50 ceiling after new workflow
overhead. Household account/monthly transaction/correction quantities are pending
user input; no larger budget or transaction deletion is inferred. Automatic
dispatch, recovery infrastructure and remaining move/deletion handling are still
open. T012/T013/T017/T018 and all unrelated task checkboxes remain unchanged.

### Trusted native publication, bounded recovery and household sizing — November 6

Required validation progresses through **1,534 / 439 files / 66.55 s**, **1,538 /
439 files / 62.24 s**, then **1,545 / 440 files / 62.10 s**, all passing runtime,
typecheck, lint and builds. Failures and their corrected repeats remain in the
runtime report: stale invoke-permission count, a wrong synthetic source replay,
a separate recovery rule exceeding the unchanged 400-resource budget, and one
unused test parameter. Existing HTTP/source-isolation assertions then pass in
**59 focused cases / 403 ms**. Quick remains **31 passed / 28.56 s real**; exact
Playwright 1.64.1, required workflow, timeout and browser selections are unchanged.

Canonical commits now signal identifier-only work through the existing default
EventBridge bus. One combined event/schedule rule invokes the existing Finance
function. Strict source/detail envelopes cannot be selected by HTTP input.
Native workers execute at most five durable actions, yielding even within long
source publication. Bounded recovery redispatches at most five pending records,
advances a revisioned cursor fairly across wraps and writes nothing when idle.
No worker expires pending records or canonical transactions. Existing failure
metrics and scoped IAM permissions are reused; no cloud action was performed.

The user supplied eight linked accounts and 250 new transactions/month across
them. Five hundred monthly corrections and five hundred other metadata commits
remain conservative assumptions, not user-supplied facts. Complete eight-account
child work is measured offline. Daily first-200 broad searches retain the prior
50-account/100k-row query allowance conservatively. The cost document distinguishes
this estimate from the still-deferred real capacity, timing and hosted gates.
Physical deletion and account moves remain unfinished; no Foundation PASS is claimed.

### User-proven physical removal — November 6

Both canonical writers atomically retain identifier-only deletion evidence only
for physical removal, excluding scope relocation. Proof validation checks manifest,
journal, revision, original account and both negative canonical/locator reads.
Stable witnesses can be replaced after recreation; stale/forged evidence fails
closed. Cleanup uses the existing bounded publication transaction order/receipts,
removes references/bitmap membership and ordinal/fact rows, reverses the current
summary and subtracts the last applied coverage uses exactly once. An interrupted
new source instead requires proven post-baseline creation and never decrements
an unapplied count. Coverage stays unavailable until the whole pinned window ends.
Later recreation is processed by its own creation journal, preserving canonical truth.

Required batches pass **1,551 / 441 files / 62.90 s**, then **1,557 / 441 files /
61.46 s**, with runtime/typecheck/lint/build. Focused removal/parity/coverage checks
pass **81 / 421 ms**. The runtime report retains the failing red/typecheck runs.
T012/T017 now have local implementation evidence and are checked (**21/159**);
T013 remains open for account relocation/lifecycle review and T018 remains open.
No external acceptance, automatic transaction expiry, migration or deployment occurred.

Completed deletion proof now receives 30-day retention only after child cleanup;
a newer pending proof is preserved. Existing outbox assertions cover both cases.
Latest required repeat: **1,557 / 441 files / 62.95 s**, all stages pass. Offline
representative removal and fourteen routing/workflow scenarios are recorded in
the sizing artifacts. Actual cost acceptance awaits rough monthly correction and
permanent-removal counts, complete invocation allocation and deferred live evidence.

### Causal account moves and deferred creation proofs — November 6

Six new relocation cases bring required validation to **1,563 / 442 files**.
Required runs pass **65.45 s**, then **65.87 s**, with runtime/typecheck/lint/build.
The strengthened integration/repair/security batch passes **97 / six files /
585 ms**. Failures and corrected repeats are retained in the runtime report.

One-hop/chained/return moves use their atomic manifest and per-scope journal
anchors. Creations from earlier scopes must prove the account's complete move
path before enrollment. Newly exposed sources can wait durably for their creation
journal; a bounded final proof pass prevents a missing baseline application from
being silently skipped. Query creation rejects deferred work even if a marker is
otherwise ready. Repair is explicit full verification, followed by bounded cleanup
of claims from the previous generation. Concurrent/lost-response steps, current
revision advances, a missing move journal and invalid version transitions retain
fail-closed behavior. Ordinary work never invokes a whole-scope rebuild.

All fifteen offline publication scenarios converge. The actual eight-account move
uses 98 steps and 598 additional workflow WRUs (80 routing/archive, 506 window,
12 application), plus 34 canonical fixture WRUs; ordinary household write estimates
remain unchanged. T013 remains open for physical empty-account retirement and
remaining lifecycle review, and T018 remains open for user-deferred real/hosted
acceptance and complete cost/import sizing. Task count remains **21/159 checked**.

The user now supplied 100 corrections/zero deletions monthly and five years initial
history. The generated 8-account/15,000-transaction/60-month snapshot estimates
127,616,386 bytes, excluding canonical rows, jobs/receipts/security/GSI overhead.
It is a planning artifact, not actual retained bytes or consumed capacity. The
source of that initial history (new upload versus existing Na'aseh canonical rows)
is the current focused question; no initial migration was run.

Latest unchanged quick browser repeat: **31 passed / 28.62 s real** (Playwright
28.2 s). Sizing-tool lint and workspace typecheck pass after the extended household
CLI scenarios. No hosted-duration or actual DynamoDB claim is made.

## Starting point — 2026-10-31 (T001)

Feature: `specs/016-finance-experience-expansion`; actual checkout:
`codex/task-item-creation-uploads`, starting HEAD
`c58fccb4be365fd0b0533a856fc853fcbdde4cc3`.

The checkout contains pre-existing modified/untracked Finance 015, task, search,
security, infrastructure and Apple-client work. Those changes were retained;
feature 016 is not an authorization to reset or replace them. Only the repository
root AGENTS.md applies; no nested agent instruction file was found.

### Reusable baseline

- Finance 015 tasks are checked except T101 (hosted duration evidence) and T103
  (two-user usability). Its implementation-validation report distinguishes
  fixture-only performance from the unmeasured production DynamoDB hydration path.
- Existing domain/contracts cover accounts, manual/provisional/CSV/provider
  transactions, exact money, splits, budgets, catalog entries, reconciliation,
  deletion/reference rules and budget-item-only task links.
- Existing API/import handlers use request-local DynamoFinanceRepository and
  conditional scope commits. `forActor()` hydrates all accessible scope/catalog
  rows before routing; new bounded query/projection work cannot reuse that path
  unchanged at the specified 100k scale.
- Existing browser Finance has account/transaction/catalog/budget subviews and
  encrypted Dexie/outbox. FinanceLandingPage owns local subview state alongside
  incomplete URL routes. Budget choices derive from existing accounts. Existing
  task links return one budget-item link, not the new target union/arrays.
- Private versioned KMS media storage, GuardDuty scan events and attachment
  upload/retention/backup already exist. Current parents are task/listItem, generic
  policy allows 25 MiB/ten files, and downloads issue temporary signed GET URLs.
  Finance receipts require an explicit parent/policy/access/retention branch.
- Existing Finance cache uses the shared device key. There is no separate Finance
  security preference/grant/offline verifier; all normal app read/decrypt paths
  need the new access controller without deleting pending device-encrypted work.

### Required work and dependencies

Foundation must introduce shared spend/refund rules before projections, targeted
reads/units of work, versioned query jobs and compatible sync capabilities. The
source does not yet implement linked refunds, personal dashboard flags, receipt
transaction parents, explicit budget activity, first-class Upcoming Expenses or
many-to-many transaction/upcoming task links. These remain unchecked until actual
implementation and meaningful tests pass.

### Project setup verification

Existing .gitignore covers Node/build/test outputs, environment files, logs,
editor artifacts, Python and Swift outputs. Existing ESLint flat-config ignores
build/dependency/coverage artifacts. Existing .prettierignore excludes generated
outputs and lockfiles. This is a private workspace with no npm publishing step;
no .npmignore is needed. No Dockerfile, Terraform or Helm configuration was found;
no corresponding ignore files were invented. No ignore changes were necessary.

### Baseline validation

Validation is being measured before adding required tests. Results and any
pre-existing failures are recorded in
[finance-experience-validation-runtime.md](finance-experience-validation-runtime.md).
Measurements of unrelated current native work are not feature-016 completion
claims. Live AWS restore, new hosted-runner totals and human usability remain
future evidence gates.

### Setup checkpoint — 2026-10-31

T001–T005 work is complete: inventory, measured validation baseline, deterministic
synthetic fixtures, regional cost forecast and isolated parser dependency audit.
No feature-016 application behavior, required test cases or project dependencies
were added. Baseline validation passed 1,267 tests; the existing quick browser
suite passed 31 tests. Fixture builders were bundled and checked for fresh
instances, valid references, independent spend expectations and local calendar
contexts.

After setup edits, `npm run typecheck`, focused fixture ESLint, formatting of
non-ignored new documents/fixtures and `git diff --check` passed. Project package
manifests/lockfile have no changes from this work. No new required test cases or
workflow changes require an after-expansion runtime measurement yet.

**Setup acceptance is PASS with approval:** the combined forecast is $6.05/month
including the planned 30% contingency. Steve explicitly approved a $6.50/month
combined Finance ceiling on 2026-10-31. See
[the quantity-by-rate forecast](../operations/finance-experience-cost.md).
Foundation implementation may proceed and must repeat performance/cost acceptance
at T018. No extension hooks are configured.

## Checkpoint continuation — 2026-10-31

Verified actual branch `codex/task-item-creation-uploads`, clean checkpoint
`4d67637` (Checkpoint Finance implementation and native Apple work for handoff),
and `.specify/feature.json` / prerequisite resolution to this existing 016 feature.
Read root AGENTS, speckit-implement, constitution, feature artifacts/checklist and
015/016 evidence. Requirements checklist: 16 complete / zero incomplete; no
extension hooks. Setup ignore verification found that the existing Python virtual
environment was ignored by Git but not ESLint; lint now ignores `.venv`/`venv`.
No replacement project, branch switch, spec/plan regeneration or lockfile update.

### Baseline versus changed behavior

The requested baseline is recorded in the runtime document: validate failed at
six generated `.venv` lint errors (typecheck passed); standalone tests passed
423 files / 1,321 cases in 49.63 s. Full browser baseline ran all four projects:
**522 passed, 20 skipped, two failed**, real **389.17 s** (user 253.81, system 64.50).
Both failures preceded application edits:

- WebKit `archive-project-reporting-full.spec.ts:4`: sign-in/bootstrap response
  timeout after 30 s in `enhanced-helpers.ts:43`.
- WebKit `task-sync-recovery.spec.ts:42`: unreadable-cache backup assertion at
  line 260 expected the earlier task shape/ciphertext, but received a changed
  locally encrypted task. This was not weakened or silently reclassified as PASS.

No native Apple builds/tests were run. Full browser tests used synthetic local
fixtures, not a hosted Finance service or actual DynamoDB performance workload.

### Foundation corrections and evidence

- Calendar basis is now retained with the publication checkpoint; prior amounts
  reverse in their original calendar before new amounts are added. UTC/Denver
  boundary, interrupted correction, legacy default UTC, retries and a return to
  an earlier basis are covered. Three added cases first failed with stale old
  totals, then passed. Transition-specific receipt identities prevent replaying
  an earlier completed transition when the desired input repeats later.
- Text grams of lengths one through three use account/month/chunk bitmaps. Long
  search strings still pass the complete normalized substring predicate after
  candidate retrieval; selecting a rare gram never changes final matching.
  Legacy long reference rows fail closed until rebuilt. A v1 interrupted batch
  resumes its original operation ordering before v2 conversion, preserving the
  durable offset and avoiding skipped writes. Shared-gram corrections keep
  neighboring sources and update cardinalities without duplicate contributions.
- Completed checkpoints release the previous fact after atomic final publication;
  unfinished checkpoints retain both sides for recovery. Canonical source history
  is unchanged. The strengthened regression failed before this retention fix.
- New sizing tool records the current representation and actual generated write
  command sample through injected persistence; no AWS read/write is performed.
  Its 100k estimate fell from 1,639,393,043 to 510,783,799 bytes (68.84%). This is
  serialized synthetic sizing, not measured DynamoDB bytes/latency/capacity.
  See `finance-experience-projection-sizing.json` and the cost forecast.

Final required `npm run validate`: **423 files / 1,330 passed**, typecheck/lint/
build passed; real **56.37 s**, user 233.19, system 49.27. Vitest enumeration:
**1,238**; parameterized executed count differs. Nine added cases, no required
browser/workflow selection changes. The final quick browser suite passed 31 cases in 26.00 s (user 40.89, system
8.35); selection remains unchanged. Details are recorded in the runtime report. Existing migration, compatibility, negative authorization,
projection, unit-of-work and infrastructure suites ran as part of validation.

### Foundation acceptance status (not complete)

| Task | Current evidence / unresolved work                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T012 | Indexed probes, compact text candidate reads, touched-record conditional UOW and failure tests pass locally. Production-scale source access/read capacity and ordered multi-step transaction-page integration remain to verify.                                       |
| T013 | Reversal/retry/calendar, shared text correction, interrupted-v1 conversion and automatic query-job tests pass. Complete canonical/refund-source publication wiring, revision/coverage reconciliation and real DynamoDB automatic deadline acceptance remain unproved. |
| T016 | Complete locally: safe event schema/redaction, trusted invariant/failure categories, durable lag buckets and stalled-retry signals pass tests; no new paid metric series was added.                                                                                   |
| T017 | Existing-function/IAM invocation separation and synthesized serverless/backup assertions pass. Full protected-route/grant integration and operational acceptance remain pending; no AWS resources changed.                                                            |
| T018 | Local read/projection/migration/compatibility/infra tests pass, and cost scenario was repeated. Actual DynamoDB cold/warm/sparse/zero-match p95 rows <=2s and exact totals <=10s, capacity/retention costs and current hosted total remain unavailable.               |

T012/T013/T017/T018 remain unchecked; T016 is checked with local evidence below.
Passing unit tests is not evidence that the entire foundation passed acceptance.
The November 1 user direction permits dependent local development while actual
DynamoDB and hosted gates remain deferred. The current cost scenario is **$6.466201/month**
against the approved combined **$6.50** ceiling, with only **$0.033799** headroom;
its workload/byte/read/write assumptions require live validation before PASS.

### Review and scope preservation

Reviewed the final changed source/tests for conditional writes, correction/retry
conservation, access rechecks, bounded reads and retained plaintext/diagnostics.
No new public endpoint, capability, sync contract or Finance grant is exposed by
this continuation. The text-index revision needs a trusted rebuild before normal
long-text delivery; unmigrated rows produce a rebuild error, never a false empty
result. Current scope markers and authorization checks remain required. Sparse
and unselective live deadlines are unresolved even though fixture tests pass.
Source-authority/refund revision integration and lag instrumentation remain visible
work, not completion claims. The two unrelated browser baseline failures remain
reported for follow-up. No paid metric or always-on resource was added.

`apps/apple`, `packages/apple`, package manifests and the committed lockfile have
no diff from the checkpoint. No deploy, merge, production change, live backfill or
external acceptance result was fabricated. Human usability, live restore, hosted
runtime and AWS acceptance gates remain deferred and unchecked.

## Local foundation audit and user direction — 2026-11-01

The user explicitly directed: “Remain deferred. Continue development without
DynamoDB.” Actual AWS/hosted performance acceptance remains unchecked; this
changes local execution order only and permits continuing local security work.
It does not authorize deployment, production tests or fabricated external results.

T016 is now complete locally: trusted failure categories, real currency/arithmetic
and cardinality invariant alarm emission, durable projection-age buckets/stalled
retries, query-worker authorization classification and nested protected-payload
redaction pass. No paid metric series was added. Lag is observed on invocation/
retry, not by a new periodic sweeper; unknown legacy ages remain unmeasured.
See the foundation operations guidance in `docs/operations/finance-experience.md`.

Two query expiry races now fail closed: expiry during bounded scans prevents
checkpoint publication; expiry during hydration/access checks prevents delivery.
Two refund-capacity cases now require review when accepted allocation identities
are lost or currency is inconsistent, rather than silently freeing capacity.
All eight new cases failed before their fixes. Strengthening the existing actual
invariant-emission case also caught and fixed arithmetic-overflow classification.

Final validation after these changes: 423 files / **1,338 tests passed**, real
**55.89 s**, user 234.65, system 49.66; enumeration **1,246**. No browser selection,
public contract, native Apple file or lockfile changed. External T018/hosted/live
restore/usability gates remain pending. T012/T013/T017 stay open for their remaining
implementation/integration evidence; no Foundation acceptance PASS is implied.

### Local PIN development — 2026-11-01

User direction on November 1 keeps actual DynamoDB/hosted gates deferred and
permits continued local development without DynamoDB. Foundation acceptance is
still not declared. Checkpoint remains `4d67637`, branch remains
`codex/task-item-creation-uploads`, and the feature pointer remains 016.

Local evidence supports T019/T023/T024/T025: strict self-only contracts; separate
canonical-password-verified Finance PIN state; hashed, tab/session/epoch/revision
bound grants; durable conditional verification leases/throttles; and all five auth
HTTP methods routed to the existing auth function. Safe structured outcomes reuse
existing logging/error signals, with no password-secret permission on Finance.
Four contract, fourteen service/guard/HTTP-delivery and five auth HTTP boundary
cases pass; the independent sync-lane file has three cases. The earlier required
run passed 428 files / 1,373 cases in 67.83 s. These are local adapter/fixture tests,
not actual DynamoDB performance/capacity acceptance.

A per-tab controller and AES-encrypted local security metadata now gate requests,
device-key consumers, Finance decrypts, local search sources and task decorators.
Requests/decrypts cannot deliver after a visit lock; switching sessions/signout,
page lifecycle, reconnect, revision and epoch changes remove access. Cross-tab
notices carry only lock/security-change flags. Settings use the current password
for enrollment/replacement/requirement changes; pending Finance data and the device
key are preserved. Browser grants/PINs are never persisted. Known-stale and missing
verification state remain closed. Offline unlock never creates an online grant.

T020/T021/T022/T026–T030 remain incomplete: generic semantic Finance replay/client
checkpoints, full embedded unlock and expiry/draft behavior, persistent race/negative
coverage and cross-browser offline acceptance still need work. Generic Finance
push now pauses with a safe retry before generic receipt lookup; this is explicitly
not a completed Finance mutation dispatcher. Task sync continues independently.

New browser journeys exercise password enrollment, direct links, cancel, explicit
lock/revocation and offline verification. Enrollment/direct-link cases passed in
Chromium, WebKit, iPhone and iPad; Chromium offline verification passed. WebKit-family
offline worker startup failed despite valid encrypted metadata. PWA diagnostics
also encountered a WebKit internal offline-reload error and service-worker requests
that bypass page-level API mocks. Those experiments do not establish offline
acceptance, and no cases were skipped to obtain a passing result. The worker-inline
and CSP experiments were removed; the existing security policy remains unchanged.
The final full-only test keeps the offline assertion open on all four projects.

Unchanged quick selection passed 31/31 in 25.18 s after browser integration (prior
25.67 s). New full-only PIN cases add eight project cases: full selection becomes 552. Required validation after the latest three controller/client cases is recorded
in the runtime report. Current hosted duration, actual DynamoDB, live restore and
human usability remain unverified/deferred. No deployment, merge, Apple or lockfile
change was made.

### Account coverage correction — 2026-11-01

Foundation review found that completing one transaction publication marked its
account ready, which did not establish full canonical/refund-source coverage.
Publication now leaves `awaiting-coverage` / `coverageVerified=false`. Query source
validation refuses both legacy missing proofs and explicit partial coverage even
when the numeric source/projection revisions match. A complete synthetic authority
fixture explicitly includes its coverage proof; new negative checks remove it and
must fail. The strengthened publication assertion and new authority case failed
before the correction; the focused four-file/20-case batch then passed.

T013 remains open for the bounded canonical/refund reconciliation coordinator and
publication wiring. No production path certifies coverage yet; a single published
fact cannot establish a full-scope empty result or exact account total. The updated
sizing sample remains 513,383,799 estimated bytes and 403.44/113.60 estimated
transactional WRUs per creation/correction, excluding the documented overheads.
This is synthetic representation evidence, not live DynamoDB acceptance.

### Saved query-result delivery correction — 2026-11-01

Runtime hydration now binds every returned fact to the saved identifier, account,
effective instant and requested filter, rejecting duplicate or unexpected rows.
Saved exact results also recheck current original-source and budget access. A
budget can change audience without changing the transaction account's revision;
that formerly allowed a saved result to return its now-inaccessible association.
The new regression first proves access succeeds, moves the canonical budget to an
unreadable group, and then requires denial. A strengthened race revokes the visit
during the budget read; final canonical/grant checks occur after that read.

The two new tests and strengthened race failed before correction. Required
validation passes 428 files / 1,382 cases in 59.71 seconds (user 238.22/system 51.94).
Foundation coverage reconciliation/publication wiring remains incomplete. No
DynamoDB or hosted performance acceptance, deployment, merge or native work is
implied by these local results.

### Bounded migration and checkpoint retention — 2026-11-01

Canonical reconstruction now reads targeted transaction/account/budget/merchant
sources with shared expense/refund predicates. Positive credits require a verified
refund singleton index before a missing relationship can mean unlinked. Bounded
refund-index, scope/catalog preparation and account-coverage services persist
revision-bound checkpoints and support explicit restart. The account driver resumes
an interrupted publication's exact stored input, publishes bounded canonical pages,
and verifies the complete canonical set/cardinality before marking coverage ready.
All services have local conditional-persistence tests. They are trusted explicit
migration tools, not interactive read fallbacks. Automatic incremental publication
from canonical mutations and bounded query integration remain internal T012/T013
work. Earlier notes describing the coordinator as unbuilt are superseded here.

The operator command builds and passes help/no-apply/invalid-option/missing-env
preflight without AWS access. No apply path was executed. Completed publication
checkpoints now drop both temporary fact copies while keeping transition identity;
current facts retain correction/reversal data. A strengthened existing test first
failed, then the publication/text/restart batch passed 15 cases. Required validation
passes **433 files / 1,401 cases in 53.82 s** (user 229.17/system 46.48), with
**1,309 listed tests** plus parameter expansion. No required browser selection or
workflow changed. See the runtime report for subsequent browser work.

The synthetic retained estimate is now **435,595,579 bytes**, down 77,788,220
from the prior estimate. Generated write amplification remains 403.44/113.60 WRUs
per creation/correction. Extrapolating initial publication to 100,000 sources alone
costs $25.215 in writes at the previously verified rate, exceeding the approved
$6.50 monthly ceiling. The conditional $6.466201 ongoing scenario does not cover
that migration. T018 stays open; actual capacity/latency and hosted evidence remain
deferred, and no live backfill, deployment, merge or Apple work occurred.

Full-only PIN browser selection is now **12 cases** (three journeys across four
projects), making the full suite **556** cases. Latest PIN run: **9 passed / 3
failed**, 32.51 s. WebKit/iPhone/iPad true network-offline worker startup still
fails; the separate origin-unavailable control passes all four projects and does
not satisfy the failed network-offline gate. Earlier 552-case selection notes are
superseded. Quick selection remains 31 cases.

### Embedded task unlock — 2026-11-01

A permitted locked viewer can open the PIN form without leaving the task. Every
locked task shows the same generic control, independent of a cached link, and no
Finance lookup/decryption starts until unlock. Cancel leaves ordinary unsaved task
edits intact; closing/changing the selected task relocks an explicitly opened
embedded visit. Unique form titles avoid duplicate element IDs. Pending unlocks
are aborted on cancel/unmount and late success cannot reopen the view. A successful
grant notification cannot accidentally relock itself during form replacement.

Three new jsdom cases first failed, then pass with the 15-case controller batch.
Required validation passes **434 files / 1,404 cases in 54.64 s** standalone.
Quick browser selection remains **31**, passing in **25.84 s** (before 26.00 s).
The production-built PIN rerun remains **9 passed / 3 failed**, **33.50 s**, with
the same three WebKit-family true network-offline failures. T029/T030 stay open for
remaining sync/cache/lifecycle and final acceptance work; no story completion is
claimed. No Apple, lockfile, workflow, quick selection, deployment or live data
change was made.

### Atomic canonical security gate / full browser repeat — 2026-11-01

The default Finance guard now reads profile/session/preference and optional hashed
grant in one `TransactGetItems` snapshot rather than separate reads that could mix
states during a reset. Safe profile/preference projections omit verifiers and
pepper metadata. A truncated or failed snapshot is a safe unavailable response,
never a default unprotected preference. The strengthened existing regression failed
before the change; the focused four-file batch passes 35 cases, with no count
expansion. See [AWS transaction isolation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)
for the production API semantics; no real transaction was invoked here. The updated
conditional guard allocation is 240,000 read units/$0.030 within the existing
2,000,000 incremental read allowance, not an additional forecast line or acceptance.

The full browser repeat selected **556 cases**: **530 passed / 20 skipped / 6
failed**, **423.88 s**. Known PIN offline failures remain on WebKit/iPhone/iPad.
New failures: WebKit urgency initial navigation, iPhone nested-subtask initial
navigation and iPad nested-subtask parent-label assertion. The two original baseline
failures pass in this repeat. Isolated repeat evidence follows in the runtime
report. No timeout, assertion or skip was relaxed. Hosted and DynamoDB gates remain
deferred, foundation/story checkboxes remain evidence-bound, and no deployment,
merge, Apple or lockfile change occurred.

### Queued Finance intent access — 2026-11-01

Generic outbox processing formerly decrypted Finance payloads before checking its
personal visit. It now holds unknown/locked or offline-only Finance intent before
decryption, checks the visit again after asynchronous decryption and lets unrelated
ordinary queues progress. Finance push uses v8 and the protected request client,
including tab headers, cancellation and suppression of late results before local
acknowledgment. Two new cases fail before and pass after the change. The server's
semantic dispatcher remains a safe-retry placeholder, so saved intent is not falsely
acknowledged. Generic conflict-cache classification/decryption and independent
browser Finance delivery cursors remain internal implementation gaps. T027/T029
stay unchecked; this is not full sync or story acceptance.

Final local result for the queue change: **434 files / 1,406 tests pass**, required
validation **55.40 s** (before 1,404/56.28 s); quick **31 pass / 25.37 s** (before
25.84 s). Required browser/workflow selections remain unchanged. The hosted target
remains under ten minutes but has no current hosted measurement; no hosted PASS,
merge or external acceptance is claimed. The full 556-case result above predates
this final client queue change, which is covered by quick and controller checks.

### Ordinary conflict-cache isolation — 2026-11-01

New conflict writers retain non-indexed entity-type metadata. Ordinary task review,
its badge and the generic conflict reader exclude known Finance payloads; unknown
legacy formats are held until a permitted local visit classifies them. Classification
updates metadata only, outside live queries, preserving ciphertext and pending data.
Unclassifiable formats do not become a visible financial “unavailable” row/count.
Three new cases cover known Finance exclusion/ordinary access, authorized legacy
classification and late-decryption locking. The focused 33-case batch passes.
Ordinary task/revocation/timer writers carry the marker; the ordinary-conflict fixture
now declares its existing list-item identity explicitly. No index, Dexie version,
Apple contract or encrypted payload was replaced.

The first quick run exposed a fresh-page read-only query regression and was stopped.
The corrected run passes 31/31 in 26.00 s; details, failed-run counts and final
read-only-reader repeats are preserved in the runtime report. Financial conflict
resolution, sync activity/history and independent Finance delivery cursors remain
unfinished. T027/T029 and the US2 checkpoint stay open.

Final conflict-isolation validation: **1,409 tests / 434 files pass**, required
command **55.13 s** (user 229.88/system 48.47), with **1,317 listed tests** plus
parameter expansion. Quick remains **31 passed / 25.69 s**. Failed startup/lint/
fixture attempts and corrected repeats are retained in the runtime report. The
full 556-case browser run predates the latest queue/conflict changes and remains
**530 passed / 20 skipped / 6 failed**, with the three unexpected failures passing
isolated repeat and the three WebKit-family offline cases still unresolved.

Checkpoint/branch/feature selection are unchanged; Apple, lockfile, required
workflow and quick selection have no diff. No extra checkbox, external gate,
deployment, merge or production action is claimed. The browser-tooling upgrade
question is pending user direction because it changes the committed lockfile.

### User-approved Playwright upgrade experiment — 2026-11-01

The user approved Playwright **1.64.1** and its matching Chromium/WebKit binaries.
The exact version pin and only three package entries changed in the npm lockfile;
Node remains 24.22.2. Required validation passes **1,409 tests / 434 files in 54.86 s**
(user 228.66/system 48.60), versus 55.13 s before. Quick selection remains **31 cases**,
passing in **27.76 s** (user 37.26/system 7.39), versus 25.69 s before.

The experiment exposed a broader WebKit sign-in failure. Initial PIN selection:
**3 passed / 8 failed / 1 interrupted**, **184.70 s**; failures occur before the
WebKit PIN steps. Serial execution, an added visibility assertion, page activation
and temporary old screen dimensions did not resolve it. The shared helper and
repository browser configs retain their pre-upgrade behavior. Ordinary
service-worker-blocked WebKit auth controls also fail **2/2 in 74.10 s**, including
the existing login-card CSS check; these passed under 1.61.1. DOM traces retain the
expected controls, and isolated Node-driven diagnostics sometimes pass. The cause
is not established and is not attributed to the upstream offline issue.

No assertion, timeout, skip or app production code was changed to make this pass.
Full selection remains **556**, but no complete 1.64.1 full run is claimed after
these systematic startup failures. Previous full-suite results belong to 1.61.1.
The lockfile currently retains the approved 1.64.1 experiment; user direction to
restore 1.61.1 or retain it with the failing WebKit gate is pending. No Foundation/
US2 checkbox is completed by this upgrade. AWS/hosted gates remain deferred, the
migration cost gap remains open, and no deployment/merge/native Apple change occurred.

### WebKit gate diagnosis: local Keychain access — 2026-11-01

Keep Playwright 1.64.1 per user direction. The startup freeze is now isolated to
non-extractable CryptoKey persistence: a plain page without Naaseh code hangs on
IndexedDB key storage. Native content/UI-process samples trace the synchronous
key-wrapping request into macOS `SecItemCopyMatching` on WebKit's WebCrypto master-key
queue. The diagnostics contain call-stack symbols only; no credentials/key bytes
were read into chat or logs. This supersedes the earlier unproven rendering/upgrade
hypotheses. A specific permission prompt has not yet been visually confirmed.

The visible synthetic key probe is ready for the user to check/approve any macOS
Keychain prompt locally. This is the human-input boundary; no automatic Keychain
permission change, key extraction, application encryption change, or test weakening
was attempted. After that local prerequisite is resolved, rerun the unchanged gate
and continue implementation. The 1.64.1 unit/quick PASS remains 1,409/31 from the
prior measured run, but WebKit/PIN acceptance remains open. No checkbox is updated
until the actual browser checks pass. AWS/hosted gates remain deferred.

### Specific local access-control prerequisite — 2026-11-02

No prompt was visible to the user, and the prior diagnostic probe had timed out.
Read-only OS status shows the default Keychain is already unlocked. The exact
**Playwright WebCrypto Master Key** item exists, but its only trusted-app entry
references the deleted WebKit **2311** cache and does not validate against the
installed **2370** browser. This is targeted permission metadata, not a read of
password/key data. No permission was automatically changed.

The user is reviewing the item's Access Control settings with the updated
Playwright.app revealed in Finder. Preserve the existing item/key and add only the
approved updated browser; no reset, broad all-app grant or encryption weakening
is part of this workflow. Gate acceptance remains pending until the minimal
non-extractable-key storage probe and actual unchanged WebKit/PIN tests pass.
Continue Finance implementation only after the browser gate is verified, per the
user's direction. Playwright remains 1.64.1; no deployment/merge/Apple change occurred.

### Continuation — 2026-11-03

After user-controlled Keychain access was updated, all 12 unchanged Finance PIN
browser cases pass on Playwright 1.64.1, including WebKit/iPhone/iPad true offline
verification. T022's representative test implementation has local evidence; the
PIN story and complete browser gate remain unfinished. Two full runs each report
514 pass / 20 skip / 22 fail while macOS repeatedly sleeps for 10–17 minutes.
All 22 failures from the first run pass unchanged on isolated rerun. Full-suite
acceptance requires an uninterrupted awake run; no timeouts/assertions were relaxed.
See the runtime report for exact timings and sleep evidence.

Foundation query status now resolves `GET /api/v1/finance/queries/{queryId}`
before legacy whole-scope repository construction, using the existing owner-only
query service and its current source/dependency checks. Delivery binds the current
session/tab grant and security revision, with a final guard before response.
Malformed IDs, expiry, changed scope and unavailable storage return safe states;
no filter/revision/source details are exposed. Six local HTTP checks pass and
prove the legacy whole-scope factory is not called. Actual query creation/table
paging and automatic incremental canonical publication remain unfinished, so
T012/T013/T017/T018 stay open. No real DynamoDB/hosted performance claim is made.

The current required validation attempt is also failed: three infrastructure
setup hooks and the urgency performance test exceed their existing timeouts while
the machine sleeps. It reports 431/435 files passed and 1,400 cases passed,
1 failed, 14 skipped; build was not reached. Type checking and lint pass. No
successful after-change required duration or hosted result is claimed.

Latest local US2 continuation (November 6): **27/159 tasks checked**. T013 has
bounded account-retirement/recreation evidence. T021/T028/T030 have actual
non-extractable browser-key/IndexedDB pending-data reset evidence and passing
online/offline PIN controls. T020/T031 additionally exercise generated self/admin
password-reset commands and canonical grant rejection before Finance replay.
Recovery PIN secret versions remain separate from password versions when an
administrator resets the password; public/Apple contracts are unchanged.
Required validation **1,572 / 443 files / 59.25 s real**, all stages pass; browser
PIN **12 / 34.81 s real**, quick **31 / 29.18 s real**. T026/T027/T029/T032 remain
unfinished, including independent web delivery and semantic replay. A local-write
lifetime regression batch is in progress; its evidence belongs in the runtime
report before acceptance. Preserve the Apple project edit and untracked outputs.
Cloud/hosted/cost acceptance remains deferred and migration unrun. Five years of
history means an estimated 15,000 transactions under the supplied monthly volume,
with no automatic transaction deletion. CSV versus existing-history source is
still unspecified and does not block these independent local security tasks.

November 7 user clarification: **there is no Finance data currently in Naaseh**.
All data will be imported or come through the SimpleFIN bridge. Treat the estimated
five-year/15,000-row setup as **new ingestion**, including canonical import writes,
publication, retries and normal monthly activity, not backfill of existing rows.
This resolves the earlier source-versus-existing-history question; do not ask it
again. It does not establish actual file counts or provider historical coverage.
Keep the explicit migration unrun and the combined $6.50/month ceiling with 30%
contingency. Initial ingestion/capacity/cost evidence remains required; nothing
was imported into AWS or production by this clarification.

November 7 latest local continuation: **27/159 tasks checked**. Self/admin
password resets preserve Finance security state and reject old sessions before
replay; private recovery-secret versions are retained correctly. Local receipt/
budget/hydration writes abort with their original Finance visit, and an encrypted
independent Finance delivery checkpoint can commit atomically with protected
records. Real Chromium/WebKit IndexedDB probes pass for rollback, ciphertext
checkpoint round-trip and retained non-extractable key/pending edits. The transport,
current-source feed authorization and semantic replay portions remain unfinished;
T026/T027/T029/T032 are unchecked. Legacy HTTP scope/membership response races
have two added passing local checks; required count becomes **1,582 / 444 files**,
with the final required repeat tracked in the runtime report.

Latest standalone before those final two API cases: **1,580 / 444 / 49.20 s**;
quick **31 / 28.37 s real**; full **536 passed / 20 existing skips / 556 selected /
397.27 s real**, no browser failures. Node 24.18.0 and Playwright 1.64.1 remain
unchanged. Preserve Apple project edit and outputs. No push, deployment, cloud
write or migration. Initial ingestion source is resolved: no existing Finance
data, new imports/SimpleFIN only. Sparse and dense local ingestion cost artifacts
are retained; combined $6.50/month acceptance and real DynamoDB/hosted gates remain
unaccepted/deferred. Avoid re-asking the resolved source/volume questions.

Latest server-boundary checkpoint (November 7): **1,593 / 446 files PASS / 60.00 s
real**, all required stages; T026 has local evidence and tasks **28/159 checked**.
Private scope authorization counters preserve revocation lineage across both
canonical writers and metadata callers. Saved protected replies are pinned to
those counters, and task-bearing responses recheck current task visibility before
release. Public/Apple DTOs remain unchanged. Pending T027/T029/T032 still cover
connected cache/source verification, web independent transport, semantic replay
and final US2 audit. This is not full-story or real DynamoDB/hosted acceptance.
Initial import source is resolved (new imports/SimpleFIN, no existing Finance data),
cost sensitivities remain unaccepted, ceiling $6.50/30% reserve unchanged. Preserve
Apple project edit/outputs, leave migration unrun, and do not deploy/push/merge.

Latest ordinary-sync safeguard (November 7): required **1,596 / 446 files PASS /
60.05 s real**; timed quick **31 passed / 27.9 s Playwright** (exact process times
in runtime report). Ordinary web pulls explicitly withhold Finance including
unknown future types and unexpected tombstones, without acknowledging its separate
cursor or depending on Finance security availability. Three new regressions and
legacy compatibility pass; no browser selection/workflow changes. T027/T029/T032
stay open, tasks 28/159. Keep original full-browser evidence and its date/scope;
this incremental checkpoint is not connected-cache/replay/US2 acceptance.
The user's initial-data source is resolved: new imports/SimpleFIN, no existing
Naaseh Finance data. Whether the five-year initial import includes receipt files
is now asked for setup-cost sizing; do not invent file volume. No AWS writes,
migration, deploy, push or merge. Preserve Apple project edit and outputs.

November 7 initial-import clarification: **transaction records only; no receipt
photos/PDFs are to be imported**. Naaseh currently contains no Finance data; the
five-year history will be new transaction ingestion via imports/SimpleFIN. Use
zero initial receipt objects/bytes and receipt-specific upload, scanning and
thumbnail calls for this setup scenario. Transaction import files and their
validation/staging/storage remain included where the importer needs them. Do not subtract canonical transaction ingest, source
publication, indexing, request/compute, backup/PITR or normal monthly activity.
The original receipt-heavy workload remains a separate conservative stress model,
not this household's initial import. Future manual receipt use has not been sized;
this answer does not remove the planned receipt feature. Combined AWS ceiling
$6.50/month with 30% contingency unchanged; T018 remains unaccepted, real DynamoDB
and hosted acceptance deferred, migration unrun. No receipt-volume question is
pending for initial import.

Latest replay-lifetime checkpoint (November 7): **1,601 / 446 required tests PASS /
67.52 s real**, quick **31 / 29.43 s real** (before 29.22 s). Five new cases cover
original-visit request preparation/late response and atomic acknowledgement/
encrypted conflict rollback; actual outbox-drain regression reproduces failure
without the protected branch. Real Chromium/WebKit IndexedDB probes pass rollback,
fresh commit and non-extractable key retention (1.20 s real). No selection/workflow
expansion, new skips or OS prompts. Read runtime report for precise red/focused
results. T027/T029/T032 remain unchecked; connected cache-source verification and
server semantic replay are still unfinished. Tasks remain 28/159. No cloud or
hosted acceptance claimed. Preserve Apple edit/outputs, no push/merge/deploy, leave
migration unrun and keep $6.50/30% ceiling. Initial import is transaction records
only, zero receipt files; transaction import staging/validation still counted.

November 7 current cached-read checkpoint: sequential required **1,613 / 447 files
PASS / 64.71 s real**; real Chromium/WebKit WebCrypto/IndexedDB cache-generation,
coalesced-read, cursor, rollback and retained-pending-data probes pass **1.42 s
real**. Proof-only server protocol/cumulative dependencies and client encrypted
checkpoint/generation plus cached-read leases are implemented incrementally.
Current-source proof is checked before/after connected batches; offline requires
last trusted cache plus existing offline security and cannot learn remote changes.
Unproven projections cannot borrow a fresh proof. Revocation clears cached records/
checkpoint, retaining encrypted pending edits/conflicts/receipt bytes/key/task
cursor. Concurrency checks prevent duplicate widget proof requests and serialize
checkpoint refresh. Proof renewal verifies merged dependencies without repeating
an extra full prior-proof read. No new AWS resources, permissions or paid metrics.

No task checkmarks added: **28/159**. T027/T029/T032 still need new-row transport,
real server semantic replay, remaining memory-search/API-derived-view source
rechecks and full acceptance. Runtime report records a fixture-red full run and a
second **invalid** full run whose test-mode assets were overwritten by concurrent
required build. Both stopped; no failures hidden/waived. Finance-search targeted
repeat16PASS/17.62s. Full556 matrix is now rerunning sequentially after final
required validation; see final runtime entry for the actual outcome before claiming
browser acceptance. Initial import is transaction records only, zero receipts.
Ongoing monthly receipt uploads are awaiting user clarification (original200/month
is a stress assumption, not household fact); do not infer zero from initial import.
Keep $6.50/month/30% contingency, no cloud/hosted acceptance/migration/deployment/
push/merge. Preserve Apple project edit and outputs.

Final November7 browser checkpoint: **536 passed / 20 existing skips / 556
selected / 404.97 s real**, full local matrix PASS. Required **1,613 / 447 files /
64.71 s real PASS**; subsequent browser-fixture-only typecheck/lint pass. Both
recovery fixture defects (premature server snapshot publication and task payloads
sent to strict Journal pulls) are corrected with all original safety assertions
retained; final full repeat covers all four projects without failure. Runtime
report retains every red/interrupted/invalid run and exact timings. No claim of
hosted/DynamoDB/cost/latency or full-story acceptance. T027/T029/T032 remain open
for new-row delivery, server replay and remaining retained-memory source checks;
28/159 tasks checked. Monthly receipt uploads remain pending user answer, separate
from the resolved transaction-only initial import. No cloud/production changes,
migration, push or merge; Apple edit/outputs preserved. Final quick repeat follows
full gate sequentially; use runtime report's latest line for its measured result.

Final quick result: **31 passed / 29.09 s real** (Playwright28.6s), selection
unchanged. Full536pass/20existing skips/556selected remainsPASS404.97s. No additional
required code change after sequential1,613/447files PASS64.71s; only diagnosed
browser fixtures and documentation changed, with fixture typecheck/lint passing.

November 7 receipt assumption resolved: user expects **50 new receipts/month,
approximately2MB each**, all kept in **S3 Standard for now**, with no automated tier
transition. Model2MB as2,000,000bytes, about100MB new originals/month,600 files/
1.2GB/year,3000files/6GB afterfiveyears (a forecast horizon, not deletion policy).
Initial five-year transaction import still contains zero receipts; no existing
Finance data. Existing media bucket has no lifecycle storage-class transitions or
Intelligent-Tiering, and default uploads use Standard. Existing malware rejection,
noncurrent-version cleanup and required warm backup protections are unchanged.
No AWS change/deployment/migration ran. Ongoing receipt count/size/tier is no longer
a pending question; don't ask it again. Combined $6.50 ceiling/30% reserve stays.

November 7 receipt-view answer: user said “Say twice” to the question about total
monthly receipt views, including repeats. Use **two views total per month** as the
stated interpretation (about4MB of original-file delivery), subject to correction.
Keep **100 views/month** as the alternate “each of50receipts twice” sensitivity,
and1000/month as inherited stress. This is not an additional user requirement.
Do not silently treat1000 as household activity or change the50uploads/month,
2MB average,S3Standard/no automatic tiering,zero initial receipt import or retained
originals. The two literal interpretations differ by about$0.022932/month including
the existing30% reserve at the fixed inherited transfer price; neither establishes
overall cost acceptance.

Updated offline receipt artifact/calculator reads the household view count and
retains all three scenarios. Atmonth12, the old conditional combined quantities
with two views give$6.382609; atmonth60,$6.941353 (100views:$6.964285;1000views:
$7.174885). These are substitutions into the original stress allowances, **not a
new accepted household total or actual billing**. Canonical initial transaction
import and full current compute/read/permission-check allocation remain unfinished.
Keep the$6.50 ceiling,30% contingency and T018 unchecked; optimize/reforecast rather
than raising approval, changing tiers or deleting retained data. No account or
production change/import/migration was made. Receipt-view input is no longer
pending under the explicitly stated two-total-views interpretation.

Budget-edit replay local checkpoint (November 7): the protected sync adapter now
replays only typed budget updates through the existing Finance PATCH route. The
stable mutation key is bound to a private canonical intent digest; identical retries
return the saved version without a second commit. Changed intent, missing legacy
intent evidence and stale versions conflict. A session lost after commit leaves the
client pending; a fresh authorized session can acknowledge the same saved result.
Unsupported entity/operation combinations remain pending. Responses contain only
mutation ID/status/version and safe problem codes, never Finance model/error bodies.
Sync may signal the existing default-bus publication consumer with the same narrow
source/detail-type policy; no new cloud resources or deployed changes.

Required validation: 1,620 tests / 448 files PASS, 65.29 real / 253.33 user /
54.34 sys seconds. Final strengthened focused adapter/durable/protected-sync/PIN
checks: 45 tests / 4 files PASS in 384 ms; typecheck and changed-file lint PASS.
Browser results above retain their original frontend scope and were not rerun for
this API-only adapter. No task boxes were added: T027/T029/T032 and T018 remain
open, 28/159 checked. Publication/authentication/replay overhead is not accepted
as free; household cost and real DynamoDB/hosted evidence remain deferred/open.

Bounded replay/cache-only follow-up: the replay adapter resolves only the target
budget locator, checks current scope rights before reading the source body, and
uses point-read metadata plus the existing atomic revision/receipt/publication
commit. Missing locator evidence retries, never scans; a foreign scope conflicts
without reading that scope. Existing ordinary HTTP/Apple paths are unchanged.
Cache-only checks now skip both feed reads and membership discovery, preserve
both supplied cursors exactly and deliver no ordinary/Finance changes. Prior
proof dependencies still undergo current canonical scope/member/task checks.
Required validation PASS 1,620 / 448 files / 59.45 real / 239.89 user / 48.81 sys.
No browser/required-selection changes; no additional task boxes checked.

Protected delivery local checkpoint (November 7): foreground sync now requests
one bounded Finance page only during an authorized connected visit. It sends the
independent encrypted Finance cursor and prior proof, validates the protected
response/known entity kind/identity/version/audience, encrypts incoming rows, and
commits records/tombstones/proof/checkpoint atomically. Ordinary response changes
and cursor are never applied by this lane. Unsupported/malformed responses stay
unacknowledged. Known locked/upgrade state closes the local controller; source
revocation discards projections while retaining encrypted intent/receipt bytes.
Legacy unproven projections require a refresh rather than being blessed by new
evidence. This adds no Apple contract requirement; old-server responses fail
closed for Finance while ordinary task sync continues.

Incoming delivery and complete cache-read batches share a per-controller queue,
avoiding same-tab checkpoint races; cross-tab CAS remains authoritative. Storage
checks reject cross-kind ID collisions before applying any changes. A transport
failure leaves its protected checkpoint pending for the next sync and does not
roll back completed ordinary task progress. Catch-up is currently one bounded
page per sync; full restore/catch-up and all command families remain unfinished.

Required 1,631 / 449 files PASS, 58.92 real / 239.72 user / 48.43 sys seconds.
Focused transport/cache/replay-lifetime checks 32 / 3 files PASS / 194 ms.
Real IndexedDB/non-extractable AES Chromium and WebKit synthetic probe PASS
1.12 real / 0.64 user / 0.21 sys: incoming delivery rollback, encryption, proof
generation, cursor independence and collision preservation, plus prior pending
work/receipt/key/replay checks. Quick 31 PASS / Playwright27.9s / 28.23 real /
38.07 user / 7.60 sys. Final full556 PASS:536passed /20existing skips /404.45real /256.31user /62.32sys. This run includes the current protected delivery and retained-memory search changes.
No new task boxes checked. T027/T029/T032/T018 stay open; no cloud writes,
migration, push, merge or deployment. Current sync/proof request counts must
remain in the open cost allocation; this is not a cost acceptance claim.

Final protected-delivery browser gate: all556 selected cases completed with
536passed /20existing skips, 404.45real /256.31user /62.32sys seconds. Required
1,631 /449files PASS58.92real and quick 31 PASS28.23real remain current. Node
24.18.0 / Playwright1.64.1 confirmed. No timeout/retry/skip/selection changes;
no production build ran during browser validation. Apple project edit remains
1insert/1delete untouched; outputs retained;28/159tasks checked.

REST snapshot/server proof primitives (November7): opt-in supported GET routes
(accounts, account transactions, categories, merchants, review issues) can return
a private user-bound source-permission proof header without changing the DTO.
Other route/method/protocol combinations reject. Header evidence is bounded;
empty non-existent scopes do not invent lineage. Task-bearing and reconciliation
REST responses are not opted in. Current scopes/member roles and permission
counters are checked; later group revocation or source-counter changes invalidate
the evidence. Client integration into remaining retained API-memory views is
still unfinished, so this is not a claim those views are repaired.

The cache-only body protocol can combine up to64 prior proofs, with a250,000
character request-evidence cap and existing1MB overall body cap. Every envelope
is authenticated; contradictory generations are rejected, dependencies are never
dropped, and the merged set receives the same two canonical verification rounds.
No per-proof duplicated source-read rounds, new resources or Apple DTO changes.

Transport compatibility correction: immutable balance snapshots and reconciliation
records may omit body.version only with envelope.version1. Opening-balance IDs
retain their existing account-ID-opening shape. Mutable records still require an
exact body/envelope version match. Focused snapshot/bundle/transport checks47 /
4files PASS349ms; typecheck PASS. Required1,639 /449files PASS59.45real /238.16user /
49.66sys. Full536/20/556 and quick 31 above precede this narrow immutable-envelope
and unused opt-in API primitive follow-up; their timings retain that scope.
No task boxes added: T027/T029/T032/T018 stay open.

Source locator safeguards (November7): the same current source-kind mapping now
drives canonical legacy locator writes and backfill support (including links,
balance/reconciliation/review/match/reusable/transfer records). Existing scopes
remain inaccessible without current source checks. New pointer creation requires
an unused ID; updates/deletes must match the loaded location or an absent pointer.
Cross-scope collision attempts roll back canonical/task changes and preserve the
original pointer; conflicting deletion/backfill also stop. Actual migration stays
unrun; the backfill assertion used only the in-memory SDK fixture. Required1,640 /
449files PASS59.34real /238.47user /49.96sys; focused41/4files PASS353ms;
typecheck PASS. Existing full/quick timings keep their earlier scope. No task
boxes checked, new resources, production changes, push or merge.

Unsupported-event hold (November7): unknown Finance kinds and known kinds without
a server source-authorization implementation return upgrade-required, retain the
previous Finance cursor and deliver no protected rows. Ordinary task changes and
the ordinary cursor still advance. No source body is inspected merely to decide
an unsupported-kind hold. New rows with complete supported source evidence retain
their prior delivery behavior; old-client DTOs were not changed.

Required1,642 /449files PASS59.92real /239.06user /50.56sys; focused50 /4files
PASS343ms; typecheck/whitespace PASS. Current Chromium+WebKit actual IDB/AES probe
all19flags PASS1.44real/.67user/.30sys, now also covering immutable opening balance
and reconciliation bodies without invented body versions. Prior full536/20/556
404.45real keeps its original scope; current quick 31 is running. Client memory
snapshot integration remains the next unfinished boundary;28/159tasks checked.

Transaction API-memory integration (November7): the client collects proof-bearing
GET responses, authenticates the combined prior/new evidence, and commits only
renewed encrypted proof metadata with an unchanged Finance cursor. API values
stay in an opaque memory snapshot, not database checkpoint data. Snapshot handles
are disposed on lock/unmount, cannot be reused by a fresh/account-switched visit
or after cache-generation changes, and never bypass before/after source checks.
The transaction page now verifies local index queries and detail opens, ignores
late results, hides old hits while checking, and does not report revoked data as
confirmed zero matches. Lock/failure clears transaction, category, merchant,
account-label, issue and selection memory even with Require PIN off. Explicit
Refresh transactions reloads a fresh verified snapshot. Other retained REST
views and complete story/offline draft behavior still require work.

Affected browser first run:12passed/4failed/16selected/73.28real; all transaction
journeys passed, while all four quick Finance journeys timed out after offline
CSV queueing. The initial empty-cache check had counted encrypted pending CSV
projections as unproven server data. Shared bootstrap now reads record keys and
Finance outbox IDs in a readonly transaction, ignores pending intent for that
classification and preserves its row/outbox bytes. It does not assign pending
rows a trusted cache generation or permit decrypting them as server cache.
Unrelated unproven legacy projections still close the gate. No timeout/retry/
skip/selection relaxation. Final affected matrix PASS16/16,18.83real/16.48user/3.63sys.

Required1,652/451files PASS60.70real/239.68user/50.31sys; final focused39/4files
PASS1.51s; typecheck/lint PASS. Current broader quick/full results above keep
their pre-integration scope. No new task checkmarks, cloud writes or migration.
Legacy transaction REST loading still fans out across account pages; this is
source-access work, not bounded-read/performance/cost acceptance. T018/T027/
T029/T032 remain open.

Final transaction snapshot checkpoint: affected transaction+Finance quick matrix
16PASS /18.5sPlaywright /18.83real /16.48user /3.63sys. Current broad quick 31PASS /
29.2sPlaywright /29.65real /38.36user /7.78sys. Chromium/WebKit actual IDB/AES
probe21flags PASS0.93real/.64user/.20sys, including pending-only CSV bootstrap
without ciphertext/generation mutation, API-memory disposal with Require PIN off,
and all prior encrypted delivery/receipt/outbox/key boundaries. Required1,652 /
451files PASS60.70real. Last full536pass/20existing skips/556selected404.45real
predates this narrow transaction API-memory integration; no full-story claim.
Changed-code lint/typecheck/format/whitespace checks pass. Apple project edit is
still1insert/1delete, untouched; outputs retained;28/159tasks checked. No new
required/quick selections/timeouts/retries/skips, cloud changes, migration, push
or merge. Next local foundation issue identified: new manual accounts do not yet
append their account parent/opening-snapshot events to the protected feed.

Manual parent delivery/disposal checkpoint: manual-account creation now writes
its account and immutable opening balance to the same protected feed commit;
opening effective/recorded dates remain original, while feed publication uses
current server time. Actual generated-condition HTTP sync fixture delivers both
parents once and proves no duplicate feed on saved-result replay. Query fixture
now models both prefix and bounded feed-key ranges. Source read authorization and
Apple DTO bodies remain unchanged. Added one case gives1,653/451files; red1failed/
24passed/25cases412ms, focused44/4files PASS366ms, required PASS61.16real/239.05user/
49.36sys. Snapshot disposal now also rejects a reader already awaiting a callback,
with checks after callback and final source verification; strengthened existing
case red1failed/6passed/7cases172ms, focused39/4files PASS1.50s, typecheck PASS.
Final required1,653/451files PASS59.52real/239.02user/49.16sys. Browser timings
above retain their pre-parent/backend and disposal-follow-up scope. No boxes
checked, actual migration/cloud writes or native changes. Other legacy write
paths still need a feed-completeness review; this is not full sync acceptance.

Import identifiers/account binding (November8): new manual opening snapshots and
new CSV transactions use contract-conformant ULIDs. Existing stored IDs are never
rewritten. CSV receipt identity remains account/batch/ordinal, and retry duplicate
review excludes the same approved batch, including legacy compound IDs. The real
generated-write fixture now interrupts after20rows and resumes100, preserving
those20IDs and two distinct identical-looking input rows, then replays without
duplicates. Response schemas explicitly describe optional currency in source
snapshots and already-emitted effective/status/provider identity fields; strict
unknown-field rejection and legacy response shapes remain. Transport retains
legacy CSV batch:ordinal identifiers when their provenance matches and supports
typed tombstones; it does not silently rewrite old pending/source identities.

Finance requests now declare the tab's expected user. Canonical session identity
remains the sole authority; a mismatch rejects before protected reads/proof
renewal/replay. The same consistency check covers Finance PIN management/unlock/
revoke. A detected different session account or401/403 refresh closes the old
local access state; offline network failures do not invent a known revocation.
The header is optional for existing clients and grants no rights. New client
requests cannot accept another cookie account's opaque proof into the old local
owner's checkpoint. Native directories were not changed.

Focused82/8files PASS544ms; typecheck PASS. Required1,655/451files PASS60.34real/
237.12user/48.36sys. Affected PIN/transaction/quick/account-switch browser matrix
32PASS47.9sPlaywright/48.31real/32.58user/6.93sys. Current broad quick 31 is running.
Other retained REST-memory paths, legacy source feed omissions, full catch-up/
command families and cost/external acceptance remain open;28/159tasks checked.

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

Full browser checkpoint after canonical feed/catalogue changes: 536passed/20existing
skips/556selected,403.97real/257.93user/63.43sys. No failures or changed skips,
retries/timeouts/selections. This includes transaction API-memory/account-binding/
import-ID changes and canonical feed/catalogue safeguards, before the next account
list/detail snapshot integration. The two focused account jsdom tests ran during
this full preview run; no build ran concurrently, and its compiled browser build
stayed fixed. Browser fixtures were edited after their cases completed; the new
account checks remain excluded from this full-build claim.

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

Usage/idle-proof final quick 31 PASS27.8sPW/28.12real/39.10user/7.90sys. Required
1,666PASS63.53s, focused46PASS335ms, no browser/test selection changes. Usage
answer recorded as10hours/day overall including2Finance hours, with two-client
sensitivity rather than an assumed per-partner total. All local current checks
pass; T018/T027/T029/T032 remain unchecked and migration remains unrun.

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

Pending-recovery/current-source required1,677/453files PASS60.90real/241.89user/
50.25sys. Actual Chromium+WebKit IndexedDB/non-extractable AES probe24flags each
PASS1.32real/0.66user/0.28sys, including combined snapshot disposal and unchanged
CSV staging/intent through scope purge plus cache invalidation. Targeted GET
fixture strengthened for0writes/0Query on current source, no foreign scope body
or metadata read through a moved locator, and legacy CSV identity/ordinal match
(or404when inconsistent). Same test count; focused28PASS below, standalone
1,677running to include strengthened assertions. Node24/Playwright1.64.1 unchanged.
No browser builds/tests currently active. Quick 31/full556 follow sequentially.

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

Known-task fence current required1,680/453files PASS61.86real/242.42user/49.87sys.
Runtime/typecheck/lint/test/build pass, no case selection/timeout/retry/skip or
workflow change. All current source implementation is frozen for final local
validation.25-flag synthetic browser probe running; standalone/current quick 31
and full556 follow sequentially. Real DynamoDB/hosted/cost/p95 remain deferred.
28/159 tasks checked; T018/T027/T029/T032 and dependent stories remain open.

Current frozen batch standalone1,680/453files PASS50.43real/222.93user/47.52sys.
Actual Chromium+WebKit synthetic IDB/non-extractable AES probe 25flags each PASS
1.40real/0.67user/0.30sys, including ordinary task revocation with a separate
ordinary cursor, pending staging preservation, combined snapshot lifecycle and
prior storage/cursor/rollback cases. Quick 31 running; full556 follows. No source
changes or builds run alongside browser validation. All user assumptions remain
recorded; no new user answer is required by this batch.

Final batch quick 31 PASS28.8sPW/29.11real/38.08user/7.92sys. Current required
1,680/453files PASS61.86real; standalone1,680/453files PASS50.43real. Actual
Chromium+WebKit synthetic storage25flags each PASS1.40real. Full556current build
running sequentially after all other checks; no concurrent build/source edits.
Task boxes remain28/159, current external acceptance/deploy/migration deferred.

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

| Command                                        | Result                                                         | Real / user / sys seconds |
| ---------------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| `npm run validate`                             | 1,686 passed /455 files; runtime, typecheck, lint, builds pass | 63.57 /252.67 /51.84      |
| `npm run test`                                 | 1,686 passed /455 files                                        | 52.77 /237.46 /50.14      |
| `npm run test:e2e:quick`                       | 31 passed; Playwright 28.2 s                                   | 28.61 /40.33 /8.06        |
| `npm run test:e2e`                             | 536 passed, 20 existing skips, 556 selected                    | 413.26 /271.11 /66.40     |
| Synthetic real-browser encrypted-storage probe | 25 flags each in Chromium and WebKit                           | 1.96 /0.72 /0.31          |

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

| Command                                    | Actual result                                                     | Real / user / sys seconds |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------- |
| Required `npm run validate`                | 1,695 passed /455 files; runtime, typecheck, lint and builds pass | 61.31 /242.24 /51.72      |
| Standalone `npm run test`                  | 1,695 passed /455 files                                           | 51.41 /225.65 /49.44      |
| Quick browsers                             | 31 passed; Playwright29.3s                                        | 29.71 /38.34 /7.96        |
| Full browsers                              | 536 passed, 20 existing skips, 556 selected                       | 407.01 /259.87 /64.23     |
| Existing synthetic encrypted-storage probe | 25 flags per engine in Chromium and WebKit                        | 1.21 /0.67 /0.29          |

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

| Command                                    | Actual result                                              | Real / user / sys seconds |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------- |
| `npm run validate`                         | 1,704 passed /455 files; runtime/typecheck/lint/build pass | 63.83 /244.82 /51.39      |
| `npm run test`                             | 1,704 passed /455 files                                    | 52.05 /225.07 /49.42      |
| `npm run test:e2e:quick`                   | 31 passed, Playwright29.2s                                 | 29.54 /39.46 /8.32        |
| `npm run test:e2e`                         | 536 passed, 20 existing skips, 556 selected                | 412.33 /263.17 /64.47     |
| Existing synthetic encrypted-storage probe | 25 flags each in Chromium and WebKit                       | 1.27 /0.68 /0.30          |

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
recorded in the November 9 forecast window checkpoint.

Correct branch codex/task-item-creation-uploads and feature016; Apple project 1/1
edit and untracked outputs/ preserved. git diff --check passes. Extension file
absent, no hooks. No push, merge, deployment, production/AWS write, real DynamoDB,
native Apple implementation/validation or migration. $6.50 including 30% contingency
unchanged. Original receipts stay S3 Standard and transactions do not expire.

November 9 forecast window and retained route checkpoint. The shared resolver
uses a rolling 12-month default for open-ended budgets, inclusive dates for
dated budgets, and an explicit override for either. Forecast models and their
API and UI are pending. The API now issues protected snapshot proofs for the
budget, reusable, match, and selected removal-preview reads used by the web
client. Transaction and account removal impacts clear on lock, and match
generation and retries recheck current budget and related-account access.
The earlier browser fixture race and its corrected rerun are recorded in the
runtime report. T018, T027, T029, and T032 remain open.

November 10 transaction write checkpoint. Allocation and transfer actions in
the web client recheck retained source access before dispatch. Transfers send
the displayed versions for both legs. The API accepts the existing payload
without versions for client compatibility. An accepted action reloads the
affected transactions from verified reads before reporting success.

The API checks current account access before returning a receipt for manual
creation, correction, allocation, merchant association, or transfer. The
manual creation retry preserves its original result when the route supplies a
new generated ID on retry. Integration fixtures exercise version conflict and
access revocation. This is partial T029 evidence.

Manual account creation and balance replay now recheck the current account
scope. The account fixture moves an account out of the original caller's
scope and verifies that its receipt becomes unavailable. Permitted retries
with a newly generated request ID return the original record and preserve
the count of saved balances.

November 11 account edit and budget replay checkpoint. The account
browser journey covers a successful balance and name change, canonical
refresh after a misleading mutation response, and revocation before
another balance write. Budget integration covers stable permitted retries,
lost group membership, and loss of access to a related account while
budget membership is still current. T029 remains open.

## November 11 continuation — sync acknowledgements and access invalidation

The protected sync endpoint withholds Finance rows and retains the prior Finance
cursor when an unlock expires during proof issuance or response delivery. The
ordinary task cursor and rows can still advance. Invalid application sessions
continue to fail authorization. Browser replay retains encrypted intent when the
response names another mutation or acknowledges an unadvanced entity version.

An ordinary group revocation now invalidates Finance cache evidence even when
the page contains no task tombstones. Ordinary progress commits first. Cache
invalidation retains encrypted pending work and tells peer tabs to revalidate,
including tabs where Require PIN is off. The controller closes stale access
before notifying subscribers and discards late unlock metadata from a cancelled
visit. A late lock response from that visit cannot invalidate a subsequent unlock.

Focused validation passed 167 tests in 15 files. This includes the indexed
sparse/verified-empty command double, bounded read-model and query-job checks,
local migration compatibility fixtures, and synthesized infrastructure. The
20 synthetic sparse/zero-match probes examine at most one row each and issue
one query each. The fixture provides local feasibility evidence. Actual AWS
latency, billed capacity, hosted duration, and combined cost acceptance remain
deferred. The migration is unrun and the combined ceiling is still $6.50 per
month including 30% contingency.

The full browser matrix and quick suite are blocked at preview startup in the
managed session. See the runtime report for the actual counts and timings.
Initial historical bootstrap, additional semantic replay, and the full retained
view and lifecycle audit remain open. The task count stays at 28 of 166, with
T018, T027, T029 and T032 open.
