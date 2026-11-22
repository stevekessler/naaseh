# Finance Experience Required Validation Runtime

## November 22 receiving-computer validation

Node 24.22.2 and Playwright 1.64.1 were used for both revisions. The locked
dependencies came from the local Finance forecast checkout with the identical
lockfile after the registry could not be reached.

| Gate | Verified transfer baseline | Reconciled checkpoint |
| --- | --- | --- |
| `npm run validate` | 2,021 passed in 507 files, 77.94 s real | 2,042 passed in 513 files, 67.89 s real |
| `/usr/bin/time -p npm run test:e2e:quick` | 31 cases discovered. Preview listener denied at 3.93 s. | 31 cases discovered. Preview listener denied at 3.67 s. |
| Dashboard/trends, Spend Report, receipts and expense/task links | — | 34 Chromium and WebKit cases discovered. Preview listener denied at 3.63 s. |

Required local validation includes the runtime gate, typecheck, lint and builds.
No browser case ran because the environment denied binding `127.0.0.1:4173`.
Run the existing quick command and the dedicated desktop selection where the
preview server can bind:

```sh
/usr/bin/time -p npm run test:e2e:quick
/usr/bin/time -p npm run test:e2e -- --project=chromium --project=webkit finance-dashboard.spec.ts finance-spend-report.spec.ts finance-receipts.spec.ts finance-expense-task-links.spec.ts
```

Required commands, workflows, browser selection, projects, retries and timeouts
are unchanged. Hosted PR runtime and deployed Finance measurements remain open.

## November 16 Dashboard and spending trends

On Node 24.18.0, `npm run validate` passed **2,021 tests in 507 files
in 65.57 s**, including runtime, typecheck, lint and builds. The prior staging
checkpoint passed 2,013 tests in 506 files in 70.11 s. The required command
and workflow are unchanged.

The dashboard suite discovered 10 desktop cases in one file. Preview startup
was denied on `127.0.0.1:4173` after 3.81 s. The timed quick command reached
the same listener denial after 3.82 s. Quick discovery still lists 31 cases in
20 files. Hosted timing and the two-second dashboard read target remain open.

## November 16 T122 reconciliation and restore

On Node 24.18.0 the required command passed **2,008 tests in 506 files in
69.00 s**, including typecheck, lint and workspace builds. The previous
complete run was 2,007 tests in 506 files in 66.90 s. The focused selection
passed 92 tests in 10 files in 0.80 s (Vitest duration). The required workflow
and 31-case quick browser selection are unchanged.

The separate T123 browser command discovered 12 Chromium and WebKit cases.
It stopped after 3.79 s when the environment denied the local preview listener.
Hosted validation timing is pending.

## November 16 integrated quick browser fixture

The quick Finance journey failed at sign-in because its mock required a cache
proof before initial Finance cache sync produced one. The trace also showed an
unmocked ordinary sync request returning 500. The journey now uses the existing
ordinary sync mock and allows the initial proofless request. Requests carrying a
proof still validate against the fixture token.

With the locked PDF package installed, `npm run validate` passed 2,007 tests in
506 files, plus runtime, typecheck, lint and workspace builds in **66.90 s** on
Node 24.18.0. The quick selection still lists 31 tests in 20 files. The timed quick
rerun built the web app and stopped after **3.87 s** when the environment denied
the preview listener on `127.0.0.1:4173`. Browser execution still needs verification.

## November 15 two-computer integration

The first-parent validation baseline used `3dd1e337` on Node 24.18.0.
The newer first-parent checkpoint `131e515f` changes only browser evidence and
the T126 checklist entry. Integration adds 61 passing tests across eight files
over that baseline. The workflow, quick selection, projects, timeouts and
retries are unchanged.

| Command | Actual result | Real time |
| --- | --- | --- |
| Baseline `npm run validate` | 1,946 tests in 498 files plus runtime, typecheck, lint and builds | 77.60 s |
| Integrated focused Vitest | 132 passed in 19 files | 2.09 s |
| Integrated `npm test` | 2,007 passed in 506 files | 55.32 s |
| Integrated `npm run lint` | Passed | 4.89 s |
| Integrated `npm run validate` | Stopped at typecheck because `pdfjs-dist@6.5.438` was unavailable | 7.37 s to block |
| Integrated `npm run test:e2e:quick` | Preview build stopped at the same missing package. Discovery listed 31 tests in 20 files. | 2.43 s to block |

The locked package was absent from the local npm cache and the registry hostname
was unavailable from this session. A complete integrated validation duration,
browser results and hosted validation timing are pending.

## November 14 Phase 9 upcoming-expense completion

The shared Finance landing page now connects the protected upcoming-expense workspace
and canonical dashboard widget. Required discovery increased from the core checkpoint
by **3 tests and 1 file**. The complete required command remains unchanged and passes
on Node 24 with runtime, typecheck, lint, all tests and all workspace builds. The new
exhaustive browser file remains outside `test:e2e:quick`, so its 31-case selection and
the existing browser timeouts, retries and projects remain unchanged.

| Command                       | Actual result                                                    | Real / user / sys        |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------ |
| Required validation           | 1,910 passed in 492 files; typecheck, lint and all builds passed | 63.58 / 253.62 / 50.95 s |
| Focused web components        | 12 passed in 4 files                                             | 0.54 s Vitest duration   |
| Chromium/WebKit upcoming gate | 6 passed                                                         | 8.22 / 11.20 / 1.98 s    |

The required runtime is **1.34 seconds higher** than the 1,907-test core checkpoint
and **3.61 seconds lower** than the measured Phase 7 checkpoint while remaining far
below the ten-minute target. The browser gate covers original Denver entry context,
inactive-budget selection and retained associations, reschedule/cancel, partial/full
and reversed payment references, canonical upcoming/overdue dashboard identity and a
delayed Auckland offline replay with unchanged due date. Real DynamoDB and hosted
acceptance remain deferred under T018; no migration, AWS write, deployment or
production change ran.

## November 14 Phase 9 upcoming-expense core and offline replay checkpoint

Required discovery increased from the Phase 7 checkpoint by **31 tests and 8 files**.
The complete required command remains unchanged and passes on Node 24 with runtime,
typecheck, lint, all tests and all workspace builds. No test was added to the required
Playwright quick selection, so its 31-case selection and the existing browser timeouts,
retries and projects remain unchanged.

| Command             | Actual result                                                    | Real / user / sys        |
| ------------------- | ---------------------------------------------------------------- | ------------------------ |
| Required validation | 1,907 passed in 491 files; typecheck, lint and all builds passed | 62.24 / 252.17 / 51.20 s |
| Focused core/replay | 51 passed in 4 files                                             | 0.28 s Vitest duration   |
| Focused web         | 6 passed in 2 files                                              | 0.40 s Vitest duration   |

The required runtime is **4.95 seconds lower** than the measured Phase 7 checkpoint
despite the added coverage and remains far below the ten-minute target. Browser
journeys are intentionally not recorded as complete yet because the Phase 9 list,
detail and dashboard components still need shared landing-page integration after the
concurrent Phase 8 branch is combined. Real DynamoDB and hosted acceptance remain
deferred under T018; no migration, AWS write, deployment or production change ran.

## November 14 manual transaction entry on every editable account

Phase 7 now accepts manual debit or credit transactions for every permitted account
type and source. The protected write point-loads current account authorization and
revision evidence, validates exact currency/date/direction/amount input and commits a
stable transaction ID with an exact-intent receipt. Manual SimpleFIN entries remain
provisional and do not alter provider balances. Exact retries return the saved result;
changed intent, revoked access and stale evidence fail safely.

The reusable account/global form supports merchant, payment type, check number, memo,
note and category allocations. It retains invalid or rejected input, refreshes the
canonical list once after an accepted online save and encrypts offline intent for
strict protected replay without presenting it as a posted provider transaction.
Provider reconciliation retains user-owned payment/classification metadata, refund
capacity and stable canonical references. The canonical-reference extension hook is
covered now; receipt/task/fulfillment consumers remain deferred until their downstream
stories add those relationships.

The focused all-source/API/replay/reconciliation set passed **70 tests in 6 files**.
The dedicated Chromium/WebKit manual-entry journeys passed **6/6** in **8.63 seconds
real**. Required discovery increased by **10 tests and 1 file**; the required quick
browser selection remained 31.

| Command             | Actual result                                                    | Real / user / sys         |
| ------------------- | ---------------------------------------------------------------- | ------------------------- |
| Required validation | 1,876 passed in 483 files; typecheck, lint and all builds passed | 67.19 / 263.77 / 56.17 s  |
| Standalone suite    | 1,876 passed in 483 files                                        | 53.57 / 238.69 / 49.71 s  |
| Quick Playwright    | 31 passed; required selection unchanged                          | 28.89 / 40.23 / 8.01 s    |
| Full Playwright     | 560 passed / 28 existing skips / 588 selected                    | 433.96 / 292.37 / 73.78 s |

The full matrix passed without a retry after the Mac readiness check. Node 24 and
Playwright 1.64.1 were retained. No timeout, retry, browser project or required test
selection changed. The migration remains unrun; real DynamoDB and hosted acceptance
remain deferred under T018. This evidence completes T066–T071 and Phase 7.

## November 14 active budgets using existing groups

New budgets now save immediately active for any current group membership, including
groups with no linked accounts. Group choices come from the membership directory and
display names rather than account-derived identifiers. Activity and closure are
independent, versioned lifecycle dimensions: deactivation prevents new or reassigned
upcoming associations while preserving existing links, flags and history; reactivation
does not reopen a closed budget. Legacy drafts remain drafts until an explicit Save as
active action. Online and queued offline writes recheck current membership, retain
unsaved input on denial and publish only protected canonical state.

The focused domain, contract, API, replay, migration, component and security selection
passed **71 tests in 12 files**. The dedicated Chromium/WebKit group/activity browser
file passed **6/6** in **8.2 seconds**, and the affected desktop Finance matrix passed
**20/20** in **14.7 seconds**. Required discovery increased by **12 tests and 2 files**;
the required quick browser selection remained 31.

| Command             | Actual result                                                    | Real / user / sys          |
| ------------------- | ---------------------------------------------------------------- | -------------------------- |
| Required validation | 1,866 passed in 482 files; typecheck, lint and all builds passed | 63.69 / 254.33 / 51.76 s   |
| Standalone suite    | 1,866 passed in 482 files                                        | 52.20 / 238.60 / 49.81 s   |
| Quick Playwright    | 31 passed; required selection unchanged                          | 27.52 / 41.73 / 8.55 s     |
| Full Playwright     | 548 passed / 28 existing skips / 576 selected                    | 506.68 / 447.06 / 109.94 s |

The first required attempt found a TypeScript-only helper constraint that required an
index signature from a budget detail view. Making the helper generic over its actual
identity/version fields preserved the same runtime checks and the complete rerun passed.
The first full browser run finished **546 passed / 28 skipped / 2 failed** in
**450.39 / 333.01 / 82.14 seconds**. Both failures were the same pre-existing enhanced
list navigation helper: a synthetic touch/mouse click reported completion while WebKit
remained on Tasks after hover-driven menu rendering. The initial two-project retry
passed WebKit and reproduced iPhone. Activating the accessible Lists button by keyboard
removed that ordering race; the four-project focused file passed **4/4** in
**9.77 / 11.21 / 2.00 seconds**, followed by the clean complete matrix above.

No timeout, retry, browser project or required quick selection changed. An initial
quick attempt was blocked before execution by local port-binding permission; the
permitted unchanged run is the recorded result. The migration itself remains unrun,
real DynamoDB and hosted acceptance remain deferred, and no AWS, production or Apple
change occurred. This evidence completes T063.

## November 13 payment classification and refund relationships

Payment/check metadata, one-level category hierarchy and immutable historical
classification snapshots now round-trip through the protected Finance paths.
Merchant edits use versioned authorization and canonical collision handling.
Explicit full or partial refund relationships retain the refund's received date,
enforce the readable/editable source intersection and principal capacity, and can
be corrected or removed without changing either source transaction. Unlinked
credits do not offset spending. Provider corrections and canonical alias repair
retain confirmed compatible snapshots and remove incompatible exact contributions.

The focused domain, contract, integration and security set passed **59 tests in
14 files** in **2.92 / 3.06 / 0.64 seconds real/user/sys**. It covers offline
retry, original recategorization snapshots, partial and later-period same-currency
cross-account refunds, competing claims, unlink/relink and alias correction. The
new classification/refund desktop browser journeys passed **2/2** in **9.9 seconds
real** across Chromium and WebKit.

| Command             | Actual result                                                    | Real / user / sys         |
| ------------------- | ---------------------------------------------------------------- | ------------------------- |
| Required validation | 1,854 passed in 480 files; typecheck, lint and all builds passed | 65.18 / 254.33 / 53.25 s  |
| Standalone suite    | 1,854 passed in 480 files                                        | 52.66 / 237.35 / 50.06 s  |
| Quick Playwright    | 31 passed; required selection unchanged                          | 26.99 / 40.14 / 8.24 s    |
| Full Playwright     | 542 passed / 22 existing skips / 564 selected                    | 417.68 / 276.40 / 67.22 s |

The first full matrix completed with **532 passed / 22 skipped / 10 failed** in
**439.23 / 292.07 / 71.67 seconds**. Eight failures exposed test-contract drift:
Finance navigation had gained a second accessible destination set, and transaction
reconciliation tried to navigate behind an open modal. The tests now scope the
Finance-section navigation and close the modal before changing pages. The other
two failures were iPhone navigation races after asynchronous completion feedback
inserted and shifted the page. Waiting for the completed-task region before
navigating made the focused affected set pass **22/24**, followed by **4/4** for
completion feedback under an awake hold.

One intermediate targeted run was interrupted by a broad Mac suspension and is
diagnostic only. The decisive complete matrix used a temporary `caffeinate` hold
and passed as recorded above. No application, browser or test timeout, retry,
project or required quick selection changed. T056 is supported by this evidence;
real DynamoDB and hosted acceptance remain deferred, and no migration or AWS
write occurred.

## November 13 Finance navigation and account experience

Finance now has one canonical route model for every contracted destination,
including new-before-ID parsing, account/budget/merchant details and transaction
modal background history. Cross-section navigation no longer leaks task-filter
query parameters into Finance. The primary menu order is Tasks, Lists, Finance,
Journal, Search and authorized-only Admin; the Finance disclosure exposes the ten
contracted destinations without removing profile, sign-out or other secondary
tools.

New Account is a dedicated page with field-specific retained validation. A create
response is not display authority: navigation occurs only after a protected
canonical account read confirms the saved id/version. Account detail uses labeled
summary, balance/freshness, settings, transaction/import and destructive regions,
and remains free of page-wide overflow at 375 CSS pixels. The dashboard reads
canonical protected accounts and distinguishes checking, confirmed empty,
fresh/stale and unavailable states without mock totals. SimpleFIN remains a
per-connection Accounts/New Account workflow; no application-wide credential UI
or Admin destination was invented.

The focused component/navigation set passed **18 tests / 5 files**. The new
account browser case passed **4/4** across Chromium, WebKit, iPhone and iPad in
**9.60 seconds real**. The consolidated new and retained account matrix passed
**16/16** across all four projects in **21.53 seconds real**. Browser projects,
retries and timeouts were unchanged; the new exhaustive account spec was not
added to required quick selection. The required quick selection remains 31.

Required validation now passes **1,827 tests / 473 files** plus typecheck, lint
and all builds in **62.53 seconds real**. The standalone suite passes the same
**1,827 / 473** in **52.61 seconds real**. The unchanged required quick suite
passes **31/31** in **27.71 / 39.92 / 7.62 seconds real/user/sys**.

The first required attempt found one legacy route serializer contract still
calling `{section: 'finance'}` without an explicit view. Restoring that compatible
form to `/finance` made its focused 7-test set and the complete required rerun
pass; parsed Finance routes remain explicit. The first quick attempt after modal
integration timed out because the representative journey tried to navigate behind
the transaction modal. It now closes the modal before opening Budgets; the focused
journey and complete quick repeat pass without changing the 30-second timeout.

One earlier immediate repeated quick run encountered a broad local browser/resource
failure (**7 passed / 24 failed in 15.71 seconds**); an isolated baseline passed
unchanged immediately afterward and the 16-case Finance account matrix then
passed. That failed rerun is diagnostic evidence only, not an accepted gate.

## November 13 canonical SimpleFIN connection reads

The SimpleFIN panel now treats claim and refresh POST responses only as completion
signals. It loads the current actor-authorized connection through a proof-bearing
canonical GET, retains that source evidence, checks the connection id/version again
before refresh, and reloads the canonical row after either mutation. A failed GET
shows a reconnect state instead of exposing claim controls as though no connection
exists. The API list excludes connections outside the actor's current scope and never
returns the encrypted access URL or credential key id.

Focused API and component coverage passed **7 tests / 2 files**. Required discovery
increased from **1,813 / 469 files** to **1,816 / 470 files**. Browser selection,
projects, retries and timeouts remained unchanged.

| Command                 | Actual result                                                         | Real / user / sys         |
| ----------------------- | --------------------------------------------------------------------- | ------------------------- |
| Required validation     | 1,816 passed in 470 files; runtime, typecheck, lint and builds passed | 64.63 / 255.36 / 52.92 s  |
| Standalone suite        | 1,816 passed in 470 files                                             | 53.56 / 240.79 / 50.79 s  |
| Targeted account matrix | 12 passed across all four projects                                    | 18.81 / 14.75 / 2.89 s    |
| Quick Playwright        | 31 passed                                                             | 26.98 / 39.22 / 8.14 s    |
| Full Playwright         | 536 passed / 20 existing skips / 556 selected                         | 408.55 / 275.23 / 66.98 s |

The first full attempt exposed a fixture gap rather than an application failure:
the dedicated PIN server returned 404 for the new canonical connections endpoint,
so the cache-evidence layer correctly marked Finance security stale. The attempt
finished with **524 passed / 20 skipped / 12 failed** in **422.65 seconds**; the
same three PIN cases failed across four projects. Adding an empty proof-bearing
connection list to that synthetic server made all **12/12** affected cases pass in
**35.3 seconds**, and the complete unchanged matrix then passed as recorded above.

This canonical-read batch supplied the last retained-view evidence for T029. A following
audit of all paths named by T029 plus the focused lock/embedded/sign-out/sync/search/write
set passed **87 tests / 7 files** and found no Finance Blob URL producer. T029 is now
checked. The following full delivery/replay audit passed **82 tests / 6 files** and
completed T027: independent cursors, source-gated delivery, legacy behavior, ordinary
progress and every currently queueable replay family are covered. The consolidated US2
gate then passed **168 tests / 14 files**, all **12/12** PIN browser cases and the full
matrix; T032 is checked. T018 remains open for its separately documented external
acceptance gate. No AWS write, migration, Apple change,
workflow expansion, production action or cost-ceiling change occurred.

## November 12 protected budget creation replay

The v8 Finance replay adapter now accepts queued budget creation with baseVersion0
and a stable client-selected ULID. It forwards only strict budget business input
through a replay-only protected POST path. Ordinary budget creation retains its
server-generated ID. Current group edit access, group revision, exact locator and
exact retry row are point-read; existing-metadata creation performs no Finance
history query. Missing metadata requires the existing strongly consistent
key-only `Limit:1` empty-namespace proof. Foreign or incomplete evidence cannot
fall back to scope hydration.

The canonical budget, locator, feed change and exact-intent receipt commit under
the existing conditional revision fence. Exact retries return alreadyApplied,
changed intent conflicts, direct calls to the replay-only path fail, and sync
results do not expose the protected budget model. The PWA now atomically encrypts
an unlinked offline budget draft and its matching create intent, then retires only
that unverified draft on exact acknowledgement before protected delivery installs
the canonical copy. A form with selected accounts stays open and requires
reconnection because account-link replay is still pending; selections are not
dropped. Four server/adapter cases and four client/atomic-write cases were added.
The focused replay/client/checkpoint/runtime set passed **88 tests / 4 files**.
Required/browser selection, projects, retries and timeouts were unchanged.

| Command                | Actual result                                                         | Real / user / sys        |
| ---------------------- | --------------------------------------------------------------------- | ------------------------ |
| Required validation    | 1,795 passed in 467 files; runtime, typecheck, lint and builds passed | 63.62 / 252.65 / 50.98 s |
| Standalone suite       | 1,795 passed in 467 files                                             | 53.53 / 238.01 / 49.51 s |
| Focused replay/PWA set | 88 passed in 4 files                                                  | 0.49 s Vitest duration   |
| Targeted budget matrix | 16 passed across all four projects                                    | 13.70 / 14.04 / 2.75 s   |
| Quick Playwright       | 31 passed                                                             | 26.48 / 40.17 / 7.92 s   |

The current complete browser evidence remains **536 passed / 20 existing skips /
556 selected** from the full matrix recorded below. The first required rerun
stopped with **1,794 passed / 1 failed** when an unrelated task-repository fixture
sampled its two expiry timestamps on opposite sides of a one-second boundary. The
unchanged file passed 2/2 immediately in isolation, and the complete required
repeat above passed. No Finance assertion failed in that attempt.

T027 remains unchecked because other semantic replay families and full story
acceptance remain open. T018/T029/T032 remain separately open. No cloud write,
migration, Apple change, workflow expansion or cost-ceiling change occurred.

## November 12 protected current-state bootstrap foundation

Fresh PWA Finance setup now pages current authorized catalogue/owner/group rows
directly from canonical DynamoDB partitions, 100 rows at a time. Encrypted
continuations bind the user, current active partition set, all canonical revisions
and a captured feed frontier. Server and client recheck source/membership/task
authority; a race restarts instead of mixing pages. Each page's encrypted records,
proof and continuation commit atomically. Only the final page advances the
independent Finance cursor to the captured frontier. Pending encrypted edits remain
protected. This adds no table scan, new AWS resource/index, migration, Apple field,
background timer or required browser case.

Focused API, route, client and IndexedDB checkpoint coverage passed **74 tests / 4
files**. Required discovery increased from **1,777 / 466 files** to **1,787 / 467
files**. The required workflow and quick browser selection stayed unchanged.

| Command                          | Actual result                                                         | Real / user / sys        |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------ |
| Required validation              | 1,787 passed in 467 files; runtime, typecheck, lint and builds passed | 61.48 / 243.81 / 50.68 s |
| Standalone suite                 | 1,787 passed in 467 files                                             | 51.45 / 228.79 / 48.28 s |
| Focused bootstrap/checkpoint set | 74 passed in 4 files                                                  | 0.29 s Vitest duration   |
| Quick Playwright                 | 31 passed                                                             | 27.78 / 38.49 / 7.94 s   |

The first quick attempt was blocked before test execution by sandbox port-binding
EPERM on `127.0.0.1:4173`; the permitted retry passed unchanged. T027 remains open
for additional semantic replay families and complete story acceptance. Real
DynamoDB/hosted latency and cost acceptance remain deferred under T018; the
migration remains unrun and the approved combined ceiling remains $6.50/month
including contingency.

## November 12 retained account, budget and reusable write fences

The earlier full-browser recovery remains the current complete browser matrix:
**536 passed / 20 existing skips / 556 selected** in **402.97 / 263.55 / 64.39 s**
real / user / sys. This implementation batch did not alter browser selection,
projects, retries or timeouts.

Task-link creation now verifies its parent budget snapshot before dispatch and
again before publishing the returned task destination. Normal CSV commits verify
the displayed account before online dispatch or encrypted offline persistence and
again before showing success. A revoked source leaves already encrypted offline
bytes queued but suppresses stale UI state. Reusable-item offline persistence uses
the same rule. Budget creation rechecks its retained budget/account snapshot after
creation and after each account link, stopping before another dependent write if
the source changes.

Before adding the account-detail file, the existing account snapshot baseline
passed **4 tests / 1 file** in **0.75 / 0.76 / 0.26 s**. The combined account set
passed **9 / 2 files** in **0.79 / 1.18 / 0.32 s**. The reusable snapshot baseline
passed **4 / 1 file** in **0.98 / 0.75 / 0.27 s** before its new race case. The
final focused retained-write set passed **22 / 4 files** in
**0.87 / 1.92 / 0.45 s**. Required discovery increased from **1,767 / 465 files**
to **1,777 / 466 files**; quick/full browser selection stayed 31/556.

| Command                       | Actual result                                                         | Real / user / sys        |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------ |
| Required validation           | 1,777 passed in 466 files; runtime, typecheck, lint and builds passed | 63.37 / 246.15 / 50.08 s |
| Standalone suite              | 1,777 passed in 466 files                                             | 51.75 / 228.91 / 48.53 s |
| Targeted account Playwright   | 12 passed across all four projects                                    | 19.18 / 14.26 / 3.01 s   |
| Targeted budget Playwright    | 16 passed across all four projects                                    | 14.07 / 13.58 / 2.60 s   |
| Targeted task-link Playwright | 12 passed across all four projects                                    | 10.50 / 11.54 / 2.18 s   |
| Quick Playwright              | 31 passed                                                             | 27.31 / 38.99 / 7.99 s   |

T018 remains open for real DynamoDB, hosted latency and combined-cost acceptance.
T027 remains open for initial-history bootstrap and additional replay families.
T029/T032 remain open for the rest of the retained-view and lifecycle audit. No
migration, AWS/hosted action, workflow expansion or Apple implementation occurred.

## November 12 full browser recovery and protected budget writes

Mac readiness was checked before browser execution: AC power, charged battery,
412 GiB available, load average 5.36/4.95/4.46 on 12 logical CPUs, Node 24.18.0
and exact Playwright 1.64.1. The prior 84–95 load condition was absent. The
existing full selection, projects, two workers, retries and timeouts were unchanged.

The full matrix completed before this implementation batch with **536 passed and
20 existing skips out of 556 selected** in **402.97 / 263.55 / 64.39 s** real /
user / sys. Desktop WebKit passed the area where the previous loaded-host attempt
timed out, and all four projects finished. The unchanged quick suite later passed
**31** in **27.36 / 38.46 / 7.86 s**.

Budget detail had no current-source check around item creation or reconciliation
and published optimistic/raw mutation data. The five new component regressions
failed before implementation, then passed after both operations checked the retained
snapshot before dispatch, checked it again after the response and requested a
canonical proof-bearing parent reload. The raw mutation DTO is never published.

Before adding this required test file, the existing three-case budget snapshot
file passed in **0.92 / 0.60 / 0.25 s**. The combined parent/child snapshot set
then passed **8 tests in 2 files** in **0.71 / 0.99 / 0.29 s**. The focused
budget/replay set passed **57 in 6 files** in **0.86 / 2.30 / 0.52 s**. Required
discovery increased from **1,762 / 464 files** to **1,767 / 465 files**; browser
selection stayed at quick 31/full 556.

| Command                    | Actual result                                                         | Real / user / sys        |
| -------------------------- | --------------------------------------------------------------------- | ------------------------ |
| Required validation        | 1,767 passed in 465 files; runtime, typecheck, lint and builds passed | 61.85 / 244.62 / 49.84 s |
| Standalone suite           | 1,767 passed in 465 files                                             | 51.33 / 228.08 / 47.65 s |
| Targeted budget Playwright | 16 passed across all four projects                                    | 12.46 / 13.18 / 2.77 s   |
| Quick Playwright           | 31 passed                                                             | 27.36 / 38.46 / 7.86 s   |

T018 remains open for real DynamoDB/hosted/cost acceptance. T027 remains open for
initial protected bootstrap and additional semantic replay families. T029 and T032
remain open for the rest of the retained-view/lifecycle audit and complete story
evidence. No migration, hosted/AWS action, timeout change or required browser
selection change occurred.

## Receiving-checkout baseline — 2026-11-05

Verified `codex/task-item-creation-uploads`, then fetched that branch from origin
and fast-forwarded from `4d676379` to published handoff commit `fdc6505b` with
`git merge --ff-only FETCH_HEAD`. No divergence or file collision occurred.
The feature pointer still resolves to `specs/016-finance-experience-expansion`.
The six pre-existing untracked files under `outputs/` were retained. No patch
was applied and no Apple source was changed.

Environment: macOS arm64, Node **24.18.0** through the existing fnm installation,
exact Playwright **1.64.1**. `npm ci` initially failed in the restricted environment
with `ENOTFOUND registry.npmjs.org`; the authorized network-enabled repeat succeeded
in npm's reported 24 seconds, installing 675 packages/auditing 703. It reported
15 vulnerabilities (3 low, 11 moderate, 1 high); no audit fix, dependency upgrade
or lockfile change was made. Matching Chromium 1248, headless shell 1248, FFmpeg
1013 and WebKit 2370 binaries were installed successfully.

Validation commands run sequentially under temporary `caffeinate -ims`, with
`/usr/bin/time -p`; no permanent power settings or test timeouts were changed.

| Command                                               | Actual result                                                                                                                      | Real / user / sys         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm run validate`                                    | PASS: runtime, typecheck, lint, 435 files / 1,415 tests, all workspace builds                                                      | 74.01 / 268.40 / 56.19 s  |
| `npm run test`                                        | PASS: 435 files / 1,415 tests                                                                                                      | 57.95 / 240.68 / 53.69 s  |
| Quick discovery                                       | 31 cases / 20 files / Chromium                                                                                                     | Enumeration only          |
| Full browser discovery                                | 556 cases / 70 files / four projects                                                                                               | Enumeration only          |
| `npm run test:e2e:quick`                              | PASS: 31 passed                                                                                                                    | 31.73 / 43.64 / 10.10 s   |
| `npm run test:e2e`                                    | Interrupted after repeated WebKit startup failures: 134 passed, 4 failed, 2 interrupted, 5 skipped, 411 did not run (556 selected) | 171.68 / 139.42 / 31.91 s |
| Isolated synthetic WebKit key persistence             | FAIL: 12-second diagnostic deadline                                                                                                | 12.55 / 0.41 / 0.11 s     |
| Same synthetic probe with browser call-stack sampling | FAIL: 12-second diagnostic deadline                                                                                                | 12.54 / 0.40 / 0.11 s     |

The four full-run failures were WebKit `admin.spec.ts:5`, `admin.spec.ts:110`,
`archive-project-reporting-full.spec.ts:4` and
`archive-project-reporting-offline.spec.ts:4`. The unchanged 30-second test
deadline expired during startup input/click/bootstrap, with reported case
durations around 35 seconds including teardown. The run was interrupted rather
than repeating the freeze through the remaining WebKit/iPhone/iPad cases. All
three Chromium Finance PIN cases passed within that run, including true network
offline verification. This is not full browser acceptance.

Following the handoff, a plain loopback HTTP page without application JavaScript
generated a fresh non-extractable AES-GCM key and attempted to commit it to a new
synthetic IndexedDB store. Both bounded runs timed out. A one-second sample of
only the second probe's Playwright UI process shows the
`org.WebKit.WebCryptoMasterKey` queue blocked through
`defaultWebCryptoMasterKey` → `SecItemCopyMatching` → macOS Security/keychain IPC.
The first attempted sample was too late (the diagnostic had already closed its
browser); it produced no stack. No user data, password or key values were read,
no Keychain access rule was changed, and no encryption/test assertion/timeout
was weakened. The isolated diagnostic's 12-second limit is separate from the
unchanged application test deadlines. Local Keychain consent/access review is
needed before accepting this gate; do not assume the sending Mac's authorization
applies here or that a missing prompt means access is granted.

These measurements precede
any new required-test batch in this checkout. Required workflow and quick selection
remain unchanged; the timeout remains 15 minutes and the hosted target ten minutes.
Current hosted duration and real DynamoDB acceptance remain user-deferred and
unmeasured. No push, deployment, production action or migration was performed.
No new implementation or test-count expansion proceeded past the failed browser
baseline, and no additional task was checked. Re-run the synthetic probe and
actual WebKit/PIN/full gate after the user reviews local OS access; then resume
Foundation T012/T013/T017, leaving T018's external measurements deferred. The
approved combined ceiling remains $6.50/month and the migration remains unrun.

On the user's next continuation request, the same isolated synthetic probe was
repeated before implementation: it again timed out at its 12-second diagnostic
deadline, **12.55 s real / 0.39 s user / 0.10 s sys**. Local OS access is not yet
verified. No broad browser run, application change or task completion was claimed
from this failed repeat; user clarification on the Keychain review is required.

Post-restart continuation: branch/HEAD/feature selection remain unchanged. A new
local edit in `apps/apple/Naaseh.xcodeproj/project.pbxproj` was observed and
preserved without inspection or modification. No leftover Playwright or
SecurityAgent process was present before the new diagnostic. One visible
synthetic browser, started through Playwright's launcher, generated its
non-extractable key but did not finish the IndexedDB commit. Its separate
15-minute consent watchdog exited after **900.26 s real / 0.31 s user / 0.07 s
sys**. This is failed diagnostic evidence, not an application test duration or a
relaxed application timeout. No browser remains running afterward.

An attempted native UI inspection stalled and also launched Playwright.app
directly. The user's reported crash has a matching local crash report at
17:58:05 MST: `DYLD`, `Symbol missing`, `_OBJC_CLASS_$__WKBrowserContext`, with
system WebKit as the expected library and launchd as the parent. The installed
`pw_run.sh` supplies bundled frameworks through `DYLD_FRAMEWORK_PATH` and
`DYLD_LIBRARY_PATH`; a direct app launch bypasses that setup. Do not open
Playwright.app directly for diagnosis or native UI inspection. This launch
failure does not establish a Finance application crash or resolve the separate
key-storage wait. No keychain values or access rules were changed. User
clarification on whether the post-restart prompt appeared and stayed dismissed
is pending before another browser launch. No task checkbox or implementation
behavior was advanced.

The next user-authorized retry used one visible browser through Playwright's
launcher, without native app inspection. The user approved the new Keychain
prompt and confirmed it closed. The synthetic non-extractable key committed
successfully: **33.00 s real / 1.14 s user / 0.26 s sys**, including the manual
consent wait. This is an OS prerequisite check, not a Finance latency result.
All **12 existing Finance PIN browser cases pass** unchanged afterward on
Chromium/WebKit/iPhone/iPad, including true network-offline verification:
**24.89 s real / 17.45 s user / 3.82 s sys**. The full 556-case browser gate is
being repeated before foundation implementation resumes. No new required test
case, application behavior, timeout or task checkbox was changed for this fix.

The post-consent full run completed all **556** selected cases: **535 passed,
20 skipped, 1 failed**, **418.33 s real / 269.37 s user / 68.48 s sys**.
The single failure was iPad `attachment-creation.spec.ts:51`, timing out while
waiting for the item form after clicking Create list. All Finance PIN cases and
the earlier WebKit startup cases pass. The failed trace is preserved separately
from subsequent test output. An initial targeted command used an overly anchored
grep and selected zero cases (4.38 / 5.41 / 0.70 s), not a passing test result.
With the corrected title filter, three unchanged iPad repetitions all pass:
**9.29 / 8.25 / 1.40 s**.

That trace independently exposed a stale shared sync fixture: Journal v7 pull
requests received the ordinary task-lane response and produced a visible schema
error. `mockSuccessfulSync` now distinguishes the Journal request and validates
its response against the shared Journal contract. Ordinary task responses remain
compatible. The cause of the isolated missed Create list click is not established;
the fixture correction is not evidence that it caused or fixed that click.
No click assertion, test timeout, skip, required workflow or browser selection
was changed. Counts remain **1,415 required / 435 files**, **31 quick / 20 files**,
and **556 full / 70 files**. Browser checks are being repeated after this fixture
correction; the failed full run is not accepted as a full-suite PASS.

### Next local foundation batch: canonical query creation

Before adding cases, required baselines remain **1,415 / 435 files**, standalone
test **57.95 s**, full validate **74.01 s**. Plan **five** additional security cases
in the existing canonical-query-authority file: derive current owner/source
vectors without scope hydration; reject unavailable or unauthorized coverage;
reject forged authority/filter scope; select canonical account names and prove
empty selections; and deny missing visit grants or stale security revisions.
Expected resulting count: **1,420 cases / 435 files**. No browser/workflow selection
expansion is planned. Measure the relevant required command after the batch.
This remains Foundation T012/T013 work, not transaction-page pagination,
incremental canonical publication or deferred DynamoDB/hosted acceptance.

Batch result: all five new cases first failed on the missing start method. The
authority/job/status batch then passes **21 cases**. Typecheck, focused lint,
formatting and diff whitespace checks pass. Required validation now passes
**1,420 cases / 435 files**, including lint/typecheck/build, in **68.43 s real /
253.43 s user / 52.30 s sys** (Vitest 55.87 s), versus 1,415/74.01 s before.
No task checkbox is changed by this partial foundation implementation.

After the sync-fixture correction, the unchanged quick selection passes **31/31**
in **30.03 / 40.50 / 8.54 s**, versus 31.73 / 43.64 / 10.10 s before. The complete
browser repeat passes **536 cases / 20 existing skips / zero failures**, out of
556 selected, in **422.34 / 276.32 / 70.25 s**. The previously failing iPad case
passes within this full run. Browser execution preceded the new backend runtime's
required validation; it covers the existing web journeys/fixture change, not a
public HTTP creation route (none was added by batch one). Actual DynamoDB and
hosted PR duration remain deferred and unmeasured.

### Next batch: protected, retry-safe HTTP query creation

Before expanding required tests again, baseline is **1,420 cases / 435 files**,
required validate **68.43 s**, quick **31 cases / 30.03 s**. Plan seven new cases
in existing files: three generated conditional-persistence fixture cases for request
identity/current checkpoint reuse, lost-response/concurrent creation and conflicts;
four HTTP creation cases for authenticated ownership, strict payloads, CSRF/request
identity and locking during creation. Expected resulting required count:
**1,427 / 435 files**. Browser/workflow selections remain unchanged. The new path
must reuse the existing Finance function/owner-only expiring records and preserve
legacy Apple-facing transaction routes. Creation does not complete row pagination
or automatic canonical-write publication.

Batch result: **seven cases added**, no file-count or browser-selection expansion.
The red run reports **6 failed / 12 passed** across the job/HTTP files: the existing
origin/CSRF/request-identity guard already satisfies the new negative case; the
other six fail on missing creation/persistence behavior. After implementation,
the authority/job/HTTP selection passes **28 cases**. Typecheck and focused lint
pass. Required validation initially passes **1,427 / 435 files** in **82.19 s real /
267.25 s user / 59.32 s sys** (Vitest 68.46 s), versus 1,420/68.43 s before.

Final review strengthens the existing request-conflict case with concurrent
different-scope reuse. It first fails with a raw conditional error (**1 failed /
7 passed**, 873 ms). A fresh winning-receipt read now classifies that race as
`finance_query_request_conflict` (409), preserving the first job. The focused
28-case batch passes (891 ms). Because implementation changed, required validation
was repeated: **1,427 passed / 435 files**, **72.13 s real / 251.99 s user /
52.19 s sys** (Vitest 60.54 s), including runtime/typecheck/lint/build. The final
unchanged quick selection passes **31 cases** in **30.97 / 42.29 / 9.09 s**.

The public additive path is `POST /api/v1/finance/queries`, returning 202 with
only the query ID and a protected status Location. Current server-derived authority
and the existing visit guard apply before and after creation; the body cannot
choose an owner, revision vector or worker envelope. Owner-only hashed request
receipts and the initial checkpoint commit in one conditional unit of work and
retain the original 15-minute expiry. Replays return the current checkpoint,
do not extend expiry, and cannot create duplicate jobs after lost responses.
Existing transaction routes/Apple contracts, workflow, quick/full selections,
package manifests/lockfile, spec, plan and task checkboxes remain unchanged.
The separate user Apple project edit and untracked outputs were not modified.

No real DynamoDB, hosted PR, deployment, production change or migration was run.
The combined ceiling stays **$6.50/month**; the existing conditional forecast is
not newly accepted billing/performance evidence. T012/T013 still need stable row
pagination/transaction integration and automatic incremental canonical publication;
T017 review and deferred T018 measurements stay open. No Foundation/story completion
is claimed from these local batches. No extension hooks are configured.

### Row pagination batch — continuation

Before expansion, baseline remains **1,427 tests / 435 files**, required validation
**72.13 / 251.99 / 52.19 s**, quick **31 / 30.97 s**, latest complete browser run
**536 passed / 20 existing skips / 422.34 s**. Plan nine cases in existing files:
five job-page cases (ordered delivery beyond 200, pending/expiry/retry, cursor
binding, revocation, expiry during hydration), one bounded boundary/cursor case,
and three HTTP page cases (owner/pending delivery, invalid input, mid-read lock).
Expected required count: **1,436 / 435 files**. Browser selections stay unchanged.
Continuation work must remain owner-only, revision-bound, bounded per worker step
and capped at the original query expiry. No live deadline/cost PASS or task
completion is inferred from fixtures.

The initial page batch failed **9 cases / 23 passed** (three files, 925 ms),
then passed the focused four-file **42-case** query batch. Strengthened review
first caught a missing indexed upper bound (one failure); precision/version
checks caught **3 failures / 16 passed** (936 ms), and a corrupted continuation
count caught **1 failure / 12 deliberately unselected cases** (288 ms). Corrections
push the boundary into the indexed query, sort actual instants before ID ties,
reject incompatible temporary ordering checkpoints, and enforce continuation
count conservation. No timeout/assertion/skip was weakened. The focused batch
then passed **42 / 42** in 940 ms; standalone type checking passed.

| Command / stage                                        | Actual result                                               | Real / user / sys        |
| ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------ |
| Required validation after pagination                   | PASS: 435 files / 1,436 cases, runtime/typecheck/lint/build | 71.68 / 251.70 / 53.61 s |
| Unchanged quick browser selection                      | PASS: 31 cases (Playwright 29.9 s)                          | 30.33 / 42.16 / 8.96 s   |
| Final required validation after compact retry receipts | PASS: 435 files / 1,436 cases, runtime/typecheck/lint/build | 64.96 / 246.13 / 50.14 s |

The existing persistence retry case was strengthened without another discovered
test: a lost worker response plus competing worker must recover the same current
checkpoint, with a small identifier-only receipt. It first failed **1 / 12
passed** (915 ms), then passed in the focused **42-case / 950 ms** repeat after
removing duplicate checkpoint bodies from step receipts. Final required timing
above includes the correction. The quick run emitted preview proxy connection
refusals for unmocked sync traffic but all 31 assertions passed; no real API was
started. Browser selection, hosted workflow and 15-minute timeout are unchanged.
Latest exhaustive evidence remains **536 passed / 20 existing skips / 422.34 s**;
this backend pagination batch did not rerun the exhaustive matrix. Hosted duration
remains unverified and user-deferred; local duration is not a hosted PASS.

Added an offline command-sizing utility and JSON record, separately linted and
executed after final validation. It injects persistence and indexed query doubles;
it performs no AWS calls. Its current root 100k-row scenario estimates 1,462
transactional checkpoint WRUs versus 2,784 before compact receipts, and 41,124
retained metadata bytes versus 728,044. These representation estimates exclude
canonical/security/condition-check reads, hydration, retries and compute. Current
reference/fact reads and continuation amplification are recorded in the cost
report. They do not prove live capacity, a monthly budget PASS, or either latency
deadline. Workload frequency/depth needs clarification before choosing the next
broad-query optimization. T012/T013/T017/T018 remain unchecked; no dependent
story, migration or production action was performed.

### Broad-query read optimization — November 6

User clarified the planning mix: **one broad all-account/all-history search daily,
usually the first 200 rows**. Retain 10,000 combined monthly page/query actions
and the $6.50 ceiling; this is not permission to raise usage costs. Before this
test expansion, required validation passes **1,436 / 435 files** in **64.96 /
246.13 / 50.14 s**, and unchanged quick passes **31 in 30.33 / 42.16 / 8.96 s**.
Plan six new cases in existing read/publication files: compact aggregate parity,
legacy/mixed fallback, filtered/public full-fact reads, authorization/validation,
same-key source corrections and interrupted publication recovery. Expected
required count **1,442 / 435 files**. No browser or workflow expansion is planned.

Initial new-case run: **6 failed / 12 passed**, 230 ms, two files. The first
implementation repeat passed 40 cases with one failure caused by supplying an
ordinary reference to a text-bitmap test fixture; that fixture was corrected to
exercise an unsupported amount filter on the account probe. The next repeat
passed 58 with one unrelated probabilistic assertion failure: random encrypted
ciphertext happened to contain the three-character substring `t0-`. That invalid
plaintext-leak test was replaced by the encrypted cursor format assertion;
owner/query binding and authenticated tamper rejection remain covered. The
six-file focused repeat passes **59 cases / 873 ms**.

Required validation after compact inputs: **1,442 tests / 435 files PASS**,
runtime/typecheck/lint/build included, **66.41 / 247.76 / 51.65 s**.
Further existing-case assertions first caught off-page hydration (**1 failed /
12 passed / 824 ms**) and repeated reference metadata (**1 failed / 12 passed /
817 ms**). Selected-only hydration then passed **54 / five files / 832 ms**;
packed references passed **54 / five files / 827 ms**. Legacy plain checkpoint
reads and malformed packed indexes were subsequently checked in the existing
case (**13 passed / 818 ms**). Focused lint initially caught one unused packing
discriminator; it was corrected and final required lint passes.

Final required validation after all corrections: **1,442 / 435 files PASS**,
runtime/typecheck/lint/build, **64.72 / 243.29 / 50.38 s**. Test count stays at
1,442; no workflow, quick selection, timeout, browser assertion or skip changed.
The offline query/projection tools were re-run with current code and their JSON
evidence retained. The user-selected 30 broad searches/month fit the common-path
component allowances only under the documented remaining traffic assumptions;
neither actual AWS capacity nor deadline acceptance is claimed. Foundation
T012/T013/T017/T018 remain open.

### Refund-source vector batch — November 6

Before expansion, **1,442 / 435 files** pass required validation in **64.72 /
243.29 / 50.38 s**; unchanged quick **31 pass / 28.75 / 39.88 / 8.40 s**.
Plan four cases in existing coverage/security files: restartable canonical
dependency-account proof, automatic server-side source-vector expansion,
unavailable/forged/oversized dependency rejection, and original-source revocation
during hydration. Expected required count **1,446 / 435 files**. No browser,
workflow or timeout expansion. No live AWS or hosted evidence is inferred.

Initial run: **3 failed / 15 passed / 240 ms**. The revocation negative case
already failed closed; it was strengthened with a successful authorized read
before revocation. First implementation had a block-scoping error caught by
type checking and six failing cases; it was corrected. The final two-file batch
passes **18 / 234 ms**, including combined 100-account bounds and explicit restart
for an older dependency proof. Standalone type checking passes. Required final
validation passes **1,446 / 435 files**, runtime/typecheck/lint/build, **63.79 /
246.15 / 50.80 s**. No task checkbox was advanced.

### Text-index write amplification batch — November 6

Before adding cases: required **1,446 / 435 files / 63.79 s**, quick **31 / 28.75 s**.
Plan three cases in existing publication/security files: shared bitmap bucket
counter transitions, legacy-counter compatibility across chunk boundaries, and
safe estimate selection when a text counter is missing/legacy. Expected required
count **1,449 / 435 files**. Exact account/dimension cardinalities used by coverage
must remain unchanged; text counters are selection hints, never result counts.

Initial three cases fail (**3 failed / 18 passed / 243 ms**). The four-file
publication/authority/coverage repeat passes **34 / 270 ms**, and standalone
typecheck/focused lint pass. Final required validation passes **1,449 / 435 files**,
runtime/typecheck/lint/build, **63.80 / 245.86 / 50.29 s**. No quick/workflow/case
timeout expansion occurred. Fresh offline sizing records 327.38 estimated
transactional WRUs/new source, 95.60/correction, 20,489 strong gets across both
100-source sample batches, and 468,795,458 retained projection bytes. These are
fixture/generated-command estimates with the exclusions in the cost report.

### Independent first-row readiness batch — November 6

Before expansion: required **1,449 / 435 files / 63.80 / 245.86 / 50.29 s**;
latest unchanged quick **31 / 28.75 / 39.88 / 8.40 s**. Plan six cases in existing
coverage/job/authority files: verified ordered compact coverage; exact bounded
preview and retry; ready rows while aggregates continue; source revocation before
preview publication; runtime integration/stable pagination; locked preview
delivery with legacy fallback. Expected **1,455 / 435 files**. Keep per-account
preview work <=1,000 candidates and concurrency <=5. These cases cannot establish
live two-second actual-row or ten-second aggregate p95 acceptance.

Initial preview cases: **6 failed / 32 passed / 810 ms**. Strengthening canonical
index presence also failed an existing negative case before the fix (**2 failed /
4 passed / 206 ms**, including the new ordered-coverage case). Focused implementation
passes **38 / three files / 862 ms**, then **61 / five files / 862 ms**, with
typecheck/lint passing. Required validation first reports **1 failed / 1,454
passed / 435 files**, **55.99 / 230.08 / 46.39 s**, build not reached: the older
canonical reconstruction fixture seeded only a fact/count, omitting its index
reference. It now uses the actual publication service instead of guessed index
state. The six-file repeat passes **65 / 847 ms**.

Final required validation passes **1,455 / 435 files**, runtime/typecheck/lint/build,
**65.45 / 244.87 / 49.89 s**. Unchanged quick: **31 passed**, Playwright 28.0 s,
**28.35 / 39.51 / 8.27 s**. Preview proxy refusals remain diagnostic noise in the
mocked browser environment; no assertion failed. No hosted or actual DynamoDB
deadline is accepted. Current common-path sizing includes the extra bounded
preview reads/checkpoint; the cost report records them separately.

### Durable canonical change journal batch — November 6

Before expansion: required **1,455 / 435 files / 65.45 s**, unchanged quick
**31 / 28.35 s**. Plan six cases in existing conditional UOW/durable-runtime files:
atomic manifest/journal capture, atomic outage recovery, concurrent lost-response
retry, revision/record-limit guards, legacy writer capture/replay, and legacy
outage recovery. Expected **1,461 / 435 files**. No worker dispatch, stream consumer,
AWS resource or migration is enabled by recording the local durable prerequisite.

Initial run: **6 failed / 16 passed / 296 ms**. The implementation passes
**22 / two files / 299 ms**; typecheck caught an exact-optional metadata typing
error, corrected by retaining narrowed versions. The five-file compatibility
repeat passes **35 / 296 ms**, and typecheck/lint pass. Initial required check:
**1,461 / 435 files PASS / 63.71 / 246.21 / 50.72 s**.

An existing oversized-graph case was strengthened to cover the transaction byte
budget with six individually bounded rows. It first failed (**1 failed / six
unselected / 122 ms**), then **22 / two files / 279 ms** pass after enforcing the
same 3.5 MB request headroom as the legacy writer. Final required validation:
**1,461 / 435 files PASS**, runtime/typecheck/lint/build, **62.64 / 238.46 / 46.90 s**.
No new case, workflow expansion or timeout change followed that correction.
The offline projection tool now includes metadata-only journal samples (4/10/26
estimated transactional WRUs for one-scope commits containing 1/10/40 sources).
No live AWS call, automatic consumer, migration or external acceptance occurred.

### Bounded dependency enrollment batch — November 6

Before expansion: required **1,461 / 435 files / 62.64 / 238.46 / 46.90 s**;
latest quick **31 / 28.35 / 39.51 / 8.27 s**. Plan five cases in the existing
canonical coverage file: enrollment before ready, the 80-scope bound with ten
entries/step, interrupted enrollment/restart, malformed directory rejection,
and concurrent/lost-response recovery. Expected **1,466 / 435 files**. Directory
entries are private source/account identifiers only, not an interactive fallback
or automatic full rebuild. Automatic consumption remains a separate unfinished
step; no resource or real AWS action is enabled.

Initial five cases fail (**5 failed / 6 passed / 318 ms**). First implementation
run reports **6 failed / 5 passed / 271 ms**: existing positive cases needed to
wait for the new unavailable enrollment stage, and an outage fixture's copied
getter left its injected failure at the wrong write. Positive cases now assert
unavailable until enrollment completes; the dynamic write counter was preserved
and the actual outage/lost-response injections rerun. The five-file batch passes
**53 / 318 ms**; typecheck/lint pass. Required validation passes **1,466 / 435 files**,
runtime/typecheck/lint/build, **61.21 / 236.40 / 46.34 s**.

The existing fifty-account authority case then catches an unnecessary full PIN
preference read (**1 failed / 15 unselected / 225 ms**). Query validation now
projects only `PK, revision`, preserving absent/malformed distinction. Four-file
authority/coverage/job/canonical repeat: **47 passed / 857 ms**. Discovery remains
1,466; no workflow/browser/timeout expansion or external acceptance is inferred.

Final required repeat after the privacy correction passes **1,466 / 435 files**,
runtime/typecheck/lint/build, **60.70 / 237.94 / 45.50 s**.

### Source dependency index and restart stability batch — November 6

Before expansion: required **1,466 / 435 files / 60.70 s**, latest quick **31 /
28.35 s**. Plan five cases in the existing contribution publication file:
private source-reference generation, correction/unlink neighbor preservation,
unordered DynamoDB map stability, completed-v2 upgrade without double counting,
and interrupted-v2 resume with its original durable ordering. Expected required
count **1,471 / 435 files**. Source references will be internal worker inputs only;
ordinary reads remain account-authorized. No migration, consumer or resource is
enabled by index-format support.

Initial dependency-index cases: **5 failed / 8 passed / 264 ms**. The first
implementation repeat had **1 failed / 19 passed / 258 ms**: an older date-reference
assertion also expected stable global dependency references to disappear. The
assertion now checks date references separately, retaining neighbor/unlink checks.
Focused repeat: **42 passed / five files / 314 ms**; typecheck passes. Required
validation: **1,471 passed / 435 files**, runtime/typecheck/lint/build pass,
**60.39 / 236.60 / 45.46 s** real/user/system.

An existing coverage negative case was then strengthened to reject a completed
dependency publication with a stale fingerprint: **1 failed / 10 unselected /
187 ms** before the binding check. First focused repeat: **1 failed / 41 passed /
309 ms** because the original-source proof fixture hashed canonical envelope
metadata instead of its projected fact; the fixture now hashes the actual fact.
Final focused repeat: **42 passed / five files / 311 ms**. Final required validation
passes **1,471 / 435 files**, runtime/typecheck/lint/build, **59.97 / 235.92 /
45.40 s**. Quick selection stays 31; latest quick remains **28.35 s**. No workflow,
browser matrix or timeout expansion. Hosted duration is still unmeasured/deferred.
T012/T013/T017/T018 remain unchecked; private reverse references do not constitute
an automatic consumer or a completed incremental coverage pipeline.

Offline history sizing now supports 1–240 months, includes monthly summaries and
ordinal counters, and fixes the ongoing write sample to the current month for
comparison. Runs for 1/12/60/120 months complete without AWS calls; retained bytes
are 545,393,156 / 559,285,543 / 628,370,175 / 723,541,786. The previous one-month
representation omitted those small monthly records. Five/ten years exceed the
existing 600 MB incremental allowance; expected history span is pending user
input before further budget-dependent design. This is not a deletion decision.

### Incremental coverage baseline batch — November 6

Before expansion: required **1,471 / 435 files / 59.97 s**, latest quick **31 /
28.35 s**. Plan five cases in existing coverage/publication files for per-source
applied snapshots, page/restart count conservation, malformed saved baselines,
and preserving verified input through corrected/interrupted publications.
Expected required count **1,476 / 435 files**. These private snapshots prepare
incremental coverage; they do not enable a consumer or certify a changed account.

Initial tests: **5 failed / 24 passed / 353 ms**. Implementation focused repeat:
**40 passed / four files / 320 ms**, typecheck passes. Applied snapshots are also
bound to the account's proof generation so an interrupted full verification cannot
be mistaken for the previous ready baseline. Final focused repeat: **40 / 314 ms**.
Required validation passes **1,476 / 435 files**, runtime/typecheck/lint/build,
**69.08 / 253.70 / 52.74 s** real/user/system. Source publication retains the last
verified input and account baseline but keeps coverage unavailable after changes.
No consumer/coverage advancement or external gate is claimed.

The user clarified that this is for one couple with modest transaction volume,
and transactions must not be deleted unless the user deletes them. The 100,000
source scenarios remain stress tests, not a forecast of expected household usage
or a retention/deletion limit. No automatic canonical transaction deletion is added.

### Atomic incremental coverage application batch — November 6

Before expansion: required **1,476 / 435 files / 69.08 s**, latest quick **31 /
28.35 s**. Plan five cases in the existing account coverage file for exact source
replacement/pruning, lost-response replay, proof-generation rejection, concurrent
canonical revision changes, and incomplete-publication/write-failure atomicity.
Expected count **1,481 / 435 files**. The step updates private counts only; it
cannot certify readiness or replace the unfinished journal consumer/finalizer.

Initial stub run: **4 failed / 15 passed / 254 ms** (one negative case already
rejects the stub). First implementation focused repeat: **38 / three files /
298 ms**, typecheck passes. The revision-race case was strengthened to mutate
canonical META immediately before the actual transaction, exercising conditional
conflict rather than only detecting a pre-existing stale read. Final five-file
focused repeat: **52 passed / 365 ms**. Required validation passes **1,481 /
435 files**, runtime/typecheck/lint/build, **65.24 / 245.68 / 49.50 s**. The private
application remains disconnected from HTTP/dispatch and leaves coverage unavailable.

### Bounded publication impact reads — November 6

Before expansion: required **1,481 / 435 files / 65.24 s**, latest quick **31 /
28.35 s**. Plan five cases in a new publication impact-reader file: bounded strong
directory pages/current marker filtering, malformed or unavailable proof rejection,
source-reference identity, cursor isolation, and non-progressing/oversized page
rejection. Expected required **1,486 / 436 files**. These are private candidate
reads, never authorization or evidence that all journal work finished.

Initial tests: **5 failed / 162 ms**. First focused implementation repeat passes
**39 / three files / 262 ms**; typecheck catches an `unknown` metadata revision
comparison, corrected with an explicit numeric check. Cursor validation also now
requires complete typed identifier keys, and an empty dependency proof fails closed.
Final five-file focused repeat: **50 passed / 373 ms**, typecheck/lint pass.
Required validation passes **1,486 / 436 files**, runtime/typecheck/lint/build,
**65.34 / 245.34 / 50.55 s**. Quick matrix/timeouts unchanged; no consumer enabled.

### Bounded contiguous journal replay — November 6

Before expansion: required **1,486 / 436 files / 65.34 s**, latest quick **31 /
28.35 s**. Plan five cases in the existing publication-impact test file for
five-revision replay, missing/out-of-order revisions, corrupt scope/identity/format,
missing/altered manifests, and range validation/unordered DynamoDB map handling.
Expected required count **1,491 / 436 files**. Replay reads remain private and
cannot independently advance account coverage or erase pending work.

Initial stub run: **4 failed / 6 passed / 199 ms** (range rejection already passes).
First focused repeat: **32 / three files / 278 ms**. Typecheck caught Zod optional
fields retaining explicit `undefined` under exact optional property checking;
manifest changes now reconstruct the v1 writer's field order and omit absent
optionals. Final focused repeat: **51 / four files / 268 ms**, typecheck/lint pass.
Required validation passes **1,491 / 436 files**, runtime/typecheck/lint/build,
**63.83 / 245.88 / 50.90 s**. All replay remains private; task completion unchanged.

### Proven new-source coverage enrollment — November 6

Before expansion: required **1,491 / 436 files / 63.83 s**, latest quick **31 /
28.35 s**. Plan five cases in the existing coverage file for an empty-account
creation, missing/stale/incorrect creation evidence, missing old-source baseline,
concurrent source enrollment and lost-response replay. Expected required count
**1,496 / 436 files**. Only a persisted creation manifest/journal newer than the
verified baseline can authorize adding a missing application; coverage stays unavailable.

Initial tests: **4 failed / 20 passed / 370 ms** (the old-source rejection already
fails closed). First focused repeat: **49 / three files / 286 ms**, typecheck passes.
Final five-file focused repeat: **60 passed / 276 ms**, lint passes. Required
validation passes **1,496 / 436 files**, runtime/typecheck/lint/build,
**64.30 / 244.11 / 48.86 s**. No full rebuild, source deletion or readiness shortcut
was added; the consumer/finalizer and external acceptance remain unfinished.

### Account publication window batch — November 6

Before expansion: required **1,496 / 436 files / 64.30 s**, latest quick **31 /
28.35 s**. Plan ten cases in a new account-consumer file for bounded targeted
corrections, reverse-dependency changes, new sources, interrupted publication,
canonical revision restart, journal gaps/recovery, concurrent/lost-response steps,
malformed checkpoint rejection, new-dependency enrollment/pruning and multi-page
account-index traversal. Expected required **1,506 / 437 files**.
The private worker will advance readiness only after all pinned journal work,
source applications, directory enrollment and final conditional checks finish.
No public invocation, automatic dispatch, migration or production write is enabled.

Initial tests: **8 failed / 259 ms**. Initial worker repeat: **8 passed / 278 ms**;
typecheck found an inferred marker-copy type that omitted the removable window ID,
fixed with an explicit stored-marker type. The suite was expanded before required
validation to ten cases; interruption must actually occur, the stale-window case
now changes input after a source was applied, and competition runs during source
publication. Ten-case repeat: **294 ms**. Final focused repeat: **70 / six files /
390 ms**, typecheck/lint pass. Required validation passes **1,506 / 437 files**,
runtime/typecheck/lint/build, **62.92 / 244.96 / 48.17 s**. Automatic dispatch and
remaining lifecycle/infrastructure work are still open; no task checkbox changed.

### Avoid unrelated publication work — November 6

Before expansion: required **1,506 / 437 files / 62.92 s**, latest quick **31 /
28.35 s**. Plan three cases in existing publication-consumer/impact files for
five-revision metadata batching, skipping unrelated transaction changes using
verified original-source counts, and account-bound reverse-reference prefixes.
Expected required **1,509 / 437 files**. This reduces private checkpoint/query
amplification while preserving journal completeness and cursor isolation.

Initial tests: **3 failed / 20 passed / 332 ms**. First three-file repeat:
**47 passed / 309 ms**, typecheck passes. The unrelated-source case also exercises
a linked refund whose original expense changes category; it must still refresh.
Final six-file focused repeat: **73 passed / 408 ms**, typecheck passes. A focused
lint command initially had a mistyped file path (no files matched); the corrected
command passes. Thirty metadata-only revisions now require nine consumer writes,
with five-revision strong journal pages. Per-account reverse prefixes reject
cross-account cursors. Required validation is being repeated.

Required validation passes **1,509 / 437 files**, runtime/typecheck/lint/build,
**62.91 / 243.73 / 47.51 s**. No required browser/workflow change was made.

### Proven new-account initialization — November 6

Before expansion: required **1,509 / 437 files / 62.91 s**, latest quick **31 /
28.35 s**. Plan five cases in the existing account-coverage file for initialization
from durable creation evidence, preserving existing work, invalid/missing creation
or journal evidence, move/nonempty-index rejection, and failure/lost-response/race
atomicity. Expected required **1,514 / 437 files**. Initialization remains private,
leaves coverage unavailable, and never enumerates or deletes canonical transactions.

Initial tests: **3 failed / 26 passed / 257 ms** (two negative cases already
reject the stub). First three-file repeat: **52 passed / 328 ms**, typecheck passes.
An existing initialization case then caught missing negative-refund coverage for
a genuinely new scope (**1 failed / 28 passed / 301 ms**). Both canonical writer
paths now establish that protocol only for a new scope; targeted writes containing
refund relationships do not infer completeness. Existing scopes retain their
preparation requirement. A strengthened legacy case caught metadata being dropped
on its second checkpoint (**1 failed / 14 passed / 336 ms**); committed scope
metadata now updates the request-local cache. Final six-file repeat: **78 passed /
397 ms**, typecheck/lint pass. The metadata batching case now asserts the measured
nine writes exactly. Required validation is being repeated at **1,514 / 437 files**.

Required validation passes **1,514 / 437 files**, runtime/typecheck/lint/build,
**68.18 / 251.18 / 51.59 s**. Existing spec/plan/tasks and the deferred live gates
remain unchanged.

### Durable publication outbox consumer — November 6

Before expansion: required **1,514 / 437 files / 68.18 s**, latest quick **31 /
28.35 s**. Plan ten cases: nine in a new outbox-consumer file for full publication,
metadata-only discovery, bounded directory pages/child waiting, new-account first
transaction, outage/lost-response/race recovery, malformed checkpoints, missing
baseline, archived replay and trusted-repair exclusion; one in the existing impact
file for archived manifest lookup. Expected required **1,524 / 438 files**.
The existing synthetic account fixture is shared for integration/reproduction.
No dispatch, schedule, real AWS write, migration or production change is enabled.

Initial tests: **10 failed / 11 passed / 299 ms**. First implementation repeat:
**6 failed / 56 passed / 379 ms**, all caused by the parent conditioning the
child's marker snapshot after the child legitimately changed it. Marker ownership
now stays with the child; the parent conditions its immutable manifest and cursor.
Final seven-file repeat: **88 passed / 456 ms**, typecheck/lint pass. Required
validation passes **1,524 / 438 files**, runtime/typecheck/lint/build,
**65.80 / 248.52 / 52.47 s**. Completed worker bookkeeping/journals retain replay
for 30 days; pending work never expires. Canonical transactions are not expired.
Automatic consumption is blocked during explicit full verification until the new
generation finishes; it never triggers that verification as a read/write fallback.
Automatic dispatch/recovery infrastructure and the final workload/cost gate remain open.

Unchanged quick-browser repeat: **31 passed**, Playwright **29.5 s**, timed
**29.92 / 40.61 / 8.94 s** real/user/system on Node **24.18.0** / Playwright
**1.64.1**. The offline publication utility completes nine injected-persistence
scenarios (1/10/50-account routing, create/correction/30 metadata commits), with
no AWS calls. Focused utility/fixture lint passes. Its results include actual
generated write estimates and separate condition-check counts, not consumed
capacity or p95. Additional accounts are mocked already current: their child
work is deliberately excluded, making those routing lower bounds.
The previous cost scenario now omits material workflow overhead; household linked
account/new-transaction/correction quantities are pending user input. Keep the
approved ceiling, all canonical transactions, deferred live gates and unrun migration.

### Eight-account household and trusted dispatch — November 6

User answer: **8 linked accounts / 250 transactions total**; interpreted as 250
new transactions/month across all accounts, responding to the monthly question.
Corrections were unspecified; retain the prior 500/month as a conservative planning
assumption, not a user-provided count. The shared fixture now runs all eight actual
synthetic account windows and verifies no automatic full enumeration. Existing
outbox coverage includes this scenario without adding cases. Focused repeat:
**21 / two files / 307 ms**. Required validation remains **1,524 / 438 files**,
runtime/typecheck/lint/build pass, **66.40 / 247.76 / 52.40 s**. The sizing artifact
adds four complete eight-account runs to its nine routing/one-account cases.

Before dispatch expansion: required **1,524 / 438 files / 66.40 s**, latest quick
**31 / 29.92 s**. Plan ten cases in a new dispatch file: HTTP-body isolation,
strict native publication envelope, completion/pending/budget/error worker behavior,
identifier-only events, partial delivery failure, unconfigured local no-op and
after-commit-only dispatch. Expected required **1,534 / 439 files**. Infrastructure
assertions will extend the existing case without expanding quick/workflow selection.
Pinned EventBridge SDK 3.1092.0 supports default-bus delivery without a circular
Finance API/importer environment dependency. All cloud acceptance/deployment remains deferred.

Initial dispatch tests: **7 failed / 3 passed / 342 ms**. First five-file repeat:
**43 passed / 503 ms**, typecheck passes. Extended existing legacy writer and CDK
cases verify after-commit dispatch, default-bus source/type permissions, the native
identifier transformer and no new event bus. Six-file repeat including synth:
**44 passed / 10.15 s**, typecheck passes. The exact SDK install adds one package /
audits 704; npm reports zero vulnerabilities and existing esbuild script-policy
warnings. No script approval or unrelated package upgrade was performed. Local
required validation is being repeated at **1,534 / 439 files**; quick remains 31.

First required run: **1 failed / 1,533 passed / 439 files**, **58.53 / 241.66 /
50.88 s**. Runtime/typecheck/lint pass; build is not reached. The only failure is
the previous exact 26-Lambda-permission assertion: the new internal event rule
adds one grant. The expected count is now 27, with an assertion tying its
`events.amazonaws.com` principal to this rule's exact source ARN. The <=400 total
resource budget remains unchanged. No broader invocation grant is substituted.

Narrowed permission/resource focused repeat: **22 / three files / 10.94 s**.
Final required repeat passes **1,534 / 439 files**, runtime/typecheck/lint/build,
**66.55 / 250.73 / 51.98 s**. No deployment or live invocation was performed.

### Yield between publication batches — November 6

Before expansion: required **1,534 / 439 files / 66.55 s**, latest quick **31 /
29.92 s**. Plan four cases in existing projection/account-consumer files for
one atomic publication batch per step, interrupted/lost-response resume, ordered
older/newer corrections, and bounded default-consumer publication of long text.
Expected required **1,538 / 439 files**. Existing interrupted-v2 ordering coverage
will also exercise bounded upgrade. Public filters, money predicates and quick
selection remain unchanged; no migration is run.

Initial tests: **4 failed / 27 passed / 329 ms**. First four-file repeat:
**47 passed / 350 ms**, typecheck passes. Extending the old map-order case initially
replayed its previous version after resuming the newer input; the source conflict
guard correctly rejected it (**1 failed / 60 passed / 455 ms**). That assertion
now uses the intended newer input. Both unordered-map and historical-v2 resume
cases verify one atomic mutation per bounded step. Final six-file repeat:
**61 passed / 455 ms**, typecheck/lint pass. Required validation is being repeated
at **1,538 / 439 files**. The native default consumer, not only an injected full
publisher, now uses the bounded API; existing explicit full-publication callers
retain their behavior.

Required validation passes **1,538 / 439 files**, runtime/typecheck/lint/build,
**62.24 / 238.45 / 46.24 s**. No selection/workflow/timeout expansion beyond the
four planned cases and no external acceptance is inferred.

### Bounded missed-signal recovery — November 6

Before expansion: required **1,538 / 439 files / 62.24 s**, latest quick **31 /
29.92 s**. Plan seven cases in a new recovery file: empty polls without writes,
five-record cursor/resume/wrap, per-record delivery/corruption isolation, invalid
checkpoint/page rejection, lost-response/competing cursor writes, strict native/
HTTP invocation isolation, and safe stalled-work signals. Expected required
**1,545 / 440 files**. A five-minute rule will reuse the Finance function and
existing failure metrics. Pending and canonical transaction records are never
expired by recovery; no recurring cloud job is created or deployed locally.

Initial tests: **7 failed / 197 ms**. First four-file repeat: **28 passed /
295 ms**, typecheck passes. The cursor retains a monotone revision across wraps
so an old receipt cannot swallow a later cycle; the repeated-wrap assertion covers
this explicitly. Missing/null saved checkpoint bodies fail closed. Empty polls,
including after a wrap, generate no writes.

The first infrastructure repeat fails **1 / 39 passed / six files / 10.10 s**:
the separate recovery rule raises the production template to **401**, above the
unchanged **400** resource guard. Delivery and scheduled recovery now share one
rule/one exact source-ARN permission, using strict source/detail signal variants.
AWS's documented combined EventPattern/ScheduleExpression support was verified;
no resource limit or permission boundary was widened. Native/HTTP/source spoofing
assertions cover the combined transformer. Focused repeat: **31 / five files /
10.31 s**, typecheck passes. Required validation is being repeated at
**1,545 / 440 files**; quick/workflow/timeout selection remains unchanged.

The first required attempt stops at lint in **4.31 / 7.35 / 0.44 s**: a recovery
mock declares an unused identifier parameter. It now uses an explicit typed mock
signature without an unused implementation parameter. Focused lint/typecheck pass;
required validation is repeated. No tests/build ran in the lint-failed attempt.

Final required validation passes **1,545 / 440 files**, including runtime,
typecheck, lint and builds: **62.10 / 238.01 / 46.08 s**. The subsequent direct
SDK bounded-reader and HTTP signal-isolation assertions pass in the existing
six-file focused batch: **59 / 403 ms**; focused lint/formatting pass. Quick
browser validation remains **31 passed**, Playwright **28.2 s**, timed
**28.56 / 38.69 / 7.98 s**, with unchanged selection and exact Playwright 1.64.1.
Offline bounded-publisher sizing repeats all thirteen scenarios; actual eight-account
create/correction work takes 48/47 bounded steps (previous full-publisher harness
44), with the same estimated write units. The household planning assumptions
remain separately identified in the sizing artifact.

### Physical-deletion proof prerequisite — November 6

Before expansion: required **1,545 / 440 files / 62.10 s**, quick **31 / 28.56 s**.
Plan six cases in a new integration file, expected **1,551 / 441 files**: proven
physical removal, missing-version update rejection, scope relocation exclusion,
atomic outage/retry, recreated-source exclusion, and manifest/journal tampering.
These are private proof primitives; projection removal remains a separate next
step. No canonical transaction is expired or deleted by this worker prerequisite.

Deletion-proof first red run fails to collect the missing module (**163 ms**, no
cases executed). The first focused repeat passes **22 / three files / 291 ms**;
the strengthened five-file batch passes **50 / 355 ms**, including repeated
physical deletion through both canonical writers. Typecheck passes. Final
required validation passes **1,551 / 441 files**, runtime/typecheck/lint/build,
**62.90 / 239.22 / 48.33 s**. Stable witness replacement is conditional; moving a
source within a single commit creates no false deletion pointer.

### Bounded projection removal — November 6

Before expansion: required **1,551 / 441 files / 62.90 s**, quick **31 / 28.56 s**.
Plan six added consumer cases, expected **1,557 / 441 files**: exact removal,
long-text bounded cleanup/neighbor preservation, outage/lost-response/race replay,
coalesced earlier correction, recreation during pending cleanup, and a source
created/deleted before its first publication. User-proven physical deletion must
reverse summaries/counts and remove read references without touching canonical
transactions or using a full rebuild.

Removal red run: **6 failed / 13 passed / 382 ms**. Initial three-file repeat
passes **43 / 395 ms**, but typecheck rejects an explicitly undefined optional
ordinal; conditional ordinal construction fixes it without changing the type.
The five-file repeat passes **81 / 421 ms**, typecheck passes. Existing removal
assertions also cover pruning the last refund-original use, and a newly created
source whose first publication was interrupted before canonical deletion. Cleanup
finishes the frozen prior operation, reverses the current projected summary and
subtracts the last applied coverage baseline, then replays later creation normally.
No full enumeration or premature coverage certificate is introduced. Required
validation is being repeated at **1,557 / 441 files**.

Final removal required validation passes **1,557 / 441 files**, including runtime,
typecheck, lint and builds: **61.46 / 237.10 / 46.26 s**. Quick remains 31 cases;
no required workflow/selection/timeout was expanded. T012/T017 are now checked for
local implementation evidence; T013/T018 remain open. Hosted duration and real
DynamoDB p95/capacity remain user-deferred, not accepted from these local tests.

### Completed deletion-proof retention and command calibration — November 6

Required count remains **1,557 / 441 files**, before-command duration **61.46 s**.
The existing outbox retention case adds actual deletion and later-proof ownership
assertions without adding cases or changing selection. Initial red: **1 failed /
8 passed / 304 ms**. Focused repeats: **34 / three files / 386 ms**, then
**34 / 376 ms**. After account cleanup completes, archive/checkpoint/journal and
matching deletion proof share 30-day retention. A newer pending proof is never
expired by an older job. Pending canonical work and transactions never expire.

All fourteen offline publication scenarios converge, including actual eight-account
deletion: **48 bounded steps**, **70 routing/archive + 182 window + 148 small-fixture
source WRUs**, canonical fixture **14**. The representative 100-source utility
then measures actual bounded removal: **39,718 WRUs (397.18/source)** and **22,389
strong gets**, including coverage subtraction; canonical/other worker writes and
read capacity are excluded. Create/correction remain **33,530 / 10,150 WRUs**.
Cost acceptance is still open; monthly corrections/permanent removals are now a
focused user question, distinct from resolved accounts/new-transactions volume.
Required validation is repeated with unchanged count/workflow/timeout.

Final retention required repeat: **1,557 / 441 files PASS**, runtime/typecheck/
lint/build, **62.95 / 239.36 / 47.21 s**. The offline utilities explicitly clear
their child-process publication-bus setting so a developer environment cannot
accidentally dispatch their injected canonical fixture writes. No parent shell,
AWS resource or persistent environment setting is modified.

### Bounded account-scope relocation — November 6 continuation

Before expansion: required **1,557 / 441 files / 62.95 s**, quick **31 / 28.56 s**.
Plan six integration cases in a new file, expected **1,563 / 442 files**: one move,
chained/return moves, coalesced creation/correction on both sides, interrupted/
competing checkpoints, missing-journal repair, and invalid move-version rejection.
No workflow, browser selection, timeout, cloud gate or task acceptance is widened.
The user asked to continue without answering the correction/deletion sizing
follow-up; keep those assumptions unresolved and proceed with independent local work.

Relocation red runs: initial fixture callback mistake (the map index was passed as
a scope) causes **6 failures / 241 ms**; fixed before evaluating implementation.
The actual missing-relocation run fails **6 / 356 ms**. First implemented repeat:
**33 pass / 1 fail / 453 ms**, plus one possibly-undefined proof type error. Corrected
bounded discovery and creation ordering repeat passes **63 / four files / 454 ms**,
typecheck passes. First required validation passes **1,563 / 442 files**, all
stages, **65.45 / 248.00 / 51.37 s**.

Strengthened existing cases expose creation→pending publication→move→deletion:
**1 fail / 5 pass / 433 ms**, then **1 fail / 80 pass / 534 ms**. Shared creation
proof validation replaces duplicated application/deletion rules. Durable deferred
source records prevent moving ahead of a creation from silently certifying a
missing baseline application. The first deferred repeat reports **1 fail / 80 pass /
522 ms**, because final revalidation did not yet allow the deferred-check phase;
that guarded phase is now accepted. The next batch passes **85 / six files /
533 ms**, followed by repair/security assertions **97 / six files / 585 ms**,
typecheck passes. Deferred records are generation-bound, consumed in strong
five-record pages, and counted transactionally with their queue action. Query
creation rejects a ready marker with deferred work; explicit full canonical
verification preserves the count until retired-generation claims are cleared.
No initial or routine canonical full scan was added to automatic publication.

Final required repeat passes **1,563 / 442 files**, runtime/typecheck/lint/build,
**65.87 / 248.05 / 50.57 s**. Existing quick selection remains 31 and is repeated
unchanged. All 15 offline publication scenarios converge; the added complete
8-account scope move takes **98 bounded steps**, **80 routing/archive + 506
window + 12 source-application WRUs**, plus **34 canonical fixture WRUs**. Usual
create/correction/metadata workflow estimates are unchanged. No source financial
publication is necessary when only the account's scope changes.

The user supplied **100 corrections / zero permanent deletions monthly**, and
**five years initial history**. Eight accounts/250 new monthly imply about 15,000
historical transactions for sizing. The 8-account/60-month/15k generated snapshot
estimates **127,616,386 bytes** of logical projection rows. Its 100-source current-
month calibration is **269.24 create / 85.98 correct / 316 remove WRUs per source**;
source removal includes coverage subtraction. Keep the prior 50-account 335.3/
101.5 calibration conservatively for the ongoing write forecast: **347,815**
incremental WRUs including reserves, **152,185** remaining of 500,000. Actual
initial import versus existing canonical backfill depends on the now-pending
input-source question. Setup cost is not accepted and migration remains unrun.

Latest unchanged quick browser repeat passes **31 / Playwright 28.2 s**, timed
**28.62 / 39.81 / 8.24 s** real/user/sys. Sizing-tool
lint and workspace typecheck pass after the household/move CLI additions. The
fifteen generated scenarios run with injected persistence and disabled child-process
publication dispatch; no AWS calls or migration were made. Required/local gates
are passing, while the initial-history source question and external/cost acceptance
remain open; no task checkbox is changed for those pending gates.

### Proven empty-account retirement — November 6 continuation

Before expansion: required **1,563 / 442 files / 65.87 s**, quick **31 / 28.62 s**.
Plan seven retirement integration cases in a new file, expected **1,570 / 443 files**:
empty retirement/future directory reads, coalesced transaction cleanup, interrupted/
competing retries, prior scope movement, recreation safety/bootstrap, missing proof
rejection, and birth/deletion before bootstrap. Preserve canonical data and fail
closed if source coverage is unresolved. The initial-history input source is still
unresolved; the user's continuation authorizes independent local foundation work.

Retirement first red run cannot collect the missing worker module (**198 ms**, no
cases executed). The first implementation repeats **35 / five files / 448 ms**,
typecheck passes. Both canonical writers now journal physical account-removal
witnesses; moves produce no false account deletion. A durable identifier-only
retirement certificate lets old pending jobs and stale directory entries resolve
after completed deletion proof/archive retention expires. A recreated canonical
account defeats retirement and requires a genuine creation journal to bootstrap.
Birth→deletion before bootstrap requires the still-pending birth manifest rather
than assuming a missing baseline means empty. Required validation is measured at
**1,570 / 443 files** before further lifecycle changes.

The first retirement required checkpoint passes **1,570 / 443 files**, all stages,
**62.11 / 239.79 / 48.10 s**. Before one additional required case, record expected
**1,571 / 443 files**: first-source publication interrupted by transaction/account
removal before coverage enrollment. Current-birth lineage also gains existing-case
replay assertions, without another case. This avoids treating an old creation job
as authority for a later recreated account.

The additional first-source retirement case first fails **1 / 7 passed / 323 ms**.
Validated creation ID/generation now survives interrupted source publication and
is cleared only when coverage applies. Cleanup after account removal rechecks the
source creation/deletion and account retirement evidence in its atomic transaction;
stale-generation creation proof is explicitly rejected. The seven-file lifecycle
batch passes **104 / 643 ms**, typecheck passes. Stronger legacy-writer birth/death,
recreation, and hashed-row checks pass **70 / seven files / 612 ms**, typecheck
passes. New source publication records private current-birth metadata; it does not
add fields to Apple/public account or transaction payloads.

Final required repeat passes **1,571 / 443 files**, all stages,
**61.46 / 239.96 / 47.18 s**. Audit assertions for hashed legacy recreation and an
older interrupted correction before account removal pass **29 / three files /
323 ms**, focused lint/formatting pass. A final retirement-certificate format check
rejects overflow before writing. T013 is checked for local implementation evidence;
T018 remains deferred/unaccepted. Tasks now **22/159 checked**.

Final foundation repeat after the retirement audit passes **1,571 / 443 files**,
runtime/typecheck/lint/build, **62.81 / 241.08 / 47.68 s**. Before strengthening
existing PIN browser assertions, repeat timed quick and the existing twelve PIN
cases. Planned counts remain **31 quick / 556 full / 12 PIN / 1,571 required**;
no workflow, test selection, skip, timeout or project expansion. The existing
password-enrollment journey will additionally exercise actual encrypted IndexedDB
pending edit/receipt material across forgotten-PIN reset and a later offline visit.

PIN reset before-browser baseline: quick **31 / Playwright 28.2 s**, timed
**28.50 / 37.44 / 7.69 s**; PIN **12 / Playwright 24.1 s**, timed
**24.39 / 16.93 / 3.26 s**. The reset extension passes all twelve unchanged PIN
cases, **28.0 s / 28.32 real / 18.64 user / 3.42 sys**. It seeds synthetic actual
AES-GCM encrypted queued edits/receipt intent/bytes in real IndexedDB using the
non-extractable device key, holds only the Finance push endpoint pending, then
proves unchanged ciphertext and successful decryption after password-based PIN
reset and a new offline visit. No key export, plaintext persistence, weakened
assertion, synthetic offline substitute or timeout increase is used.

The same existing journey then exercises wrong-password disable rejection,
correct-password disable, and password-verified reenable using the retained PIN.
It passes **12 / Playwright 34.5 s**, timed **34.81 / 22.12 / 4.42 s** across all
four projects. These are local fixture/API security journeys, not semantic replay
acceptance or hosted/DynamoDB results. Existing disconnected-origin and true
network-offline controls remain separate and pass. The component suite remains
**20 / 305 ms**, typecheck/focused lint pass. Static mock pending-object assertions
that could not establish durable preservation were replaced by actual browser
storage/key evidence. Counts stay **1,571 required / 31 quick / 556 full / 12 PIN**;
required/quick workflow selection and all timeouts remain unchanged. After-quick
and required repeat are recorded once complete.

After-change quick remains **31 / Playwright 28.8 s**, timed
**29.18 / 37.48 / 7.66 s** (before **28.50 / 37.44 / 7.69 s**). Required repeat
passes **1,571 / 443 files**, runtime/typecheck/lint/build,
**62.13 / 238.61 / 46.16 s**. No required-test discovery expansion or workflow
change occurred. T021/T028/T030 are checked for local test/controller/UI evidence;
T020/T026/T027/T029/T031/T032 remain open, including semantic replay and independent
web Finance delivery. Tasks **25/159**; cloud/hosted/cost acceptance still deferred.

### Password-reset command and canonical-grant boundaries — November 6

Before expansion: required **1,571 / 443 files / 62.13 s**, quick **31 / 29.18 s**.
Replace the one direct epoch-mutation fixture case with two real self/admin reset
service/repository command paths. Expected **1,572 / 443 files**. Verify only
canonical profile/username keys are written, Finance verifier/settings survive,
old connected-session/grants fail and reused recovery credentials remain separate.
These are generated-command plus canonical-guard fixture checks; actual DynamoDB
execution/login and hosted acceptance remain deferred.

Reset command red run reports **1 fail / 14 pass / 262 ms**: the self-reset
service never supplied the account's recorded secret version to recovery-PIN
verification. Auth reset now loads the recorded recovery/password versions and
persists the new password hash with its chosen version. Administrator password
updates preserve a separate recovery-PIN version before advancing the password's
version; the existing recovery hash and Finance PIN/settings remain unchanged.
All additions are private profile metadata; request/response/Apple contracts and
Finance-function secret permissions are unchanged. No real secret was read/rotated.

First focused repeat: **17 / two files / 275 ms**, typecheck passes. Stronger
command/canonical-grant/security-HTTP batch: **22 / three files / 251 ms**, typecheck
passes. It covers recovery after an administrator reset across different versions,
content-free admin output, old-session/grant denial and a fresh session unlocking
with the retained Finance PIN. These fixtures exercise real generated commands
and guard logic; actual DynamoDB execution/login remains user-deferred. Required
repeat is measured at **1,572 / 443 files**; quick remains 31.

The first full reset attempt failed **1 / 1,571 passed / 443 files**, **57.55 s
real / 229.82 s user / 46.16 s sys**: an existing recovery-reset test still supplied
a string where the new private hasher interface returns hash plus version. The
fixture and expected commit metadata were corrected; focused repeat **30 / five
files / 248 ms**. Full repeat then passed **1,572 / 443 files**, all stages,
**62.49 / 238.85 / 47.32 s** real/user/sys. Explicit pre-dispatch checks now also
prove an administrator without a grant and both old reset sessions cannot invoke
the generic Finance replay dispatcher: **22 / four files / 259 ms**. Required
repeat passes **1,572 / 443 files**, **59.25 / 236.97 / 48.86 s**. T020/T031 have
local test/implementation evidence; actual DynamoDB execution remains deferred.

### Local write lifetime — November 6

Before change: required **1,572 / 443 files / 59.25 s**, quick unchanged
**31 / 29.18 s**. Four added repository/controller checks give an expected
**1,576 / 444 files**. Initial red run **four failures / 173 ms** demonstrates
locked hydration, a lock/reunlock during a write, receipt encryption completing
after lock and a supplied-key budget edit crossing visits. First focused repeat
passed **26 / three files / 988 ms**. A stronger transaction-commit-phase variant
then failed **one / 25 passed / 1.02 s** because its fixture incorrectly cleared
the final lock hook while writing a row; correct that fixture and repeat before
acceptance. Real controller signals are exercised with atomic transaction test
doubles; this is not a real IndexedDB transaction-abort browser measurement.
The abort listener remains installed through transaction completion, and receipt,
budget and reusable-item encryption carry their original visit signal into commit.
No device key or existing pending change is removed on lock/reset.

The commit-phase fixture was corrected. The full attempt against the old fixture
reports **one failure / 1,575 passed / 444 files**, **55.19 / 230.82 / 48.49 s**;
no build/acceptance is claimed from it. Corrected focused repeat **26 / three
files / 1.00 s**, then full required PASS **1,576 / 444 files**,
**59.65 / 237.82 / 48.71 s**, runtime/typecheck/lint/build all pass.

An isolated loopback browser probe bundles the actual repository, Dexie database,
access controller and vault; only the synthetic PIN derivation is injected, not
the database/encryption implementation. Chromium and WebKit both pass locked
hydration, transaction rollback during a real IndexedDB write, receipt/budget
encryption completing after lock/reunlock and retention of the original
non-extractable device key/pending edit. Fresh synthetic browser contexts only;
no account data or real key is inspected. Combined **1.32 / 0.63 / 0.27 s**.
Initial restricted attempt could not bind loopback (**EPERM**, **0.18 s**), before
any browser launch; the authorized local repeat above passes. Probe logs are local
and this does not add cases to required/quick/full discovery or establish UI,
semantic replay, actual DynamoDB or hosted acceptance. Browser PIN/quick repeats
are recorded next when completed. T029 remains open for independent delivery.

Final write-lifetime PIN repeat **12 passed / Playwright 34.5 s / 34.84 s real /
21.81 s user / 4.30 s sys**. Quick **31 passed / Playwright 29.1 s / 29.53 s real /
38.50 s user / 7.65 s sys** versus the earlier unchanged **31 / 29.18 s**. No case,
project, timeout, skip or workflow change. Known intercepted-fixture loopback proxy
errors did not produce test failures. Hosted duration remains unmeasured/deferred.

### Encrypted independent delivery checkpoint primitive — November 7

Before adding four checks: **1,576 / 444 files / 59.65 s**; expected after
**1,580 / 444 files**. Quick stays **31**, full **556**. The private owner-bound
Finance cursor is encrypted with the existing device key and independent associated
data. A compare-and-swap check of its exact encrypted predecessor runs inside the
same IndexedDB transaction as protected rows/tombstones and pending-edit checks;
a competing tab or lock aborts the whole commit. Ordinary task continuation is
untouched. An offline-only PIN visit cannot acknowledge connected delivery.
The transport/source authorization and semantic replay portions of T027/T029 remain
unimplemented, so neither task is checked from this primitive.

Initial focused **30 / three files / 1.03 s**. Typecheck then found one explicit
undefined optional predecessor assignment under exact optional typing; corrected
with a conditional property. Strengthened focused repeat **30 / three files /
1.07 s** passes, including stale visit signals, foreign owners, malformed/backward
continuations and offline denial. Required repeat and real-browser checkpoint
probe results follow when completed; do not infer acceptance from fixtures alone.

Full checkpoint required repeat passes **1,580 / 444 files**, all stages,
**66.21 / 256.56 / 55.65 s** real/user/sys. Expanded isolated real-browser probe
passes on both Chromium and WebKit, additionally checking encrypted cursor
round-trip, competing predecessor rejection, actual IndexedDB rollback of rows
and checkpoint together and unchanged ordinary task cursor: **1.37 / 0.73 /
0.31 s** combined. No browser/required workflow selection changes. Task count
remains **27/159**; T027/T029 require the transport/source/replay work and are
not accepted from storage primitives. Existing full-browser release gate remains
separate and no new full-browser PASS is claimed here.

### Empty-start ingestion evidence and duplicate metric — November 7

User confirmed no existing Finance data; all history will be newly imported or
come from SimpleFIN. Source question resolved. New offline 80-source/eight-account
one-row versus twenty-row canonical-commit scenarios both converge with exact
source coverage and no pending outbox. Combined probe **1.17 / 1.35 / 0.03 s**;
generated command artifact and exclusions are recorded in the cost report.
Fixture's default two sources/account is unchanged; zero-start is opt-in only.
Existing publication/relocation/retirement fixtures **42 / four files / 444 ms**,
targeted lint passes. Full required repeat after fixture addition **1,580 / 444
files**, all stages, **59.90 / 236.26 / 49.36 s**. No required cases were added.

A strengthened existing successful importer case initially fails **one / 14
passed / 286 ms** because its completion log's redundant generic operation field
overwrote the specific event name. The event now preserves its completion name,
and the duplicate paid `FinanceImportCompletions` series is removed while retaining
completion logs plus failure/security signals. Focused repeat results and required
repeat follow when verified. No workflow/quick selection, alarm, deployment,
production data or migration changed. Tasks remain **27/159**.

Duplicate-metric focused repeat passes **21 / two files / 291 ms**. Required
repeat passes **1,580 / 444 files**, all stages, **59.32 / 238.30 / 49.11 s**.
No case added and no new task accepted from metric cleanup. The initial ingestion
sensitivity is retained in its own artifact; a second 480-row/two-month/eight-account
cohort is being measured to distinguish monthly index initialization from the
expected roughly 31 rows/account/month density. Both remain local command fixtures.

Dense new-ingestion fixture (`--sources=480 --months=2`) finishes both one-row
and twenty-row commit scenarios, all eight accounts verified at 60 sources each,
no pending outbox. **7.38 / 7.72 / 0.15 s** real/user/sys; no AWS calls. Keep both
sparse and dense artifacts and their exclusions. Estimated writes fall from
174,866 to 151,474 with batching, while indexed query count increases. No setup
cost PASS, migration run, production import or task check is claimed. Optional
sizing flags affect only the offline probe; default/current test fixtures and
required/browser case counts are unchanged. Latest standalone test and full
browser measurements are repeated below as they finish.

Latest sequential browser repeats: quick **31 passed / Playwright 28.0 s /
28.37 s real / 38.25 user / 7.55 sys**. Full **536 passed / 20 existing skips /
556 selected**, **397.27 s real / 254.34 user / 61.81 sys**, no failures. Exact
Playwright 1.64.1; selection/projects/skips/timeouts unchanged. The browser app
bundle includes the completed PIN and encrypted-write changes. These are local
browser fixture gates, not actual hosted/DynamoDB API acceptance.

### Canonical legacy-response revalidation — November 7

Before additions: **1,580 / 444 files / 59.32 s**; add two cases in the durable
runtime suite for expected **1,582 / 444**. Initial red **two failed / 15 passed /
327 ms**: both changed-scope and revoked-membership reads released prepared data.
The legacy handler now confirms active discovered memberships using consistent
canonical membership point reads, checks them again before mutation commit and
before response delivery, and checks loaded scope revisions with consistent META
point reads after commit. Role/session/PIN canonical checks remain in place.
No new whole-scope hydration fallback is introduced; bounded query-job routes keep
their existing independent current-source authorization path.

First repeat **45 / three files / 312 ms**; stronger canonical-membership repeat
**45 / 408 ms**, then stale-discovery versus removed canonical membership
**45 / 380 ms**. Scoped revalidation is point-read-only; an unchanged retry passes
and inaccessible group content is withheld with a generic response. Typecheck/
targeted lint pass. T026/T027 remain open: generic Finance feed source/relationship
reauthorization and delivery/replay are still unfinished. Additional canonical
point reads belong in the existing conditional read allowance, not an assumed
free operation or actual ConsumedCapacity PASS. Required repeat is recorded when
finished. Browser counts remain 31/556; task count remains **27/159**.

The legacy-response full required repeat passes **1,582 / 444 files**, all stages,
**61.65 / 239.65 / 49.46 s** real/user/sys. No task is checked from partial
response revalidation alone.

### Current canonical Finance sync sources and reconciliation provenance — November 7

Before six additions: **1,582 / 444 / 61.65 s**; expected **1,588 / 445 files**.
Initial missing-module red: suite fails, no cases executed, **73 ms**. First
six checks pass **175 ms**. A stronger existing case reproduces a row/META race:
**one failure / five passes / 169 ms**. The source reader now captures META before
canonical row access and rechecks all touched revisions before release, preventing
an old row from being paired with a newer scope revision. Canonical membership
and task visibility are rechecked, old audiences lose moved/private sources,
allocation/budget/account relationships require current source access, and
unsupported/unproven sources fail closed. This is injected canonical persistence,
not actual DynamoDB consistency/latency evidence.

A shared source-check adapter is wired into generic sync. If sources change after
preparation, it withholds Finance and retains the previous Finance cursor while
ordinary tasks/cursor still progress. Its existing lane case now explicitly
verifies that behavior. Canonical session/PIN checks still bracket delivery;
private fields are allowlisted away from legacy/Apple responses and tombstones
carry no financial payload. The independent web transport/replay remains unfinished.

An existing reconciliation-history case red also reproduces old private totals
remaining visible after account reassignment: **one failure / two passes / 162 ms**.
The service retains contributing account IDs beside canonical reconciliation data,
loads them into private request state, and rechecks current access before returning
active or archived history. No evidence is inserted into public DTOs. Missing
historical provenance fails closed rather than inventing an empty trusted history;
the user confirmed there is no existing Finance history to migrate. No provenance
migration was run. Private account IDs are removed from budget-item relationship
views when the account is not visible, without rewriting canonical associations.

Stronger durable fixture initially fails for missing reviewed transactions
(**one / 30 passed / 329 ms**), then its default draft budget prevents reconciliation
(**one / 30 passed / 323 ms**). The fixture now supplies actual contributing
transactions and an active budget. Typecheck also caught comparing a FinancialAccount
status with nonexistent `tombstone`; corrected to current existence/access checks.
Actual generated scope-row commands retain private provenance across fresh repository
loads while public views withhold hidden IDs/history. No assertions were weakened.
Final targeted source/history/lane batch: **31 / five files / 312 ms**. Earlier full
required repeat passed **1,588 / 445**, **60.30 / 239.13 / 48.82 s**. The final
cleanup uses the canonical provenance alone, avoiding a duplicate private feed
witness; required repeat is recorded when completed. T026/T027/T029/T032 and full
US2 acceptance remain open; tasks **27/159**. New canonical checks/witness storage
must be included in capacity accounting; no cost or external gate PASS is inferred.

Final source/lane/canonical-provenance required repeat passes **1,588 / 445 files**,
all stages, **60.65 / 239.93 / 50.49 s** real/user/sys. No task check is added;
web source-aware cache authorization/transport and semantic replay remain open.

### Private scope authorization-change counter — November 7

Before five tests: **1,588 / 445 / 60.65 s**. Expected **1,593 / 446 files**.
Initial missing-module red: suite fails, no executed cases, **75 ms**. Focused
counter + durable runtime **22 / two files / 306 ms**. Physical move pairs are
joined by logical identity; source removal, ownership/permission-defining parent
changes and withdrawals advance both affected scope counters atomically. New
sources and routine amount/date edits do not revoke existing cache authority.
Counters are distinct from user PIN/security/session revisions and never enter
public/Apple DTOs. This is preparation for efficient cache reauthorization; it is
not connected-cache acceptance or another paid background job.

A broader lifecycle run fails **one / 63 passed / 598 ms** because a refactor
accidentally dropped the existing fresh-scope refund-coverage marker. The marker
is restored with explicit empty-scope evidence, counting even private rows omitted
from legacy client hydration. Another strengthened case fails **one / four passed /
172 ms**: metadata-only writes could reset the new counter without changing the
data revision. All canonical META writes now retain the authoritative counter,
including older callers omitting it; callers cannot mint a new counter without
canonical evidence. Existing unrelated metadata is retained.

Corrected lifecycle repeat passes **64 / six files / 557 ms**, including actual
generated legacy-writer move/removal counters and bounded publication/retirement
paths. Typecheck/targeted lint pass. Required repeat and generated-command sizing
refresh are recorded after completion. No required/browser selection or workflow
change; quick **31**, full **556**, task count **27/159**. Real DynamoDB/hosted gates
and migration remain deferred/unrun, and the approved combined ceiling stays $6.50.

Authorization-counter full required repeat passes **1,593 / 446 files**, all
stages, **58.67 / 236.07 / 48.49 s** real/user/sys. Fifteen offline publication
scenarios converge; complete eight-account WRUs remain 142/source create, 56
correction, 148 removal, 258 ordinary workflow, 252 removal workflow, 598 move,
218 single metadata and 2,060 coalesced 30-commit metadata. Probe **0.52 / 0.63 /
0.02 s**. This generated-command fixture excludes newly added legacy HTTP receipt
metadata/ACL reads and does not establish capacity or budget PASS.

### Saved-reply and late task-visibility access — November 7

An existing durable case reproduces a stale account reply after physical removal
although its owner namespace still exists: **one failed / 16 passed / 316 ms**.
New private `requiredAuthorizationRevisions` receipt metadata pins each loaded
scope's post-commit permission counter. Changed/unproven receipts fail with a
safe conflict before replay/domain effects; ordinary data-only edits retain valid
idempotency behavior. The existing group-revocation case now asserts explicit
conflict rather than allowing the missing receipt to reach another operation.
GETs ignore mutation-id headers; public/Apple payloads remain unchanged.

A task-derived response prepared while a different user's task was public could
still be released after it became private: existing case red **one / 16 passed /
314 ms**. Current task access fields are now checked for task-bearing REST and
saved replies, without fetching task private content. The task owner retains valid
access/replay. Provider metadata merely containing `taskId` is not misclassified
as a Naaseh task relationship. Stronger focused repeat **31 / four files / 282 ms**;
required repeat passes **1,593 / 446 files**, all stages,
**60.00 / 239.36 / 49.33 s**. No additional cases were added in this strengthening.

T026 now has local server-gate evidence; tasks **28/159**. T027/T029/T032 remain
open for connected cache/source authorization, transport, semantic replay and full
story acceptance. Actual DynamoDB/hosted/native gates remain deferred. No added
paid metric/resource, production write, push, deployment or migration.

## Before feature 016 test additions — 2026-10-31 (T002)

Environment: Node 24.18.0, macOS arm64, existing lockfile dependencies; checkout
`codex/task-item-creation-uploads` at HEAD
`c58fccb4be365fd0b0533a856fc853fcbdde4cc3`, including its pre-existing local changes.
No test or required workflow/quick configuration was changed before measurement.

| Baseline command                          | Cases / result                                                      |        Wall time | User / system                        |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------: | ------------------------------------ |
| `vitest list --json`                      | 1,175 enumerated cases                                              | Enumeration only | Parameterized executed count differs |
| `/usr/bin/time -p npm run validate`       | PASS; 405 files / 1,267 executed tests, typecheck/lint/build passed |          76.75 s | 258.47 / 63.16 s                     |
| `npm run test:e2e:quick -- --list`        | 31 Chromium cases / 20 files / one project                          | Enumeration only | No suite expansion                   |
| `/usr/bin/time -p npm run test:e2e:quick` | PASS; 31 passed (Playwright 28.3 s)                                 |          28.98 s | 45.43 / 10.78 s                      |

Commands ran sequentially for wall-time measurements; counts/metadata were
collected separately. Browser execution used the existing local preview server
without changing its tests or configuration. Vitest's own duration inside the
full validation command was 63.51 seconds. Existing native changes were present;
these results establish a starting point, not feature-016 acceptance.

## Existing hosted baseline

The connected GitHub tools confirmed successful Validate run **216**, run ID
**40156233875**, for the current committed HEAD. Its job started at
`2026-10-25T02:54:45Z` and completed at `2026-10-25T02:59:06Z`:
**261 seconds (4 minutes 21 seconds)**. GitHub's run timing endpoint reported
**270,000 ms (4 minutes 30 seconds)**, including run overhead.

[Existing hosted Validate run](https://github.com/stevekessler/naaseh/actions/runs/40156233875)

This is an existing committed baseline; it does **not** validate the current
uncommitted changes or feature 016. Current hosted workflow safety timeout is
15 minutes; the target remains ten minutes or less. No merge/deploy was attempted.

## Required after-change evidence

Before each new required-test batch, record expected resulting discovered counts;
after it, record actual discovered/executed counts and the affected required
command duration. Browser changes must use
`/usr/bin/time -p npm run test:e2e:quick`. Preserve representative quick coverage;
keep exhaustive device/browser/failure cases in full/local release gates.

After required-validation changes, confirm the total hosted PR duration including
install/audit/build/browser setup. A successful local run alone is insufficient.
Do not merge an expansion expected to exceed ten minutes without explicit approval
and a documented reason. No feature-016 after-change duration exists yet.

## Foundation batch 1 planned additions — 2026-10-31

Approval received for the $6.50/month combined Finance ceiling. Before adding
required cases, baseline remains 1,175 enumerated / 1,267 executed; validate
76.75 seconds. First Foundation test batch plans 26 additional cases across
spend (8), refunds (7), indexed reads (5), adapter performance (1), migration (3)
and capability compatibility (2): expected 1,201 enumerated / 1,293 executed.
Measure actual counts and required-command duration after this batch. Browser
quick selection is unchanged at 31 cases. Adapter timings alone do not satisfy
the mobile/network production T018 acceptance gate.

### Foundation batch 1 result

PASS: six new files / 26 new cases. Full `/usr/bin/time -p npm run validate`
passed **411 files / 1,293 executed cases**, real **60.07 s**, user 224.92 s,
system 49.37 s (baseline 405 / 1,267, 76.75 s). Initial missing-module/version
failures established red cases; the first full run then caught three new lint
errors, which were corrected before this successful measurement. Existing
schema/version tests were updated for additive v17/v8 without adding cases.
Quick configuration remains unchanged. A new hosted PR run is still required;
no current hosted result or feature acceptance is claimed.

## Foundation batch 2 planned additions

Before expansion, current executed count is 1,293 and measured validate is
60.07 seconds. Plan 16 additional failure-path cases: conditional unit of work
(3), interrupted projections (3), automatic query jobs (3), observability (2),
infrastructure (3), protected pending bytes (2). Expected total: 1,217 enumerated /
1,309 executed. Retain 31 quick Chromium cases; measure after this batch.

### Foundation batch 2 result

PASS: 16 new cases across seven files (conditional writes 3, projection recovery
3, automatic query jobs 3, protected bytes 2, observability 2, infrastructure 1,
HTTP/IAM invocation separation 2). Full `/usr/bin/time -p npm run validate`
passed **418 files / 1,309 tests**, real **61.28 s**, user 235.54 s,
system 50.03 s. Existing 26 Foundation cases were strengthened for interrupted
migration, real signed legacy budget plans and capability gates without adding
cases. Quick selection remains 31. Hosted PR duration remains pending.

The maximum-size receipt test caught and drove a chunked base64 fix in the
shared vault helper. Observability tests caught and drove preservation of trusted
EMF metric descriptors after redacting application context. Infrastructure tests
caught and drove removal of a self-invocation CloudFormation dependency cycle;
account/region and a unique function resource tag now restrict worker invocation.

### Browser regression after Foundation storage/crypto changes

`/usr/bin/time -p npm run test:e2e:quick`: **31 passed**, Playwright 26.0 s;
real **26.43 s**, user 40.38 s, system 8.60 s (baseline 28.98 s).
Vitest enumeration confirms batch 1 **1,201**, batch 2 **1,217** discovered
cases. Required quick/workflow configuration and selection are unchanged.

## Foundation batch 3 planned additions

Before further tests: 1,217 discovered / 1,309 executed; validate 61.28 s,
quick 31 cases / 26.43 s. Plan 12 cases for compact short-text postings,
resumable bounded reads, source/index correction and access safeguards; expected
1,229 discovered / 1,321 executed. The 100k sizing probe found 1,446,358,695
estimated projection bytes in the first representation (4,645,437 references),
so index/cost acceptance remains unresolved while compact postings are evaluated.

## Checkpoint continuation — 2026-10-31: before regression additions

Verified clean checkpoint `4d67637` on `codex/task-item-creation-uploads`, with
the feature pointer resolving to 016. Node 24.22.2, existing installed lockfile
dependencies; no install or lockfile regeneration. Baseline `npm run validate`
failed at lint in 3.97 s (user 6.47, system 0.50): six no-undef errors in generated
`.venv/.../urllib3/.../emscripten_fetch_worker.js`. Typecheck passed; validate did
not reach tests/build. Separate `npm run test` passed 423 files / 1,321 tests in
49.63 s (user 222.47, system 47.86; Vitest 49.29 s). This reconciles the previous
batch-3 plan: its 12 cases are present and pass, although its result was unrecorded.

Next required-test batch adds three projection regression cases: changing a
calendar basis, resuming that change after interruption, and legacy checkpoints
without a recorded basis. Expected resulting executed count: 1,324 in 423 files;
expected discovered count: 1,232 (prior 1,229). Browser selection/workflow stays
unchanged, with 31 quick Chromium cases. Measure required validation after fixes;
current hosted evidence remains unavailable and cannot be replaced by local time.

### Calendar regression batch result / next representation batch

All three new calendar-basis cases failed against the checkpoint (old summary
remained 2,000 rather than zero), then passed after recording prior/current bases
and transition-specific retry receipts. Focused projection/query/authority checks:
4 files / 13 passed. Required validate passed 423 files / 1,324 executed cases,
real 60.15 s, user 233.18 s, system 47.27 s; enumeration is 1,232.

Before the next required batch, the above is the measured baseline. Plan six
cases for three-character bitmap reads, remaining full-text predicates, rejection
of unmigrated long-text rows, shared long-text correction, legacy-index rebuild and interrupted-v1 checkpoint continuation.
Expected after: 1,238 discovered / 1,330 executed / 423 files. No quick or workflow
selection expansion. The offline 100k sizing estimate found 1,639,393,043 bytes,
including 4,467,900 per-transaction references, so cost acceptance remains open.

### Representation batch results and final local verification

Actual enumeration: **1,238**; executed: **1,330 in 423 files** (nine added cases
across the two continuation batches). Four of the first five new text cases
failed before bitmap implementation; the existing fail-closed behavior already
passed the unmigrated-reference negative case. Interrupted-v1 continuation was
then added to verify preserving a saved legacy operation offset. Focused final
calendar/text/recovery checks passed 17 cases in three files. Strengthening the
completed-checkpoint retention assertion failed before removing the old copy and
passed afterward, without adding another case.

| Measurement                               | Result                                                            | Real / user / system         |
| ----------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| Requested baseline validate               | FAIL at generated Python environment lint; no tests/build reached | 3.97 / 6.47 / 0.50 s         |
| Requested baseline standalone test        | PASS, 423 files / 1,321 cases                                     | 49.63 / 222.47 / 47.86 s     |
| Requested full browser baseline           | 522 passed / 20 skipped / 2 failed; four projects, 544 total      | 389.17 / 253.81 / 64.50 s    |
| After calendar batch validate             | PASS, 423 files / 1,324 cases                                     | 60.15 / 233.18 / 47.27 s     |
| After text batch validate                 | PASS, 423 files / 1,330 cases                                     | 55.16 / 233.32 / 49.50 s     |
| Final validate after checkpoint retention | PASS, 423 files / 1,330 cases, typecheck/lint/build               | **56.37 / 233.19 / 49.27 s** |
| Final quick browser check                 | **31 passed**, one Chromium project / 20 files; Playwright 25.7 s | **26.00 / 40.89 / 8.35 s**   |

An initial quick attempt was unable to bind localhost:4173 (EPERM, 2.98 s), so it
ran zero cases. The rerun with local-server permission produced the successful
31-case result above. The full baseline failures were WebKit archive/reporting
bootstrap timeout and unreadable-cache backup comparison; see the validation
report. No failed case was removed, skipped or weakened to get these results.
Required quick selection/workflow and its 15-minute safety timeout are unchanged.
The nine small required cases and measured local validation/quick durations give
no indication the ten-minute expected hosted target is exceeded; this is a
planning assessment, not current hosted acceptance. Exhaustive browser/device
combinations remain in the full release suites.

Read-only GitHub lookup confirms the only branch Validate run is still
[40156233875](https://github.com/stevekessler/naaseh/actions/runs/40156233875),
HEAD `c58fccb4be365fd0b0533a856fc853fcbdde4cc3`, job 02:54:45–02:59:06 UTC
on 2026-10-25 (**261 s**). It does not cover checkpoint `4d67637` or these edits.
A new hosted run was not triggered and remains an unchecked external gate.
No deployment, merge or production change occurred.

## Foundation observability batch — 2026-10-31, before additions

Baseline remains final validate 56.37 s / 423 files / 1,330 executed, 1,238
discovered; quick selection 31 cases / 26.00 s. Plan four required failure-path
cases for actual invariant metric emission, stalled projection detection,
allowlisted error classification without raw errors, and nested revision/calendar
payload redaction. Expected result: 1,242 discovered / 1,334 executed / 423 files.
No quick browser or workflow additions. Reuse existing global Finance metric
series and alarm thresholds, with structured buckets for projection age.

### Observability batch result / query-expiry batch baseline

The four new failure-path cases first failed, then passed with trusted error
categories, real invariant alarm emission, durable stalled-publication age and
whole revision/refund/calendar redaction. Full required validation passed 423
files / 1,334 executed cases in 57.12 s (user 235.41, system 49.36). No paid metric
series or browser/workflow selection changed. T016 local implementation/test
requirements are now met; live operational acceptance remains a release gate.

Before the next batch, that is the measured baseline (1,242 expected discovered).
Plan two cases for a query expiring during hydration or during a worker scan;
expired work must neither deliver exact data nor publish another checkpoint.
Expected after: 1,244 discovered / 1,336 executed / 423 files.

### Query-expiry batch result / capacity audit baseline

Both query expiry races failed first, then passed after checking expiry before
checkpoint publication and after hydration/current-access checks. Required
validate passed **423 files / 1,336 cases**, real **55.81 s**, user 234.27, system
49.51. The previous four-case observability batch passed **1,334** cases in
57.12 s. No quick selection/workflow or public contract changes.

Next audit adds two domain failure cases for existing refund claims whose original
allocation disappeared, or whose currency no longer matches the source. Expected
result: **1,246 discovered / 1,338 executed**, 423 files. Before-command timing is
55.81 s above; no browser changes. Unknown existing claims must block capacity
reallocation until review, not silently appear to free principal.

### Capacity audit and final verification — 2026-11-01

Both new domain cases failed before validation of existing claims against current
original allocation identities/currency, then passed. The added invariant overflow
assertion failed before checked projection sums preserved its integrity category.
Final required validate: **423 files / 1,338 passed**, real **55.89 s**, user 234.65,
system 49.66. Enumeration confirms **1,246**. No quick/browser selection changed;
the most recent quick result remains 31 passed / 26.00 s. Current hosted evidence
is still absent. User explicitly authorized continued local development with
DynamoDB/external acceptance deferred on 2026-11-01.

## US2 server security batch — 2026-11-01, before additions

User authorized continued local development without DynamoDB, with external gates
remaining deferred. Baseline: 423 files / 1,338 executed, 1,246 discovered; required
validate 55.89 s. Plan four strict PIN contract cases and seven service/persistence
security cases (11 total): expected **425 files / 1,349 executed / 1,257 discovered**.
Quick/workflow remains unchanged. New enrollment services will not be exposed as
user-facing functionality until all required Finance entry paths have guards.

### PIN core result / guard batch baseline

PIN contracts and transactional service primitives pass **425 files / 1,349 cases**
in required validate: real **56.33 s**, user 234.84, system 49.62. The initial two
new files failed before implementation. Strengthened existing cases caught a held
lease after a valid but unenrolled requirement change, and missing revocation;
both were fixed. No Finance settings endpoint/UI is exposed yet.

Next batch adds five canonical-session/grant guard cases to the security file;
expected **425 files / 1,354 executed / 1,262 discovered**. Baseline is 56.33 s above.
Quick/workflow stays unchanged; no password-pepper permission is added to Finance.

### Canonical guard result / protected delivery batch baseline

Required validate passed **425 files / 1,354 cases**, real **55.89 s**, user 234.97,
system 49.60. The five new canonical guard cases failed before its implementation,
then passed. Profile projections exclude password/PIN/pepper material; legacy
absent epoch/TFA values retain existing defaults. No endpoint enrollment yet.

Next batch plans two HTTP read-boundary/revocation cases and three independent
sync-lane cases, expected **426 files / 1,359 executed / 1,267 discovered**. Runtime
baseline is 55.89 s above; quick/workflow selection remains unchanged.

### Protected delivery result / browser controller batch baseline

The five HTTP/sync-lane cases failed before implementation, then passed. Required
validate passed **426 files / 1,359 cases** in **70.69 s** (user 310.11, system 60.75).
This includes canonical Finance HTTP checks and the independent Finance pull lane;
no enrollment endpoint is exposed while browser guards remain unfinished.

Plan nine browser-controller lifecycle/offline failure cases in one new file:
expected **427 files / 1,368 executed / 1,276 discovered**. Before measurement is
70.69 s above. Quick selection/workflow unchanged. Cryptographic controller tests
inject a cheap derivation double; they do not claim Argon2/mobile performance.

### Browser controller result / auth HTTP batch baseline

The nine controller cases pass with injected derivation. A full required run reached
427 files / 1,368 cases in 65.98 s (user 294.12, system 58.87), but one concurrently
strengthened attachment test was intentionally red: unknown parent types inherited
list-item authorization. That fallback is now denied and the focused two-case suite
passes. This run is not a passing required-validation result; build was not reached.
The earlier unused-test-parameter lint errors were fixed.

Next batch adds five auth HTTP boundary cases in one file: expected **428 files /
1,373 executed / 1,281 discovered**. Quick/workflow selections remain unchanged.
The HTTP adapter will use canonical cookie authentication, existing CSRF/origin
checks, safe responses and no-store; no settings UI or deployment is enabled here.

### Auth HTTP boundary result

Required validate passed **428 files / 1,373 cases**, real **67.83 s**, user 284.90,
system 56.08. The five HTTP cases failed before their adapter existed. Synthesized
routes for all five methods target the existing auth integration. Finance retains
no password-secret permissions. A prior 66.24 s run failed before build because
creating the new service eagerly touched a partial password mock in the existing
TFA suite (15 cases not collected); lazy initialization fixed that regression,
and the focused TFA/HTTP/infrastructure batch passed 21 cases before this full run.

The existing attachment test now rejects unknown parent types, and the controller
revision test rejects delayed responses that would overwrite newer reset metadata.
Both strengthened assertions failed before their fixes. Counts did not increase.
No deployment, settings UI, workflow or quick selection was added.

### Quick browser remeasurement / browser integration batch baseline

Unchanged quick selection: **31/31 passed**, real **25.67 s**, user 39.56,
system 7.85 (Playwright 25.4 s). Prior measurement was 26.00 s. This measures the
existing journeys, not PIN UI acceptance or a current hosted PR check.

Next batch adds three controller/client delivery cases: expected **428 files /
1,376 executed / 1,284 discovered**. Required baseline 67.83 s; quick baseline
25.67 s / 31 cases. Plan two full-only PIN browser journeys (eight project cases,
full selection 552 vs baseline 544); quick/workflow selection stays at 31. Real
DynamoDB and current hosted checks remain deferred by user direction.

### Browser integration result

Required validate passed **428 files / 1,376 cases**, real **73.04 s**, user 316.42,
system 63.43, after the three new delivery cases and sync replay strengthening.
Quick selection remains **31/31 passed**, real **25.18 s**, user 39.38, system 8.15
(Playwright 24.9 s), versus 25.67 s before integration. No workflow/timeout/quick
selection expansion occurred. Current hosted PR duration remains deferred and
unverified; these local measurements do not replace it.

The final full-only PIN suite contains two tests across four projects (eight
cases), increasing full enumeration from 544 to 552. The four-project development
run passed five and failed three in 25.04 s (user 13.55, system 2.33): enrollment
and direct-link/cancel/relock passed everywhere; Chromium offline verification
passed; WebKit/iPhone/iPad offline worker startup failed. Inline-worker experiments
also failed and were removed. A PWA diagnostic showed that controlled requests
bypassed page-level API mocks and offline reload raised a WebKit internal error;
neither a passing PWA result nor hosted acceptance is claimed. Final browser
regression results are recorded separately when the current run completes.

The initial new browser fixture incorrectly returned an authenticated session
before sign-in (four failures in 64.24 s); it now returns 401 until its explicit
login succeeds. A subsequent Chromium run caught actual offline HTTP requests
without an online grant; the client now keeps such requests local. No failing
baseline or new acceptance assertion was weakened or skipped to claim completion.

### Broader Finance regression and offline diagnostic follow-up

Finance-only regression enumerated **108 cases / 10 files**, passed **105**, failed
**3**, real **84.85 s**, user 53.53, system 12.31. The failures are the new offline
PIN journey in WebKit/iPhone/iPad; the 100 pre-existing Finance project cases passed.
The full-suite baseline failures outside Finance were not rerun in this command.
Vitest enumeration after integration is **1,284**, versus 1,376 executed cases.

The PIN journeys now serve the existing built PWA from an ephemeral loopback
fixture server with the existing CSP and synthetic API (no AWS). This removes
page-level routing interference after a service worker controls the page. Five
of eight still passed; three failed offline in 26.14 s (user 15.09/system 2.87).
The worker remains external and same-origin; no CSP/inline-worker expansion is kept.
Unknown security state no longer presents an enabled PIN prompt before metadata
is ready. A fixture lint issue was fixed before the next required run.

Upstream [Playwright issue 42775](https://github.com/microsoft/playwright/issues/42775)
reports WebKit `setOffline` rejecting even locally produced service-worker
responses; its reproduction separates network-flag emulation from stopping a
synthetic origin. Our offline navigation error matches that reported symptom;
this does not prove every worker failure has the same cause. Keep true-offline
assertions and actual Safari acceptance open; do not upgrade the committed test
runtime or skip failing cases to claim success.

Next add one clearly separate origin-unavailable control across four projects:
full selection **556** (544 baseline + 12 PIN cases); Finance subset **112**.
Quick remains 31; required Vitest remains 428 files / 1,376 executed / 1,284 listed.
Before measurements are 84.85 s / 108 Finance cases and 73.04 s required above.
This control is not a replacement for browser network-offline acceptance.

### Final PIN measurement / additional local-read lifecycle batch

The final twelve PIN project cases passed **9** and failed **3**, real **32.51 s**,
user 19.28/system 3.68. All four enrollment/direct-link cases and all four
origin-unavailable controls pass; Chromium network-offline passes. WebKit-family
network-offline remains a recorded failure and separate acceptance gate.
Unchanged quick: **31/31**, real **26.57 s**, user 39.63/system 8.38, Playwright
26.3 s. The loopback fixture serves the existing built app with the existing CSP;
it is not a replacement app or a DynamoDB/hosted performance environment.

Next batch strengthens remaining CSV-worker and empty-cache entry paths with
three local-read lifecycle cases in the existing controller file: expected
**428 files / 1,379 executed / 1,287 listed**. Before this expansion, the current
required run passes 1,376 tests (full command timing recorded after build finishes).
Quick stays 31, full stays 556; no browser selection expansion for this batch.

### CSV lifecycle result / account coverage gate batch baseline

Required validate passed **428 files / 1,379 cases**, real **73.83 s**, user 297.98,
system 56.86. Quick remained **31/31**, real **25.96 s**, user 39.60/system 8.30.
The three added CSV cases failed before the guarded worker client existed, then
passed: late file reads start no worker, lock suppresses late worker progress/rows,
and completion/cancellation releases the worker. Empty budget-cache reads are also
gated before the query, including callers that already hold a key.

Foundation review found that a single fact publication marked the account ready
without a full canonical coverage proof. Add one missing/partial coverage rejection
case and strengthen publication assertions: expected **428 files / 1,380 executed /
1,288 listed**. Before measurement is 73.83 s. This batch intentionally keeps T013
open for the bounded canonical/refund reconciliation/coordinator; unverified
coverage must fail closed meanwhile. Quick/full selections remain 31/556.

### Coverage gate result / saved-result source authorization batch baseline

Coverage checks passed **428 files / 1,380 cases**. The first required command's
raw wall time was **1,122.18 s** (user 315.06/system 63.07). System power logs show
sleep at **04:04:55 -0700** for **1,049 seconds**, waking at 04:22:24 during that
command (file created 04:04:22, completed 04:23:04). Keep the outlier; subtracting
sleep is not a substitute for a new measurement. The standalone repeat passed in
**72.37 s**, user 306.88/system 62.34. A temporary idle-sleep assertion was used
during the repeat; no persistent power preference changed. Hosted duration remains
unverified, and no merge is authorized.

Sizing was repeated offline: **513,383,799 estimated bytes**, **403.44 / 113.60**
estimated transactional WRUs per new/corrected source, unchanged at the modeled
rounding boundaries. Canonical/refund coverage reconciliation remains unfinished.

Next add two saved-result identity/current-budget-access cases: expected
**428 files / 1,382 executed / 1,290 listed**; baseline 72.37 s above. Quick/full
selections remain 31/556. Status hydration must bind each returned fact to its saved
reference and recheck current original-account/budget access before delivery.

### Saved-result authorization result

Both new cases failed before their fixes, then the focused ten-case runtime/job
batch passed. Strengthening the budget case also caught revocation during the
last dependency read; final snapshot/grant checks now follow that read. Required
validate passed **428 files / 1,382 cases**, real **59.71 s**, user 238.22/system
51.94, with an idle-sleep assertion scoped to the command. No browser selection
changed. This remains local evidence; current hosted/DynamoDB gates are deferred.

### Bounded coverage coordinator batch baseline

Next add four coordinator cases in one new integration file: expected **429 files /
1,386 executed / 1,294 listed**. Baseline required 59.71 s / 1,382 cases. These
verify bounded restartable canonical enumeration, mismatch/stale-source rejection,
empty-scope proof and dependency invalidation. Quick/full selections stay 31/556.
The canonical fact resolver remains a trusted integration dependency; completing
its production wiring/refund graph is still part of T013, not an external gate.

### Coverage coordinator result / canonical resolver batch baseline

Required validation passed **429 files / 1,386 cases** in **54.65 s** (user 227.55,
system 46.37). The coordinator file first failed to import the missing service;
its initial fixture also shadowed its backing map, which was corrected before the
four cases passed. A strengthened existing authority case failed on stale proof
dependencies before runtime dependency validation was added. No foundation task
completion or real DynamoDB/hosted acceptance is implied.

Next add four canonical source-resolver cases in one file: expected **430 files /
1,390 executed / 1,298 listed**, baseline 54.65 s. The resolver must use targeted
canonical sources and shared expense/refund predicates; missing required graph data
cannot become a fabricated zero. Quick/full remain 31/556.

### Refund index absence-proof batch baseline

Canonical reconstruction passed **430 files / 1,390 cases** in **57.66 s** (user
236.94/system 50.08). Its four cases failed before the resolver existed. Canonical
source snapshots contain internal currency metadata absent from the public view;
the internal validator preserves it without changing public/Apple contracts. A
strengthened unlinked-credit check first failed, then required an explicit verified
refund-index stamp instead of treating a missing locator as a known absence.

Next add three bounded refund-index backfill cases in one file: expected
**431 files / 1,393 executed / 1,301 listed**. Strengthened existing legacy-storage
and sync assertions also failed before metadata preservation, server-only row
isolation and the Finance v1 entity allowlist were added. The before baseline is
57.66 s; repeat result for that unchanged-count compatibility batch is recorded
when its build completes. Quick/full remain 31/556.

### Refund index proof result / resumable driver batch baseline

Required validation passed **431 files / 1,393 cases**, real **56.03 s**, user
235.87/system 49.45. The prior unchanged-
count compatibility batch passed 1,390 cases in 55.27 s. Three index-verifier cases
failed before implementation and then passed with the canonical/legacy/sync batch
(23 cases). No new browser selection or AWS execution occurred.

Next add four driver/restart cases in one integration file: expected **432 files /
1,397 executed / 1,305 listed**, baseline 56.03 s. The driver is a trusted, explicit
migration entry point, never an interactive read fallback or automatic production
write. Quick/full remain 31/556. Actual live migration cost and performance remain
unaccepted/deferred.

### Driver result / legacy scope preparation batch baseline

Required validate passed **432 files / 1,397 cases** in **56.27 s** (user 234.24 /
system 48.61). Four driver cases failed before implementation. Strengthened existing
publication/restart cases cover finishing the exact stored input and rebuilding
coverage after an explicit source-revision restart. A stale test resolver initially
returned its old dependency revision after restart; its current-source fixture was
corrected before the batch passed.

Next add four scope-preparation cases in one integration file: expected **433 files /
1,401 executed / 1,309 listed**, baseline 56.27 s. They cover durable bootstrap
before account locators exist, real metadata revision changes between phases,
restart after source change and catalog-only preparation. Quick/full stay 31/556.

### Scope preparation and checkpoint retention result

Scope preparation passed **433 files / 1,401 executed / 1,309 listed** tests,
real **54.23 s**, user 229.05/system 46.25. No required test-count expansion follows
for checkpoint pruning: an existing reversal/idempotence assertion was strengthened,
failed while the duplicate payload remained, and passed after completion removed
it. Interrupted-input recovery remains covered. Repeat required validation passed
**1,401 cases in 53.82 s**, user 229.17/system 46.48. Tool help/rejected preflight,
types/lint and formatting pass. Live DynamoDB and current hosted results remain
deferred; the current source still has internal foundation work as recorded in
tasks.md. No hosted-duration PASS or under-ten-minute acceptance is inferred from
these local measurements.

### Embedded unlock batch baseline

Required baseline **433 files / 1,401 cases in 53.82 s**. Before the UI change,
quick browser validation passed **31 cases in 26.00 s** (user 39.35/system 7.77).
Three new jsdom cases in one file first failed on missing embedded controls and
pending-unlock cancellation: expected **434 files / 1,404 executed / 1,312 listed**.
Quick/full selections remain **31/556**. The focused 18-case browser-controller/UI
batch passes after implementation; a render triggered by grant publication exposed
a form-unmount race, which was corrected before the passing repeat.

The first after-change quick run passed **31 cases in 26.93 s** (user 42.96/system
8.92), while required validation ran concurrently. Treat this as a contention run;
record standalone measurements below before using the result for comparisons.
Current hosted duration remains deferred. No workflow or quick-test expansion.

### Embedded unlock results

Required validation passed **434 files / 1,404 cases**, first real **59.20 s**
(user 241.50/system 49.34) with concurrent quick-browser work. Standalone repeat:
**54.64 s**, user **229.38/system 47.17**. The unchanged standalone quick selection
passed **31 cases in 25.84 s**, user **40.06/system 8.06** (before 26.00 s).
Production-built PIN journeys passed **9 / 12**, real **33.50 s**, user 19.42/system
3.35. The same WebKit/iPhone/iPad true network-offline cases failed; all direct-link,
enrollment/cancel/relock and separate origin-unavailable controls pass. No cases
were skipped or downgraded. Full selection remains **556**; current hosted runtime
and live DynamoDB acceptance remain deferred. Local durations do not establish
the hosted ten-minute gate, and no merge is performed.

### Atomic security snapshot batch baseline

No test-count expansion: **434 files / 1,404 executed / 1,312 listed**, required
baseline **54.64 s**. The existing safe-profile regression was strengthened to
require one three/four-item transaction, redacted projections, hashed grant lookup,
and fail-closed handling of truncated/failed storage responses. It failed before
implementation. The durable runtime fixture was extended to model transaction
reads; the four-file security/runtime/sync/query batch passes **35 cases**.
Quick/full selection stays 31/556. The full browser suite is rerunning separately;
repeat required timing follows after it finishes to avoid contention.

### Full browser repeat after embedded unlock

Full selection **556 cases**: **530 passed, 20 skipped, 6 failed**, real **423.88 s**,
user **260.42/system 62.79**. Three failures are the known WebKit/iPhone/iPad true
network-offline PIN-worker cases. Additional failures: WebKit urgency-filtering
initial page navigation timed out; iPhone nested-subtask initial page navigation
timed out; iPad nested-subtask assertion did not find “Subtask of”. Both baseline
failures (WebKit archive reporting and unreadable-cache backup) pass in this run.
The new failures are recorded, not discarded; isolated repeat follows. This is the
full local release selection, not the required hosted quick check.

Isolated urgency/nested-subtask repeat across WebKit/iPhone/iPad: **6 passed**, real
**12.57 s**, user 10.04/system 2.00. All three unexpected full-run failures passed
without changing tests, waits or application code. They remain full-run failures
with an intermittent-repeat result; the full suite is not declared passing.

### Atomic gate result / queued Finance decryption baseline

Required validation passes **434 files / 1,404 cases in 56.28 s**, user
230.41/system 48.81 after atomic gate changes. Next add two controller/sync privacy
cases to the existing test file: expected **434 files / 1,406 executed / 1,314
listed**, before 56.28 s; latest standalone quick baseline **31 / 25.84 s**.
The new cases failed before the replay-intent gate existed, then the 20-case
controller/embedded batch passed. An initial request-body variable name collided
with the existing response-body variable; typecheck caught it and the request
variable was renamed before validation. No quick/full selection expansion.

The queue now checks Finance access before decrypting an intent and after awaiting
it; offline-only grants cannot authorize connected replay. Ordinary task queues
bypass this Finance-only gate. Finance sync requests use v8 and the protected HTTP
client's memory-only headers, cancellation and late-result checks. The server still
returns safe retry for unimplemented semantic replay, retaining pending intent.
Independent browser delivery cursors and generic conflict-cache classification/
decryption remain T027/T029 work; this change does not claim a complete sync gate.
The preceding full-browser result predates this client queue change.

### Queued Finance decryption result

Required validation passes **434 files / 1,406 cases**, real **55.40 s**, user
**230.47/system 49.03**, versus 1,404 cases/56.28 s before the two-case expansion.
Unchanged quick browser selection passes **31 cases in 25.37 s**, user 39.71/system
8.18, versus 25.84 s before. Types/lint/build are included in required validation;
focused controller/embedded cases pass 20/20. Full selection remains 556; its
latest complete run and isolated-repeat failures remain recorded above. The full
run predates the final queue change, while the quick/controller checks follow it.
No current hosted PR duration, DynamoDB performance/capacity or live migration
acceptance is available. External gates remain deferred at the user's direction.

### Conflict classification batch baseline and corrected browser regression

Before adding three cases: **434 files / 1,406 tests in 55.40 s**; quick **31 /
25.37 s**. Expected after: **434 files / 1,409 executed / 1,317 listed**. The cases
first failed to import the missing access helper. Focused controller/ordinary
conflict/embedded tests pass **33 cases**. New non-indexed `entityType` metadata
classifies conflicts without altering ciphertext or requiring a Dexie version.
Known Finance records are excluded from ordinary review/counts; unclassified legacy
records remain encrypted until a permitted local visit can classify them. Unreadable
legacy formats stay held, not exposed as an unavailable Finance row/count.

The initial quick attempt exposed an application startup regression from passing
the async count reader directly as a live-query callback. Error-boundary diagnostics
reported a Dexie ReadOnlyError in the task snapshot reader. The run was stopped:
**6 failed, 2 interrupted, 23 not run**, real **97.11 s** (user 14.71/system 2.72).
Wrapping the async reader in the same synchronous callback shape as the other App
live queries corrected the reproduced fresh-page error. Fresh Chromium sign-in
renders without console errors after rebuilding. No task migration code, timeout,
assertion or browser selection was changed; final quick and required repeats follow.

The corrected quick selection passed **31 cases / 26.00 s**, user 39.51/system
8.29. Legacy classification writes were then restricted to the explicit permitted
background pass; live-query conflict readers perform no implicit metadata writes.
The controller/ordinary-conflict/embedded batch still passes 33 cases. A final
unchanged-count quick repeat and required 1,409-case measurement follow.

The final read-only-reader quick run passed **31 cases / 25.69 s**, user
39.00/system 8.07. Required validation first stopped at lint on two unused test
parameters (5.20 s), corrected without changing assertions. The next run executed
**1,409 cases: 1,408 passed / 1 failed**, real **51.32 s**, user 220.95/system 47.78.
The existing list repository test inserted an ordinary list-item conflict without
its type marker; the new fail-closed reader held it as an unknown legacy record.
The fixture now declares `completedMutation.entityType`, preserving its original
retention/cleanup assertions. Focused fixture/controller repeat passes 23 cases;
final required repeat follows. Neither failure was hidden with skips or weaker waits.

Browser-tooling direction requested: committed Playwright remains **1.61.1**.
Related [upstream offline-emulation issue 42775](https://github.com/microsoft/playwright/issues/42775)
is closed with a v1.64 fix; [1.64.1 is published](https://github.com/microsoft/playwright/releases/tag/v1.64.1).
This supports an upgrade experiment, not proof that our worker failure is the same
bug. An update would change the committed lockfile, so user direction was requested
before doing it. No dependency or browser-binary update has been applied here.

### Final conflict isolation result

Required validation passes **434 files / 1,409 executed / 1,317 listed**, real
**55.13 s**, user **229.88/system 48.47**, versus 1,406 cases/55.40 s before the
three-case expansion. Types, lint, tests and build all pass. Final unchanged quick
selection: **31 passed / 25.69 s**, user 39.00/system 8.07, versus 25.37 s before.
The failed initial quick/lint/fixture runs and their corrections are preserved
above. No further source change followed these passing checks.

Branch/checkpoint remain `codex/task-item-creation-uploads` / `4d67637`; feature
selection remains `specs/016-finance-experience-expansion`. Apple paths, npm lockfile,
required workflow and quick selection have no diff. No deployment/merge/production
change or real AWS test occurred. Current hosted runtime and DynamoDB gates remain
deferred. Foundation/US2 remain incomplete for the specific internal and acceptance
gaps recorded in tasks.md. Playwright upgrade direction is pending; no dependency
update is assumed from elapsed time.

### Approved Playwright 1.64.1 experiment — 2026-11-01

The user approved updating Playwright and matching browser binaries, including the
committed lockfile. `@playwright/test` is pinned exactly to **1.64.1**; only its
root manifest entry and the three Playwright package entries changed in the lock.
No other dependency version changed. Node remains **24.22.2**. Matching Chromium
and WebKit binaries are installed using the upgraded local CLI.

Before upgrade: required **434 files / 1,409 executed / 1,317 listed**, **55.13 s**;
quick **31 / 25.69 s**; PIN **9 passed / 3 failed**, **33.50 s**. The latest full
556-case run was **530 passed / 20 skipped / 6 failed**, **423.88 s**, and the three
unexpected non-PIN failures passed isolated reruns. The upgrade keeps selections
at **31 quick cases in 20 files / 556 full cases in 70 files**, with no new tests,
workflow change, timeout increase or assertion relaxation. The related upstream
fix is a hypothesis for our offline-worker failures, not an acceptance result;
PIN, required, quick and full repeats follow.

### Playwright 1.64.1 experiment results and isolated diagnostics

Initial PIN repeat selected **12 cases**: **3 Chromium passes / 8 WebKit-family
failures / 1 interrupted**, real **184.70 s**, user 39.63/system 7.50. The run was
stopped after repeated sign-in failures before any WebKit PIN assertion. Existing
controls render, but automation stalls during field actionability/style checks;
the trace does not establish a disappearing field or the offline bug's cause.
No PIN/offline acceptance is inferred from these failures.

A serial diagnostic also failed: **3 passed / 2 failed / 1 interrupted / 6 not
run**, **108.59 s**. A temporary visibility-assertion experiment ended **3 passed /
5 failed / 1 interrupted / 3 not run**, **109.55 s**. A temporary page-activation
experiment ended **2 failed / 1 interrupted**, **81.28 s**. Both helper changes were
removed; the shared helper is back to its pre-upgrade state. No timeout or assertion
was relaxed and no tests were skipped to get a passing result.

Standalone synthetic input/app diagnostics sometimes pass. A six-run serial
comparison passed both original and matched screen settings three times each,
so the apparent screen correlation was not accepted as a cause. An unchanged
WebKit enrollment case with old effective screen settings in a temporary config
still failed (**38.66 s**). The repository browser configs remain unchanged.
The existing service-worker-blocked WebKit authentication file fails **2/2**
(**74.10 s**, user 14.02/system 2.35), including its original login-card CSS check.
Those checks passed in the prior 1.61.1 full run. No production/app change was made
to accommodate this test-tooling experiment, and the root cause remains unproven.

Required validation passed **434 files / 1,409 cases** in **57.08 s** (user 234.08 /
system 49.81) during a browser diagnostic; this contention result is not the final
standalone timing. The unchanged required Chromium selection passes **31 cases in
27.76 s**, user **37.26/system 7.39**, versus **25.69 s** before the upgrade.
A final standalone required repeat follows. The full 556-case suite was not repeated
under 1.64.1 after these systematic WebKit sign-in failures; the prior full result
belongs to 1.61.1 and must not be attributed to the upgrade.

The package/lockfile still contain the approved exact 1.64.1 upgrade. User direction
was requested before restoring 1.61.1 or retaining the broader failing WebKit gate.
All Finance implementation changes remain intact either way. Hosted runtime and
DynamoDB acceptance stay deferred; no deployment, merge or Apple change occurred.

### Final standalone 1.64.1 validation / version decision pending

Required validation passes **434 files / 1,409 executed / 1,317 listed**, real
**54.86 s**, user **228.66/system 48.60** (before upgrade: 55.13 s). Quick remains
**31 passed in 27.76 s** (before: 25.69 s). No tests were added or removed.
Only the root Playwright version pin and its three lockfile package entries changed;
matching browser binaries were installed. All temporary helper/config experiments
were removed; no production source change was retained for this upgrade.

The approved upgrade is present but is **not accepted as a WebKit/PIN gate PASS**:
existing WebKit authentication fails before the PIN flow. We cannot establish
whether its related upstream offline fix resolves our original worker failures.
User direction to restore 1.61.1 or retain the failing 1.64.1 experiment is pending;
elapsed time is not approval to change the explicitly selected version again.
The original Finance implementation remains intact in either case. No native Apple,
workflow/quick selection, deployment, merge, production or AWS change occurred.
Hosted duration, DynamoDB performance and the initial migration cost gap remain
separate unresolved gates.

### Keep 1.64.1: macOS Keychain wait isolated — 2026-11-01

The user directed keeping 1.64.1, fixing the browser gate, then continuing
`speckit-implement` until a human decision is needed. The earlier rollback question
is superseded. Branch/checkpoint/feature selection remain unchanged; checklist
requirements.md remains 16/16, and no extension hooks are configured.

Fresh controlled diagnostics used only temporary test/config files and the existing
built app. Plain HTML input/CSS actions pass. The existing WebKit auth file with
tracing off yields **1 passed / 1 failed**, real **38.91 s**; thus turning off traces
is not a fix. A temporary scale-1/scale-2 matrix yields **2 passed / 2 failed**,
**38.64 s**; a visible-window comparison still fails **2/2**, **74.17 s**. Real app
controls still stall after removing CSS, while the plain form passes: temporary
three-case reduction yields **1 passed / 2 failed**, **35.31 s**. These are diagnosis,
not release acceptance. Repository assertions, timeouts and browser configs were
not changed, and no weaker configuration was retained.

A one-second native content-process sample identifies the blocked path:
`IDBObjectStore::add` → `SerializedScriptValue` →
`SerializeAndWrapCryptoKey` → synchronous browser-process reply wait. A matching
browser UI-process sample shows `org.WebKit.WebCryptoMasterKey` waiting in
`defaultWebCryptoMasterKey` → `SecItemCopyMatching` → macOS Security/keychain APIs.
This is a specific local Keychain-access wait, not evidence of disappearing controls,
a CSS-only cause, a React render loop, or a proven upstream browser regression.
Only call-stack symbols were captured; no passwords or key material were printed.

A plain local page with no Naaseh JavaScript reproduces the hang by generating a
non-extractable AES-GCM key and storing it in IndexedDB. Bounded diagnostic runs
fail after **17.65 s** and **65.64 s** (their temporary 12s/60s diagnostic budgets
include teardown); production test timeouts remain unchanged. Neither app keys nor
pending data were replaced, and encryption was not weakened to bypass the wait.

A visible synthetic key-storage probe is open temporarily for the user to check for
a macOS Keychain prompt. Human direction/OS consent is requested locally; passwords
must be entered only in the macOS dialog. No Keychain ACL was changed or credential
retrieved by the agent. On approval/unlock, repeat the minimal key probe, ordinary
WebKit authentication, all 12 PIN cases, required/quick checks and then the full
selection. Only passing actual gate evidence can complete the corresponding task.
AWS/hosted gates remain deferred, and no deployment, merge or Apple source change
occurred. No new required tests or task checkboxes were added.

### No prompt visible: stale trusted-browser entry verified — 2026-11-02

The user reported no Keychain prompt. The previous visible probe had already
expired at its temporary 10-minute diagnostic limit (605.70 s), so it is not a
passing gate or evidence of consent. A read-only `SecKeychainGetStatus` query
returns success with the default Keychain unlocked/readable/writable. No unlock
or password change is needed based on that metadata.

Public WebKit source identifies its app-specific master-key account as
`com.apple.WebKit.WebCrypto.master+<bundle identifier>`:
[SerializedCryptoKeyWrapCocoa.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/crypto/cocoa/SerializedCryptoKeyWrapCocoa.mm).
The installed test browser identifies itself as `org.webkit.Playwright`.
A narrow metadata-only query for that account returns the existing item labelled
**Playwright WebCrypto Master Key**. No `kSecReturnData` was requested and
authentication UI was suppressed for those metadata queries.

Its export-clear access rule has one trusted-application entry. That entry points
into the removed **webkit-2311** cache, its stored path no longer exists, and it
does not match the installed **webkit-2370** browser. Validation returns
CSSMERR_CSP_VERIFY_FAILED. Only application-path/build and access-control metadata
were inspected, not the master-key value or other Keychain items. No access rule,
key, password or encryption configuration was changed by the agent.

Keychain Access was opened and the current `webkit-2370/Playwright.app` revealed in
Finder. The user was asked to review the specific item's Access Control tab and,
if they approve, add only the updated app while preserving the item and existing
entries. This protected OS consent is the current human-input boundary. A prompt
need not be visible to inspect that specific rule in the app. On confirmation,
verify the metadata/current-binary match, run the minimal CryptoKey persistence
probe and then the unchanged auth/PIN/required/quick/full checks. Do not mark the
gate complete or bypass non-extractability while waiting. Playwright stays 1.64.1;
AWS/hosted gates, migration cost gap and Apple deferral remain unchanged.

### Playwright 1.64.1 Keychain prerequisite resolved; sleep interrupts full gate — 2026-11-03

The user confirmed adding the updated Playwright app in Keychain Access. The
unchanged non-extractable CryptoKey persistence probe passes (11.86 s real,
0.81 s user, 0.17 s sys). All 12 Finance PIN browser cases then pass unchanged on
Chromium, WebKit, iPhone and iPad (23.14 s real, 17.11 s user, 3.13 s sys), including
actual network-offline verification. No assertion, timeout, encryption property,
key item or pending data was weakened/replaced. Playwright remains exactly 1.64.1.
The previously inspected export-clear ACL still showed its old path after the
user's change; that single metadata rule is not a complete effective-access test.
Successful actual CryptoKey storage establishes the resolved local prerequisite.

The first full 556-case run reports 514 passed, 20 skipped and 22 failed
(9621.23 s real, 253.31 s user, 60.40 s sys). All 22 failed cases pass unchanged
on immediate `--last-failed` rerun (26.77 s real, 22.03 s user, 4.75 s sys).
A second complete run reports 514 passed, 20 skipped and 22 failed (9853.83 s real,
253.58 s user, 63.66 s sys), affecting a different selection, including one iPad
PIN origin-unavailable control. Neither full run passes acceptance.

Read-only `pmset -g log` shows repeated Sleep/Maintenance Sleep/DarkWake cycles
through both runs. For example, November 3 at 04:16:20 MST enters sleep for 992 s,
04:33:38 for 689 s, 04:45:20 for 1019 s and 05:03:05 for 933 s. Browser failures
report 8.9–17.0 minutes despite unchanged 30-second test timeouts. `caffeinate -i`
was active but did not prevent these system sleep cycles. These runs cannot
establish browser performance or a reliable regression result. The user has been
asked to keep the Mac awake, powered and lid open for an uninterrupted gate.
No permanent power setting was changed. Hosted and actual DynamoDB gates remain
deferred; local fixture results do not establish either.

Six new bounded query-status HTTP checks bring required executed tests from 1,409
to an expected 1,415 (435 files); quick selection remains 31 cases/20 files and
full selection remains 556 cases/70 files. Before-change standalone required test
measurement remains 54.86 s; quick remains 27.76 s. No workflow/quick expansion was
made. Initial validation on this change failed lint in 5.01 s because generated
Playwright trace resources were scanned. Generated `test-results` and
`playwright-report` directories are now ignored by ESLint. A subsequent 6.12 s
attempt found three unused parameters in the new test doubles; these were fixed
and standalone lint passes. Full required validation is being repeated; current
hosted duration is still unmeasured and no merge is authorized.

The final required `npm run validate` attempt on this change fails during tests:
435 files discovered, 431 passed / 4 failed; 1,400 cases passed, 1 failed and
14 skipped (1,415 total). Wall time is 2003.58 s (307.64 s user, 60.04 s sys),
including system sleep. `infra/test/recovery-stack.test.ts`,
`infra/test/restore-workflow-stack.test.ts` and
`infra/test/urgency-stack-ranking.test.ts` time out in their unchanged 120-second
setup hooks; `tests/performance/urgency-stack-ranking.test.ts` times out at its
unchanged 180-second limit. Build was not reached. Runtime/type checking and lint
pass in this attempt; the six new query HTTP cases pass. This is failed required
validation, not a measured passing after-change duration or a hosted-runtime
result. Repeat required tests, build/validation and quick/full browser gates only
with an awake machine; do not increase timeouts to absorb system suspension.

## Explicit ordinary-sync Finance hold — November 7

Before adding three regression cases the required baseline was 1,593 tests /
446 files / 60.00 s real. Timed quick baseline: 31 passed (Playwright 29.8 s),
30.42 real / 42.41 user / 9.06 sys. Resulting required selection is 1,596 tests /
446 files; quick remains 31 and full remains 556. No workflow/timeout/skip changes.

The three added cases first failed (3 failed / 6 passed / 334 ms): unprotected
Finance was acknowledged despite an explicit hold, the HTTP boundary consulted
an unavailable Finance dependency, and web task pulls still requested legacy
combined delivery. They pass after explicit `deliverFinance: false` web requests,
server Finance hold without its security dependency, and defensive filtering of
unexpected Finance upserts/tombstones before ordinary persistence (9 / 2 files /
290 ms). A typecheck passed. Required validation first stopped at lint in 5.34 /
8.57 / 0.59 s for two unused fixture arguments; corrected typed fetch mock.
The corrected full required command passed 1,596 / 446 in 64.40 / 255.11 / 55.20 s.

Two strengthened existing hold cases then exposed future Finance-type leakage
(2 failed / 3 passed / 252 ms). Classification of the Finance family now withholds
unknown future types as well; mutation support still uses its exact allowlist.
This is incremental T027 evidence, not connected Finance hydration, cached-source
authority, semantic replay or full US2 acceptance. T027/T029/T032 remain open;
28/159 tasks checked. Current-source cache verification is still required before
connecting independent Finance delivery. No user financial data, import or AWS
operation was used, and the migration remains unrun.

The strengthened source/ordinary/web focused group passed **15 cases / 3 files /
250 ms**. Final required repeat with future-type withholding passed **1,596 /
446 files / 60.05 real / 240.18 user / 48.26 sys seconds**, including runtime,
typecheck, lint and all builds. Expected hosted duration remains below ten minutes
on local evidence only; hosted confirmation is deferred and no merge is authorized.

After-change quick: **31 passed / Playwright 27.9 s**, real 28.28 / user 38.97 / sys 7.57 seconds. Before: 30.42 s real. No browser failure, retry, timeout or skip added. Full selection remains 556; last full result is the previously recorded 536 passed / 20 existing skips / 397.27 s before this ordinary-sync-only change. Local quick/required gates pass; no hosted result is claimed.

## Original-visit replay lifetime — November 7

Required before-change baseline: 1,596 cases / 446 files / 60.05 s real. Timed quick
before change: 31 passed, **29.22 real / 39.42 user / 7.85 sys**. Five new cases
bring required selection to **1,601 / 446 files**, with quick 31/full556 unchanged.
All 16 prerequisite checklist items complete; branch and feature pointer verified;
no extension hooks configured. No required workflow/timeout or skip expansion.

Replay now encloses decryption, backlog/client preparation, protected request and
its result handling in the same Finance visit. Its abort signal is forwarded into
the protected request; a later unlock cannot authorize the original attempt.
Acknowledgement/conflict writes use an abortable atomic IndexedDB transaction and
compare the exact pending encrypted mutation before removing it. Conflict output
remains encrypted. A lock, replaced pending intent or failed commit retains the
outbox and receipt bytes; no device key or pending byte cleanup occurs here.
Generic task replay keeps its existing path. Server Finance dispatch remains an
unfinished semantic-replay task, not an acceptance claim.

Initial test run: **2 failed / 30 passed / 320 ms**. Two repository cases correctly
failed on missing atomic replay writer; two new visit/request cases already passed
because the runtime controller callback supplied a signal even before its public
type exposed it. After implementation: **36 / 3 files / 337 ms**. A fifth regression
exercises actual outbox draining with lock/reopen during backlog preparation. It
passes with protection (5 / 1 file / 195 ms); temporarily withholding only the new
Finance replay branch reproduces its failure (1 failed / 4 unselected / 198 ms).
The protected branch was restored immediately; no other WIP was replaced.
Combined focused checks: **37 / 3 files / 294 ms**; initial typecheck passed.

Required validation passes **1,601 / 446 files / 67.52 real / 259.50 user / 55.42
sys seconds**, all runtime/typecheck/lint/build stages. The isolated real browser
probe passes both Chromium and WebKit: atomic conflict rollback, acknowledgement
rollback, fresh encrypted conflict commit, retained non-extractable device key,
and the earlier cursor/write rollback cases. **1.20 real / 0.68 user / 0.22 sys**.
It uses synthetic records, actual WebCrypto/IndexedDB, a test-injected verifier and
an unused worker stub; no OS Keychain material or real Finance data is read.
The loopback probe is separate from required/browser selections. No task marked
complete on this partial replay-lifetime evidence; T027/T029/T032 remain open.

After-change quick gate: **31 passed / 29.43 real / 41.28 user / 8.44 sys seconds**,
versus 29.22 s real before. No new failures, timeouts, retries or skips. Browser
selection and hosted workflow remain unchanged; hosted measurement remains deferred.
No broad repeat of the 556-case full matrix was needed for this narrow change;
the real Chromium/WebKit storage probes supplement the representative quick gate.

## Connected cache-source evidence — November 7

Before-change required baseline: 1,601 / 446 files / 67.52 s real. Six added cases
bring required selection to **1,607 / 447 files** (four proof-service cases and
two actual sync-HTTP boundaries). Browser selection stays quick 31/full556; no
workflow, skip, timeout, infrastructure resource or permission expansion.

The private cache proof uses domain-separated AES-256-GCM under the existing
cursor secret, user-bound AAD, random nonce, padded metadata, strict bounded
claims and fixed 15-minute proof lifetime. It contains permission counters and
canonical group/task authority only, never Finance values or grants. Proof expiry
is not transaction expiry. Verification still requires current session/PIN checks
before/after independent canonical metadata-read rounds. Ordinary content versions
may advance without invalidating rights; permission counters/membership/task
visibility changes invalidate evidence. New-page issuance must retain and verify
all previous dependencies, with bounded failure rather than silently dropping
older dependencies. Scope reads reject null/coerced counters and missing lineage.
Source guards now reject inaccessible locator scopes before fetching their META
or private source bodies. This is not a new administrative read bypass.

Initial proof-service red: missing module, 0 tests / 77 ms. First source/proof
focused: 10 / 2 files / 189 ms. Initial typecheck caught optional groupId exact-
optional mismatch; corrected without weakening claims. Strengthened cumulative
source/lane checks: 15 / 3 files / 245 ms. HTTP opt-in red: 2 failed / 5 passed /
234 ms; after implementation 17 / 3 files / 248 ms, typecheck PASS. Legacy clients
and ordinary task pulls do not opt into this protocol and retain their existing
wire response. Opt-in contract8 pulls add only private `financeCache` evidence;
locked or explicitly held Finance receives no proof, and invalid/expired evidence
withholds Finance/keeps its cursor while ordinary task progress continues.

Web checkpoint storage, source-generation invalidation and transport remain
unfinished; no client claims safety from an unverified proof. T027/T029/T032 stay
unchecked and total remains28/159. No real DynamoDB, hosted or cost acceptance.
The metadata/session/group/task read overhead must be measured/allocated in the
existing $6.50/month budget; these stateless tokens do not add paid rows/metrics.

The opt-in source-proof batch passes full required validation **1,607 / 447 files /
59.66 real / 239.01 user / 49.80 sys seconds**, all stages. No browser behavior was
changed by that server-only batch. Scope proof metadata and private source reads
remain separately budgeted/unaccepted; not live capacity or latency evidence.

## Revoked-scope cache cleanup preserves pending work — November 7

Before adding one required regression: 1,607 / 447 / 59.66 s real. Timed quick
baseline: **31 passed / 28.46 real / 38.75 user / 8.15 sys**. Resulting required
selection **1,608 / 447 files**; quick 31/full556 unchanged. The new case failed
before implementation (1 failed / 10 unselected / 202 ms): scope cache cleanup
deleted the encrypted pending mutation. Cleanup now marks the controller known
stale immediately (including Require PIN off), removes only matching projections
inside its indexed transaction, and waits for security invalidation and cleanup
to settle. It retains outbox, encrypted conflicts, receipt bytes and device key.
This is revocation cleanup, not the separate user-confirmed full sign-out purge.
No server transaction history is removed. Focused checks **45 / 5 files / 332 ms**;
full required **1,608 / 447 / 61.55 real / 241.80 user / 48.96 sys**, all stages PASS.
The source-proof protocol remains opt-in; the web transport/source-generation
checkpoint is still unfinished. No new task checkmarks or full US2 acceptance.

Revoked-scope after-change quick: **31 / Playwright27.8 / 28.18 real / 38.66 user /
7.56 sys s**, before28.46real. Real Chromium/WebKit probe verifies revoked cached
records disappear while matching encrypted pending intent/receipt bytes, unrelated
cache and non-extractable key survive; **1.15 real / 0.64 user / 0.21 sys s**.

## Encrypted cache-proof checkpoint and invalidation — November 7

Two additional cases bring selection to **1,610 / 447 files**, before required
1,608/61.55s and timed quick 31/28.18s. Both new tests fail before implementation
(2 failed / 11 unselected / 178 ms): missing proof persistence and missing reset.
After implementation: focused **46 / 4 files / 319 ms**; full required **1,610 /
447 / 59.26 real / 240.04 user / 48.47 sys**, all stages PASS. Proof/checkpoint is
owner-bound encrypted metadata committed atomically with rows/cursor. Once proof
tracking begins, subsequent acknowledgement requires renewed server evidence;
opaque token syntax is checked locally but is never treated as local authority.
Server verification remains mandatory. Known-invalid delivery can clear all cached
Finance projections plus its independent checkpoint in one transaction, while
retaining encrypted outbox/conflicts/receipt bytes/device key and ordinary cursor.
A storage failure rolls the transaction back and leaves the controller known stale.
Initial bootstrap/source-generation tagging and connected web transport remain
unfinished. No additional tasks checked or whole-story/hosted/cost acceptance.

Proof-checkpoint actual browser probe passes Chromium/WebKit for encrypted proof
round-trip, no acknowledgement without renewed proof, cache reset retaining
pending edits/conflicts/receipt bytes/key and ordinary cursor. **0.84 real / 0.65
user / 0.18 sys s**. After-change quick **31 / 28.00 real / 39.04 user / 7.47 sys s**,
versus28.18real before. Selections unchanged.

## Verified cached reads and cache generations — November 7

Three new cached-read cases bring required selection to **1,613 / 447 files**.
Before-change required1,610/59.26s, timed quick 31/28.00s. Initial red included
missing cache-access module plus the strengthened cache-only HTTP boundary.
Cached Finance repository decrypts, budget reads, search loading and embedded task
links now use a batch lease. On connected reads, current source proof is checked
before decryption and again before returning plaintext. Cache-only HTTP explicitly
withholds Finance records/cursor and does not hydrate source rows; ordinary task
pull remains independent. One batch verifies twice, not twice per record.

Encrypted checkpoints carry a random cache generation, and proven delivery rows
are tagged with it. An old/unproven row or expired lease cannot borrow a new proof.
Unproven legacy cache is discarded before connected bootstrap, retaining encrypted
pending intent. Offline reads require existing trusted checkpoint/generation plus
existing security/offline unlock; they cannot discover remote revocation while
disconnected. Unknown source rights, network/metadata failure, stale grant, failed
checkpoint CAS or detected mid-batch revocation withhold results. Invalidation
clears cached projections/checkpoint, keeps pending work/key/ordinary task cursor.
Pending projections without proven source lineage remain unavailable until their
authorized rebuild/replay; no semantic replay completion is claimed.

Initial focused run: 2 failed / 46 passed / 1.64s. The cache-only HTTP condition
still required a ready delivery lane even when delivery was deliberately held;
corrected to permit authorized cache-only verification. The embedded component's
isolated authorized fixture needed its new batch-gate dependency; it now delegates
to the fixture's access controller (real protocol covered separately). Typecheck
caught an optional cache-generation return field; conditional spread fixed.
Focused corrected **48 / 4 files / 396ms**; required **1,613 / 447 files / 63.02 real /
249.98 user / 53.12 sys s**, all stages PASS. Source-generation mismatch assertion
is included in the subsequent focused repeat. Full browser matrix will be rerun
because this changes three real cached-data entry paths. T027/T029/T032 remain
unchecked pending transport/semantic replay/acceptance; total28/159 unchanged.

Cached-read before/after quick: **31 / 28.58 real / 39.81 user / 8.30 sys s**,
versus28.00real before. First full repeat stopped after **99 passed / 2 failed /
2 interrupted / 5 existing skips / 448 not run (556 selected)**, **81.06 real /
103.48 user / 21.77 sys s**. Both failures were the existing Finance-search fixtures:
they directly seeded cache without source proof/generation. Fixtures now seed
real AES-GCM encrypted checkpoint/generation, mock only the explicit cache-proof
HTTP acceptance, and use an ordinary-user Finance identity. The deliberate orphan
transaction remains a local filtering defense case, not proof of server access.
All **16 Finance-search browser cases pass / 17.62 real / 12.95 user / 2.46 sys s**.
No production gate weakened; no selection, timeout, retry or skip change.

Concurrent-widget assertion red:1 failed/15 unselected/204ms, duplicate checks
(6 total versus4 including the earlier batch). Cached reads now share one
before/after verification per concurrent batch, with the next closed batch queued
after prior checkpoint settlement. Leases expire individually; source revocation
holds all participants, ordinary work stays separate. Focused45/3files/314ms,
typecheckPASS. Required concurrent repeat1,613/447/73.52real/267.27user/60.66sys
was run alongside browser validation, so is not the sequential runtime benchmark.
That required build overwrote test-mode assets used by Vite preview. Resulting
full run is **invalid**:84 passed/6 sign-in failures/2 interrupted/5 existing skips/
459 not run (556 selected),174.11real/97.89user/21.72sys. It was stopped once the
cause was identified; local test-mode login is intentionally absent in production
assets. These failures were not accepted, hidden, skipped or retried as passes.

Cache proof renewal now authenticates/decrypts the prior envelope and verifies the
merged dependencies once in two independent canonical rounds, rather than doing
both a separate old-proof verification and merged verification. Session/PIN checks
still bracket issuance; all prior dependencies/expiry/user binding remain checked.
A strengthened existing case first failed(1 failed/3pass/194ms,4 checks instead2),
then focused27/3files/248ms PASS. Final sequential required validation is **1,613 /
447 files / 64.71 real / 250.40 user / 53.59 sys**, all stagesPASS. Real isolated
Chromium/WebKit WebCrypto/IndexedDB probe confirms two concurrent cached reads
share exactly two server checks, old generation is rejected, Finance cursor does
not advance even if mock server returns a later one, and key/pending data survive
reset/revocation. **1.42real/0.71user/0.30sys**. Full browser gate is rerunning
sequentially with a fresh test-mode build; no concurrent production build allowed.

Clean sequential full browser attempt: **535 passed / 1 failed / 20 existing skips
(556 selected)**, **405.61 real / 267.17 user / 65.22 sys seconds**. The one failure
was iPad `task-sync-recovery` unreadable-cache backup assertion, not a Finance
search/PIN/keychain timeout. Final quick at that point: **31 / 29.95 real /
39.96 user / 8.29 sys s**. Full gate was not accepted on535passes. Focused repeat
reproduced the exact missing-backup assertion **1 failed / 4 passed / 11.07 real /
10.83 user / 1.93 sys** (five iPad runs; no retries/config changes). The fixture
published its server tasks before completing wrong-key cache seeding, allowing
an old-page initial sync to overwrite the intended damaged starting state. It now
seeds with server data withheld, stops that page, publishes the server snapshot,
then starts the recovery visit. Backup/outbox/conflict/cursor/reload assertions are
unchanged. The same five iPad runs pass **5 / 12.03 real / 11.10 user / 1.94 sys**.
The entire existing recovery file is rerunning before full browser repetition;
quick 31/full556 selections remain unchanged. This fixture correction creates no
new required test case, timeout or production behavior change.

All existing task-recovery cases pass after the fixture correction: **12 browser
cases / 15.65 real / 14.77 user / 2.76 sys s**. Typecheck and changed browser-fixture
lint pass. Full556 matrix is repeated sequentially with the same selection,
unchanged backup assertions and no retry/timeout/skip additions. These repetitions
are diagnosis/revalidation of an observed failure, not acceptance from targeted
reruns alone. User's ongoing monthly receipt volume remains pending; initial
transaction-only import and all supplied household volumes remain unchanged.

The next full556 repeat completed **535 passed / 1 failed / 20 existing skips**,
**406.01 real / 261.49 user / 61.82 sys**. All unreadable-cache backup cases passed;
the remaining failure was iPhone empty-cache recovery's list-row visibility.
Its captured page showed the custom recovery fixture had returned task records to
Journal's strict sync request (`version7`, journal change fields/cursor), causing
an unrelated protocol-error banner during navigation. The fixture now explicitly
returns the strict empty Journal envelope and keeps task responses separate, as
the existing common sync fixture already does. No production protocol weakened.
All recovery browser cases pass again **12 / 19.98 real / 15.73 user / 3.00 sys**;
fixture lint passes. Full556 is repeated sequentially; targeted passes do not
replace the unresolved full gate. Original backup/conflict/cursor assertions and
case/skip/timeout/retry selections remain unchanged.

Final sequential full browser gate **PASS: 536 passed / 20 existing skips / 556
selected**, **404.97 real / 260.92 user / 61.91 sys seconds**. Both empty/unreadable
recovery cases pass in all four projects, as do Finance cache/search/PIN cases.
No new skip, retry, timeout, selection or workflow expansion; earlier failures
remain recorded. This is local regression evidence, not hosted/DynamoDB/p95/cost
or whole US2 acceptance. Required final production-code validation remains1,613 /
447files/64.71real, followed by fixture-only typecheck/lint and the full gate.
Final quick timing is being collected sequentially; no concurrent build.

Final sequential quick gate **PASS:31 passed / Playwright28.6s / 29.09 real /
38.95 user / 7.86 sys seconds**. Latest pre-change quick was28.00real; final
selection remains31. Full556/536pass/20existing skips remainsPASS404.97real.
Git diff whitespace check passes, actual branch/pointer unchanged, HEADfdc6505b;
Apple project edit remains1insert/1delete untouched and outputs directory retained.
No hooks configured; no new task checkmarks, cloud/hosted acceptance, migration,
push, merge, deployment or production changes. Pending question: ongoing receipt
uploads/month for household cost sizing; initial import contains no receipts.

## Receipt volume/Standard policy and retained-memory queries — November7

User confirms50receipts/month,approximately2MB each,S3Standard fornow, initial
transaction-only import withzero receipts unchanged. Required case count remained
1,613 when strengthening the existing synthesized infrastructure case to forbid
Media tier transitions/Intelligent-Tiering, with versioning/backup preserved.
Existing resources already comply; no infrastructure mutation needed. Required
validationPASS1,613/447files/**61.79real/241.02user/48.85sys s**. Reproducible offline
receipt model uses exact bytes/binaryS3GB and publicly verified Oregon paid rates;
0.04real/0.04user/0.00sys,CLIinput/60month arithmetic checked, tool lintPASS. No
free-tier savings; separate conservative original/version/warm-backup and download
sensitivities, not billing or T018 acceptance. CurrentS3tag rate verified0.00000065
per tag-month, old0.000001 preserved as historical baseline for delta accounting.

Combined-search memory hits previously reused an index without a new current-
source check. New required UI case first failed(1failed/1pass/1.43s). Queries now
wait for the existing source-proof batch gate, with a short typing debounce and
request identity so stale completion/old hits cannot borrow a newer query.
Ordinary task/list matches remain available; progress/failure is not called a
confirmed empty Finance result. Existing browser case strengthened to revoke
source proof after initial index/result load, keeping selection unchanged.
Focused18cases/2files/728ms,typecheckPASS. Required **1,614/447files/58.93real/
238.36user/47.77sys** PASS, allstages. Before browser change quick baseline remains
31/29.09real; before required addition1,613/61.79real. Browser quick 31/full556,
workflow/timeouts/retries/skips unchanged. Remaining API-derived memory-view
revalidation,new-row delivery and server semantic replay remain open;28/159tasks.
Receipt-view/month count now pending user answer; do not confuse it with the
resolved50uploads/month/2MB/Standard preference or initialzero receipt import.

The strengthened retained-memory revocation case passes on all four browser
projects. Targeted search first returned **12 passed/4 failed/31.75real/17.75user/
3.09sys**: the empty-state fixture lacked any verified empty-cache checkpoint, so
the new UI correctly withheld confirmed-empty content. It now seeds an empty
verified generation with the same synthetic proof route used by the other search
fixtures. Corrected existing search matrix **16passed/21.08real/13.81user/2.42sys**;
all assertions/selections/timeouts/skips remain unchanged. Final changed-file lint
passes. Full556's last passing result (536passed/20existing skips/404.97real) is
**before this retained-memory query change**, not a new full-run claim. This narrow
UI change is covered by the all-project search matrix and current quick gate;
whole US2/full release acceptance remains unfinished. No broad duplicate full run
was substituted for actual targeted evidence. Final quick timing follows.

Final retained-memory query quick gate **PASS:31cases / Playwright28.2s /
28.53real / 39.70user / 7.48sys**, versus29.09real before this UI change. Current
required1614/447files PASS58.93real; focused search16PASS21.08real. Full536pass/
20existing skips/556selected PASS404.97real remains prior to this narrow UI change,
not relabeled as a new full run. Changed-file lint/whitespace checks pass. Apple
project edit remains1insert/1delete untouched; outputs retained. No deploy, cloud
write, migration, push or merge. T018 and US2 checkpoint remain unaccepted/open;
28/159tasks checked. Pending household question is receipt views/month;50uploads/
month at2MB, Standard storage and zero initial receipt imports are resolved.

Receipt-view calculator update (November7): user “twice” interpreted explicitly as
2 total monthly views. Alternative100/month and inherited1000/month are retained.
Node24 calculator smoke run and independent input/byte/horizon checks pass; tool
lint passes. This is a planning-tool/artifact/documentation change, with no app,
API, infrastructure or test-selection change. Required count stays1,614; prior
validation timings retain their original scope and were not rerun or relabeled.
Cost acceptance remains open; no new task checkmarks or cloud/production writes.

Protected budget-edit replay (November 7): baseline required validation 1,614 /
447 files PASS / 58.93 real seconds. Six added cases bring the selection to
1,620 / 448 files. Red evidence: absent adapter module plus two durable replay
failures (17 existing durable cases passed, 387 ms). First focused pass 23 /
2 files / 409 ms; broader boundary checks 45 / 4 files / 363 ms. Required
validation then PASS: 1,620 / 448, 65.29 real / 253.33 user / 54.34 sys seconds.
Final strengthening within an existing durable case covers absent legacy digest
and rejects GET replay opt-in; final focused PASS 45 / 4 files / 384 ms;
typecheck and lint PASS. All timings use Node 24.18.0. No browser selection,
required workflow, timeout, retry or skip changes. Hosted duration remains
unmeasured; local required target remains below ten minutes. Existing frontend
quick 31/full556 evidence keeps its prior scope; API replay is exercised through
real route/repository conditions in local SDK fixtures, not a mocked browser API.

Budget replay bounded-load red: 1 failed / 18 passed / 19 tests / 341 ms,
asserting no history Query. After targeted source loading and missing/foreign
locator assertions, focused 45 / 4 files PASS / 349 ms; typecheck PASS. Required
1,620 / 448 files PASS: 59.89 real / 238.78 user / 48.93 sys. Then cache-only
no-feed red: 1 failed / 6 passed / 7 tests / 281 ms. After removing feed and
membership-discovery reads only for the opted-in cache-only protocol, focused
40 / 5 files PASS / 375 ms; typecheck PASS. Required 1,620 / 448 files PASS:
59.45 real / 239.89 user / 48.81 sys. No browser selections/workflow expansion.
No AWS, hosted, billing or whole-story acceptance is inferred from fixture reads.

Protected incoming delivery (November 7): prior required1,620 /448files /59.45s.
Nine transport cases plus two cache serialization/collision cases give the new
required selection1,631 /449files. Initial red: missing transport module. First
transport/cache/lock focused30 /3files PASS187ms, then serialized variant199ms.
Two added checks initially failed: one new serialization fixture referenced an
undefined proof (fixture corrected), and the collision case demonstrated an
actual overwrite. After collision rejection, an old lock/rollback fixture with
an untyped synthetic row correctly failed earlier at the new collision guard;
its row kind was supplied, retaining all abort/rollback assertions. Final
focused32 /3files PASS194ms. Required PASS1,631 /449files /58.92real /239.72user /
48.43sys; changed-file formatting/lint/typecheck pass.

Real-browser synthetic probe initially rejected an obsolete security revision
(1 after earlier fixture revision2); corrected the synthetic canonical unlock
response/current preference to revision3. Final Chromium+WebKit actual IDB and
non-extractable AES probe all18 flags PASS1.12real/.64user/.21sys. New flags prove
whole incoming-page rollback, encrypted committed generation/cursor independence,
and cross-kind collision preservation; synthetic HTTP responses do not claim
real server authorization or DynamoDB acceptance. Quick selection unchanged31:
PASS27.9s Playwright /28.23real /38.07user /7.60sys, versus28.53real before transport.
Full556 running separately after builds; no concurrent production build.

Final protected delivery full browser gate PASS:536passed /20existing skips /
556selected /404.45real /256.31user /62.32sys, Node24.18.0 /Playwright1.64.1.
This current run supersedes prior-scope browser evidence for current transport
and retained-memory search code. Quick 31 PASS28.23real; required1,631 /449files
PASS58.92real. No retries/timeouts/skips/selections/workflow expansions. No
concurrent production build. Whitespace checks pass; Apple1insert/1delete
untouched and outputs preserved. Hosted/DynamoDB/human/cost gates stay open.

REST snapshot/immutable/bundled proof follow-up:4 REST cases,2 immutable envelope
cases,2 bundle security cases bring required1,631 to1,639, still449files. REST
red3failed/20passed/23tests424ms (one unsupported-route negative already rejected
by the pre-existing route); strengthened code assertions then focused49/4files
PASS370ms. Immutable red2failed/9passed/11cases163ms. Bundle red1failed/5passed/
6cases179ms. Final combined focused47/4files PASS349ms; typecheck PASS. Required
1,639/449files PASS59.45real/238.16user/49.66sys. Earlier full536/20/556404.45real
and quick 3128.23real precede these narrow additions, not relabeled as new runs.
No new workflow/quick selection, timeouts, retries, skips, cloud writes or migration.

Source locator completeness/collision follow-up: shared supported-source mapping
now drives live legacy locator creation and the still-unrun backfill driver.
Strengthened existing task/link atomicity test red1failed/22passed/23tests349ms;
then focused40/4files PASS371ms. One added cross-scope collision test brings
required1,639 to1,640: red1failed/23passed/24tests344ms, then focused41/4files
PASS366ms. Extended deletion/backfill fixture initially failed because its Query
double understood:row but not the existing:prefix alias; corrected that key-prefix
interpretation. Final focused41/4files PASS353ms; typecheck PASS. Required1,640 /
449files PASS59.34real /238.47user /49.96sys. Live source locator puts/deletes now
conditionally match the loaded source location or an absent pointer; new IDs
cannot overwrite another scope, and trusted backfill refuses conflicting pointers.
The backfill test uses injected in-memory SDK rows only; no real migration ran.

Unsupported event hold: two added cases give required1,642/449files. Red2failed/
7passed/9cases263ms. Focused50/4files PASS343ms; typecheck PASS. Required1,642 /
449files PASS59.92real/239.06user/50.56sys. Current real-browser synthetic IDB/AES
probe PASS all19flags in both Chromium/WebKit,1.44real/.67user/.30sys, including
immutable versionless body compatibility, encrypted delivery/cursor atomicity,
collision retention and original pending-byte/key/replay boundaries. No actual
DynamoDB/hosted/billing/migration acceptance; no new skip/retry/timeout selection.

Before transaction API-memory UI integration, current quick 31 PASS27.3sPlaywright/
27.61real/38.14user/7.61sys. Seven snapshot lifecycle cases plus two transaction
component cases bring selection1,642 to1,651 and449 to451files. Missing helper
module red; helper/cache/transport focused36/3files PASS185ms. UI red2failed/
2cases2.38s, then focused38/4files PASS1.35s; typecheck PASS. Required1,651 /
451files PASS60.25real/239.42user/50.40sys. Strengthened lock/label cleanup red
2failed/2cases2.02s; focused38/4files PASS1.50s; required1,651 /451files PASS
60.10real/238.20user/49.45sys. Real Chromium/WebKit snapshot-memory+prior storage
probe20flags PASS1.47real/.67user/.31sys.

Affected16-case browser run:12passed/4failed/73.28real/27.03user/5.35sys; all four
Finance quick variants timed out after pending offline CSV projection bootstrap.
One regression gives1,652cases/451files: red1failed/18passed/19cases236ms. The
readonly transaction fixture initially discarded its callback return value,
causing the unrelated unproven-cache test to fail (1failed/38passed/39cases1.66s);
corrected the double to preserve Dexie results. Final focused39/4files PASS1.51s.
Required1,652/451files PASS60.70real/239.68user/50.31sys. Shared bootstrap excludes
pending entity IDs without tagging or decrypting them as verified server rows.
No required/quick/full selections, retries, timeouts or skips were changed.

Final API-memory/pending bootstrap browser gates: affected16cases PASS18.5sPW/
18.83real/16.48user/3.63sys, after preserving pending CSV rows during classification.
Current broad quick 31PASS29.2sPW/29.65real/38.36user/7.78sys, versus27.61real
before transaction memory integration. Real IDB/AES Chromium+WebKit probe all21
flags PASS0.93real/.64user/.20sys. New flag proves actual queueEncryptedCsvChunks
row/outbox bytes unchanged through empty-server-cache bootstrap and rejects the
untagged pending row as server cache; prior flag proves API memory discarded by
normal Require-PIN-off lock and replaced only through a fresh authorized load.
Last full536pass/20existing skips/556selected404.45real is before transaction
API-memory integration, retained at that scope. Required1,652/451files PASS60.70real.
No new selections/retries/timeouts/skips/workflow expansion or actual migration.

Manual account parent feed: one new actual-route/storage integration case gives
1,653/451files. Red1failed/24passed/25cases412ms; focused44/4files PASS366ms;
required1,653/451files PASS61.16real/239.05user/49.36sys. Source dates unchanged;
feed timestamps current, parent+opening balance atomic and idempotent. Snapshot
disposal while reader callback waits: existing case strengthened, red1failed/
6passed/7cases172ms; focused39/4files PASS1.50s; typecheck PASS. Final required
1,653/451files PASS59.52real/239.02user/49.16sys. No browser selections/workflow
changes; last16/31/full matrix timings retain their earlier scopes.

Import ID/response compatibility: strengthened existing opening-balance and
100-row CSV cases red2failed/23passed/25cases438ms. New ULIDs alone exposed the
response schema's omitted existing domain fields (1failed/30passed/31cases358ms);
explicit optional source.currency/effective/status/provider identity fields now
validate actual DTOs while retaining strictness/older shapes. Focused27/2files
PASS336ms; interrupted CSV preserves20stored IDs and resumes100including two
identical-looking rows. One legacy CSV transport case brings1,653 to1,654.

One stale-owner HTTP integration case brings1,654 to1,655, still451files. Owner
expectation red2failed/46passed/48cases385ms. Initial partial module mocks omitted
the new pure owner assertion, giving3failed/54passed/57cases386ms; retained the
real module exports while mocking only the intended gate. Management/mismatched
refresh strengthening red2failed/10passed/12cases297ms. Final focused82/8files
PASS544ms; typecheck PASS. Required1,655/451files PASS60.34real/237.12user/48.36sys.
Affected32browser cases PASS47.9sPW/48.31real/32.58user/6.93sys. No timeout/retry/
skip or selection changes; quick 31 PASS29.0sPW/29.42real/38.27user/7.87sys, run separately after builds.

November 8 — canonical protected feed and catalogue withdrawal evidence (partial
T027/T029). Shared legacy checkpoints now derive missing events for the fourteen
supported canonical source collections, with current feed timestamps, stable
source identity/version checks, and PUBLIC versus owner/group audiences. Explicit
service events take precedence; no private bookkeeping or unsupported source is
published. Source rows, locators, feed rows and receipts remain one bounded atomic
commit; the 100-item/3.5 MB limit is unchanged. Existing interrupted 100-row CSV
coverage still passes its twenty-row checkpoints. Physical removals invalidate
source authority rather than fabricating a deliverable missing canonical body.

Catalogue category/merchant removals or withdrawals now advance the existing
private permission revision; ordinary content/refcount changes do not. Every new
cache proof includes catalogue authority, including empty snapshots. Delivered
catalogue bodies retain their original read revision, and both current-source
rounds reject a concurrent withdrawal. Internal proof semantics version 2 rejects
older authentic proofs lacking this dependency with refresh-required; the opaque
fc1 envelope, protocol 1, legacy REST bodies and Apple clients stay compatible.
No new AWS resource, TTL, migration or production action was introduced. Proof
checks add catalogue metadata point reads and feed writes consume existing atomic
headroom; these costs remain unallocated and T018 remains unaccepted.

Required discovery increases from 1,655 to 1,661, still 451 files. Account rename
and merchant protected-delivery red: 2 failed/26 passed/28 cases, 317 ms; focused
28 passed. Catalogue baseline: 2 failed/11 passed/13 cases, 189 ms. A combined
fixture initially supplied contradictory same-ID creation/edit rows: 1 failed/
46 passed/47, 403 ms; corrected to represent a single canonical edit. New targeted
writer atomic deletion and authenticated pre-semantics-proof checks pass. Initial
required validation: 1 failed/1,660 passed/451 files, 56.88 real/232.19 user/48.29
sys; older protected-sync fixture lacked the newly required catalogue metadata
read. Its local fixture now models an absent empty catalogue and asserts the
exact metadata key, without relaxing production checks. Focused final 58/5 files
PASS, 359 ms. Full required rerun is pending; no browser selection, timeout,
retry, workflow or task checkbox change. Apple project user diff remains 1/1.

Final required rerun: 1,661/451 files PASS58.48real/239.34user/48.75sys, including
typecheck/lint/build. Catch-up from cursor zero and actual handler merchant
deletion/proof renewal assertions added to the existing new cases; focused58/5
files PASS374ms. Quick 31 PASS27.9sPW/28.22real/39.02user/7.91sys. Full556 running
separately after builds; hosted check duration remains deferred/unverified.

Next account-memory batch (not included in the running canonical-feed full-browser
build): two new jsdom cases bring expected discovery from1,661/451files to
1,663/452files. Before expansion: required1,661 PASS58.48real; quick 31 PASS28.22real.
Red2failed/2cases2.60s; initial account/transaction/snapshot focused11/3files
PASS1.70s; strengthened late POST-after-lock check PASS1.63s. Owner-keyed view
remount added afterward; final focused result will be recorded separately. No
browser selection or workflow expansion. Source edits do not rebuild the running
preview; its result will retain the earlier checkpoint scope.

Full browser checkpoint after canonical feed/catalogue changes: 536passed/20existing
skips/556selected,403.97real/257.93user/63.43sys. No failures or changed skips,
retries/timeouts/selections. This includes transaction API-memory/account-binding/
import-ID changes and canonical feed/catalogue safeguards, before the next account
list/detail snapshot integration. The two focused account jsdom tests ran during
this full preview run; no build ran concurrently, and its compiled browser build
stayed fixed. Browser fixtures were edited after their cases completed; the new
account checks remain excluded from this full-build claim.

Account-memory integration baseline PASS: required1,663/452files62.96real/
242.84user/50.52sys; standalone1,663PASS50.67real/224.88user/48.58sys. Owner-keyed
view final focused11/3files PASS1.72s. Initial late-snapshot/open checks red2/2
2.60s; no browser expansion. Before browser rebuild, three related CSV original-
visit cases added (expected1,666/452files): same-account lock/unlock, account
switch during encryption, and preservation of a committed100-row prefix when
chunk2 loses access. Red3failed/19passed/22cases209ms; wrapped the existing CSV
queue in the original controller read and forwarded its abort signal to each
existing atomic record/outbox write. No new queue format/replay/crypto downgrade.
Focused33/4files PASS1.63s; required rerun pending. Synthetic real IndexedDB/AES
probe extended with original-visit CSV flag; it has not yet been rerun.

Account/CSV final required1,666/452files PASS61.38real/242.10user/49.91sys. Real
Chromium+WebKit synthetic IndexedDB/AES probe22flags each PASS1.43real/0.68user/
0.30sys; includes original-visit CSV cancellation and prior encrypted/proof/CAS/
pending preservation cases. Browser quick 31 currently running;84affected cases
will follow. No builds ran concurrently with browser validation. Standalone
1,663/50.67s predates the three CSV queue cases and is retained at that scope.

Current account/CSV quick 31 PASS27.7sPW/28.07real/38.53user/7.77sys. Affected84
browser cases running on the current build. Committed-prefix regression now
compares the complete stored row/outbox serialization before and after the later
chunk is rejected, in addition to counts/identity. Case count unchanged; current
standalone run will include this assertion.

Current account/CSV browser checks: quick 31 PASS27.7sPW/28.07real/38.53user/7.77sys;
affected84/8files PASS53.7sPW/54.10real/42.20user/9.87sys across4projects. Same
536/20/556 prior full build retained at403.97real until the current full rerun
finishes. New standalone1,666 running, includes byte-for-byte committed-prefix
assertion. No new task checkmarks or selection/timeout/skip/retry changes.

Next user response needed for the local cost allocation: visible Na'aseh app
hours/device/day, and whether both partners normally have visible clients at
once. This estimates the existing60-second foreground scheduler separately from
one daily broad search. It is not a request to change $6.50 or enable AWS. Other
workload answers remain as recorded; do not re-ask them. Continue independent
local validation while waiting; do not invent a confirmed foreground count.

Current standalone1,666/452files PASS50.66real/225.42user/49.01sys includes all
current assertions. Full556 rerun running against the account/CSV build after
standalone completion; no build or other test suite runs concurrently. Latest
required1,666/61.38s; quick 31/28.07s; affected84/54.10s; real browser synthetic
probe22flags per engine/1.43s. All PASS.

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

Reusable replay iteration evidence (all local, November9):

- Baseline required1,695/455 PASS64.89real/250.49user/52.15sys; the prior unchanged
  quick baseline was31/29.71s. Required test discovery was measured before additions.
- First five new adapter/storage cases:5failed/32passed/37cases/2files,421ms.
  Initial implementation passed37/2files,473ms.
- Typecheck found TS2345 for optional merchantId under exactOptionalPropertyTypes;
  the internal loader input now matches the schema's optional undefined type.
- Two acknowledgement cases:1failed/28passed/29cases,213ms. The preservation case
  was already green; missing draft retirement was red. After implementation the
  combined66/3files passed430ms.
- First required attempt stopped on one unused test-mock argument during lint:
  5.32real/8.70user/0.74sys, tests/build not reached. The mock was typed without an
  unused runtime argument. Required1,702/455 then passed69.64/258.20/56.68.
- Strengthening protected feed verification first failed1/65passed/66cases,526ms:
  the fixture lacked its synthetic proof-signing secret. Correct fixture setup
  passed66/3files,447ms. Required1,702/455 passed65.85/254.24/55.37; standalone
  passed54.82/240.10/53.19. Intermediate quick 31 passed30.25/40.82/8.74.
- The initial missing-metadata fixture expected automatic reconstruction but hit
  a retained publication revision-one collision:1failed/30passed/31cases,436ms.
  An incomplete guard iteration failed1/66passed/67cases,459ms. Its accidentally
  started required run is NOT accepted:1failed/1,702passed/455files,61.84real/
  247.84user/56.35sys; builds not reached. A single-case diagnostic was1failed/
  30unselected,449ms and identified PUBLICATION_CHANGE revision reuse; temporary
  diagnostic output was removed.
- The policy/test was corrected to preserve retryable legacy state rather than
  reconstruct META. Revised red:1failed/30passed/31cases,443ms. A fixture Query
  implementation initially mishandled PK-only queries and failed1/66passed/67,
  450ms; matching real key semantics fixed it. Final scope set67/3files passed
  420ms. Required1,703/455 passed67.24/255.04/54.05; standalone53.80/236.67/50.56;
  intermediate quick 31 passed30.38/40.50/9.17.
- Cross-type claimed-ID admission:1failed/31passed/32cases,473ms before atomic
  locator checks; final combined68/3files PASS407ms. Final1,704 evidence follows
  the main checkpoint above and its final browser completion below.

All expected failure results stay recorded; no failed run is relabeled as PASS.
Only local evidence is accepted here. Hosted required duration and paid capacity,
p95 latency, migrations and the complete combined bill remain deferred/unverified.

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
Both methods and explicit opt-in are accepted; the open-ended budget's default
forecast window is asked separately (dated budgets can use their own dates).

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
rule is resolved; open-ended budget default window is the pending choice (calendar
month/next3months/next12months, adjustable; dated budgets can use their dates).

Correct branch codex/task-item-creation-uploads and feature016; Apple project 1/1
edit and untracked outputs/ preserved. git diff --check passes. Extension file
absent, no hooks. No push, merge, deployment, production/AWS write, real DynamoDB,
native Apple implementation/validation or migration. $6.50 including 30% contingency
unchanged. Original receipts stay S3 Standard and transactions do not expire.

## November 9 shared forecast window

Node 24.18.0 and Playwright 1.64.1. Six date cases add one required test file
to the previous 1,728 tests in 460 files (62.82 s required). Browser selection
and workflow configuration are unchanged.

| Command                       | Actual result                                                                  | Real / user / sys        |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| Focused forecast window tests | 6 passed, 1 file                                                               | Vitest 147 ms            |
| First required run            | Typecheck stopped before tests on unchecked split indexing in the new resolver | 1.05 / 1.53 / 0.21 s     |
| Required rerun                | 1,734 passed, 461 files, typecheck, lint and workspace builds passed           | 67.53 / 257.75 / 56.50 s |
| Standalone suite              | 1,734 passed, 461 files                                                        | 53.92 / 236.73 / 52.49 s |

The corrected resolver extracts the complete ISO date before validating its
four-digit year. The helper does not issue requests or have a UI or API consumer
yet. No Finance 016 task was checked from this work.

Quick browser suite passed all 31 in 29.7 s Playwright time, with
30.11 / 41.38 / 8.84 s real / user / sys. Its local preview logged connection
refusals for unmocked requests to the inactive development API on port 3000.

The full Playwright matrix passed 536 with 20 existing skips out of 556 selected
in 414.16 / 269.72 / 68.80 s real / user / sys. The browser used the same source
as the quick run. The earlier standalone 25-check storage probe script was
absent from the local temporary directory. The full matrix includes the existing
PIN and encrypted-storage journeys.

## November 9 proof-backed Finance routes and transaction removal preview

The initial focused run passed 43 cases and failed one component assertion in
2.54 s. The fixture used structurally identical empty objects for distinct
snapshot tokens. The assertion now compares identity. The corrected run passed
44 cases in three files in 2.38 s. One handler integration case covers eight
paths and cache-only proof verification before and after group withdrawal.
Two component cases cover preview publication and late response disposal on lock.

| Command             | Actual result                                                | Real / user / sys        |
| ------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation | 1,737 passed in 461 files, typecheck, lint and builds passed | 70.02 / 262.55 / 54.72 s |
| Standalone suite    | 1,737 passed in 461 files                                    | 53.85 / 239.91 / 51.08 s |

This adds three required cases to the preceding 1,734. The existing full-suite
transaction journey now exercises removal preview and revocation. Quick and
full discovery remain 31 and 556 respectively.

Quick browser validation passed 31 in 29.8 s Playwright and
30.15 / 40.41 / 8.22 s real / user / sys. The initial targeted transaction
journeys passed all 12 in 14.0 s Playwright time across the four projects
and 14.32 / 13.78 / 2.66 s real / user / sys.

The first full matrix for this batch completed with 534 passed, two failed,
and 20 existing skips out of 556 selected. It took 438.41 / 270.42 / 66.78 s
real / user / sys. Chromium and iPhone both timed out filling the search field
after the revocation fixture had already caused Finance to remove the field.
The fixture now holds newly intercepted cache-only checks until after search
input, then releases them with revoked evidence. The test still requires the
transaction and removal preview to disappear after revocation.

## November 9 account removal preview and match replay authorization

Focused checks passed 49 in four files in 2.55 s. The account preview uses the
same opt-in proof as transaction preview. It discards late results and keeps
only display fields in component state. Fresh match evaluation excludes budget
items tied to inaccessible accounts. Retried evaluation and decisions recheck
current transaction, budget, and related-account visibility before releasing
their saved result. The route integration case now exercises nine GET paths.

| Command                                     | Actual result                                                | Real / user / sys        |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation                         | 1,740 passed in 461 files, typecheck, lint and builds passed | 65.41 / 248.98 / 50.39 s |
| Standalone suite                            | 1,740 passed in 461 files                                    | 51.41 / 231.08 / 47.68 s |
| Quick Playwright                            | 31 passed (28.0 s Playwright)                                | 28.34 / 39.55 / 7.89 s   |
| Targeted account and transaction Playwright | 24 passed across all four projects (23.2 s Playwright)       | 23.54 / 20.70 / 4.15 s   |

The required suite gained three cases over the 1,737-case checkpoint. Browser
suite selection, retry, timeout and workflow settings did not change.

The corrected full matrix passed 536 with 20 existing skips out of 556 selected
in 408.90 / 261.56 / 65.11 s real / user / sys. The corrected transaction journey
passed in all four projects. The source stayed fixed throughout the matrix.

After the full matrix, the exact timed quick command under Node 24 passed all
31 in 28.9 s Playwright time and 29.35 / 39.28 / 8.08 s real / user / sys.
Hosted acceptance remains deferred.

## November 10 CSV duplicate review

The new regression failed before implementation because reviewed rows had no
commit selection. The first focused run took 343 ms. After the fix, 30 cases
passed across the duplicate-review and encrypted-write-lock test files in
192 ms. The required suite is expected to gain one case over the prior 1,740.

| Command                     | Actual result                                                | Real / user / sys        |
| --------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation         | 1,741 passed in 462 files, typecheck, lint and builds passed | 67.56 / 254.49 / 53.76 s |
| Standalone suite            | 1,741 passed in 462 files                                    | 54.72 / 235.89 / 51.56 s |
| Quick Playwright            | 31 passed                                                    | 29.63 / 41.06 / 8.59 s   |
| Targeted account Playwright | 12 passed across all four projects                           | 16.25 / 12.97 / 2.47 s   |

The full matrix for the review change passed 536 with 20 existing skips out of
556 selected in 419.40 / 272.01 / 69.13 s real / user / sys.

The subsequent encrypted account-binding change extended an existing queue
case, with no count increase. Its focused run passed 30 cases in two files
in 240 ms. It checked that staging and outbox copies contain the same account,
scope, and review evidence and survive projection invalidation byte-for-byte.

The binding-only required and standalone suites each passed 1,741 in 462 files.
Required took 65.24 / 252.94 / 51.62 s and standalone took
53.02 / 235.77 / 49.25 s real / user / sys. The queued browser pass was canceled
before launch so it could include the original-visit and outbox hold changes.
The visit-only validation was stopped when the outbox hold was added.

Before the hold, the sync regression failed as expected. Five cases passed
and one failed in 202 ms. The corrected focused run passed 36 in three files
in 192 ms. The new regression asserts that generic sync never decrypts, sends,
or acknowledges the queued CSV chunk.

| Final CSV command           | Actual result                                                | Real / user / sys        |
| --------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation         | 1,742 passed in 462 files, typecheck, lint and builds passed | 63.48 / 252.15 / 50.74 s |
| Standalone suite            | 1,742 passed in 462 files                                    | 52.41 / 233.58 / 48.91 s |
| Quick Playwright            | 31 passed                                                    | 28.97 / 39.99 / 8.05 s   |
| Targeted account Playwright | 12 passed across all four projects                           | 14.89 / 13.04 / 2.36 s   |

The final full Playwright matrix passed 536 with 20 existing skips out of
556 selected in 413.89 / 271.46 / 66.58 s real / user / sys. All runs used
Node 24.18.0 and Playwright 1.64.1. Hosted acceptance remains deferred.

## November 10 saved CSV account preview

The initial targeted run failed the two new cases before the reader existed.
It passed 29 existing cases and failed two in 213 ms. After adding the reader,
all 31 passed in 199 ms. The cases cover paired legacy rows, account scope,
preserved queue bytes, and disagreement between encrypted staging and outbox.
The existing account browser journey now checks the destination and saved row
count after reconnecting. Required discovery grows from 1,742 to 1,744.

| Command                      | Actual result                                                | Real / user / sys        |
| ---------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation          | 1,744 passed in 462 files, typecheck, lint and builds passed | 65.15 / 255.11 / 53.85 s |
| Standalone suite             | 1,744 passed in 462 files                                    | 54.15 / 236.38 / 52.01 s |
| First account Playwright run | 9 passed, 3 reload failures in WebKit, iPhone and iPad       | 73.94 / 23.08 / 4.48 s   |
| Corrected account Playwright | 12 passed across all four projects                           | 16.25 / 12.97 / 2.42 s   |
| Quick Playwright             | 31 passed                                                    | 27.77 / 39.27 / 8.23 s   |

The failed browser journeys stalled at Finance security following reload.
The mocked account suite now blocks service workers so reloads use the test
routes. The real service-worker and storage journeys retain their existing
configuration. Browser case counts and required workflow settings are unchanged.

The full matrix passed 536 with 20 existing skips out of 556 selected in
410.95 / 267.51 / 67.92 s real / user / sys. The corrected saved CSV preview
passed across all four browser projects. Hosted acceptance remains deferred.

## November 10 saved CSV row preview and duplicate comparison

The initial matcher run failed both new cases before the helper existed
(153 ms). The first focused run with the matcher, import authorization and
durable handler tests passed 39 in 395 ms. The combined focused run passed 70
in four files in 418 ms. The first typecheck exposed an inferred empty-array
type in the preview accumulator. It was corrected before required validation.

The existing account journey now opens the saved batch and checks that the
included row appears and the excluded row is absent. Browser case counts and
workflow settings are unchanged.

| Command                      | Actual result                                                      | Real / user / sys        |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------ |
| Required validation          | 1,746 passed in 463 files, typecheck, lint and builds passed       | 67.14 / 258.81 / 55.61 s |
| Standalone suite             | 1,746 passed in 463 files                                          | 55.46 / 240.51 / 53.08 s |
| First account Playwright run | 8 passed, 4 failed on an exact-text locator next to the new button | 27.81 / 17.34 / 3.34 s   |

The locator now selects the batch list item by its saved-row count and opens
the preview from that item.

The corrected account run passed all 12 cases in 16.57 / 13.31 / 2.55 s
real / user / sys. The quick run passed all 31 in 28.82 / 40.82 / 8.64 s.

The full matrix passed 536 with 20 existing skips out of 556 selected in
418.46 / 274.61 / 71.04 s real / user / sys. The saved-row journey passed
across all four projects. Node 24.18.0 and Playwright 1.64.1 were used.
Hosted validation remains deferred.

## November 10 bounded saved CSV duplicate check

The initial read-model run passed 10 and failed the two new cases before the
bounded reader existed (314 ms). The focused read-model and comparison run
passed 14 in 246 ms. The read-model and HTTP run passed 26 in 283 ms. The first
required run stopped at lint in 5.31 / 8.31 / 0.61 s real / user / sys because
a mock argument was unused. The corrected test asserts its command type.

The browser fixture now checks that only displayed saved rows are sent and
marks the returned row as a possible duplicate. No browser cases or required
workflow settings were added.

| Command                     | Actual result                                                | Real / user / sys        |
| --------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation         | 1,749 passed in 463 files, typecheck, lint and builds passed | 65.69 / 256.96 / 54.94 s |
| Standalone suite            | 1,749 passed in 463 files                                    | 54.30 / 238.53 / 51.33 s |
| Targeted account Playwright | 12 passed across all four projects                           | 16.66 / 13.65 / 2.68 s   |
| Quick Playwright            | 31 passed                                                    | 28.75 / 40.69 / 8.42 s   |

The full matrix passed 536 with 20 existing skips out of 556 selected in
416.39 / 276.62 / 70.35 s real / user / sys. The saved-row duplicate check
passed in all four browser projects. Node 24.18.0 and Playwright 1.64.1
were used. Hosted and real DynamoDB validation remain deferred.

## November 10 saved CSV pagination and choices

The regression failed before pagination existed, with 31 existing cases
passing and one failing in 292 ms. After implementation all 32 passed in
243 ms. The case verifies the last row of a 101-row batch spanning two encrypted
chunks. The existing browser case now changes the page size, records an
Include choice and verifies that it remains visible after paging away and
back. Required discovery grows from 1,749 to 1,750. Browser selection and
required workflow settings are unchanged.

| Command                     | Actual result                                                | Real / user / sys        |
| --------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation         | 1,750 passed in 463 files, typecheck, lint and builds passed | 72.05 / 259.03 / 56.07 s |
| Standalone suite            | 1,750 passed in 463 files                                    | 56.14 / 242.66 / 53.71 s |
| Targeted account Playwright | 12 passed across all four projects                           | 18.13 / 14.17 / 2.98 s   |
| Quick Playwright            | 31 passed                                                    | 29.34 / 42.56 / 9.00 s   |

The full matrix passed 536 with 20 existing skips out of 556 selected in
427.25 / 280.91 / 73.92 s real / user / sys. The saved CSV paging journey
passed in all four projects. Node 24.18.0 and Playwright 1.64.1 were used.
Hosted and real DynamoDB validation remain deferred.

## November 10 reviewed saved CSV submission

The combined focused run passed 68 cases in three files in 607 ms. New
regressions require complete row review and verify that interrupted dispatch
preserves the encrypted plan and original queue until the exact retry
succeeds. The durable import test also rejects a retry with changed file
identity or row content. The existing browser journey covers confirmation,
an unchecked page blocking submission, and retirement after a matching
receipt. Required discovery increases from 1,750 to 1,752 cases.

Before the explicit retry change, required validation passed 1,752 in
71.55 / 265.16 / 57.08 s and standalone passed 1,752 in
60.26 / 246.04 / 53.70 s real / user / sys. Targeted account Playwright
passed 12 in 18.89 / 15.01 / 3.13 s, and quick passed 31 in
30.02 / 42.57 / 8.97 s. The full run was interrupted to verify the concurrent
submission fix on a single source version. The final focused repeat passed
68 cases in 479 ms. The browser fixture now simulates a lost response and
requires the retry to send the same request.

The explicit-retry intermediate required run passed 1,752 in
71.01 / 264.48 / 55.90 s and standalone passed 1,752 in
57.48 / 244.95 / 53.44 s real / user / sys. Its first account browser attempt
failed all 12 during initial navigation after the local server stopped
(35.28 / 10.46 / 2.31 s). A fresh preview server passed all 12 in
18.37 / 14.92 / 3.07 s. The later browser commands were stopped when the user
approved partial recovery. The leftover preview process was cleared before
the final build. Final focused tests passed 69 in three files in 470 ms.

| Final command after partial recovery approval | Actual result                                                | Real / user / sys        |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation                           | 1,753 passed in 464 files, typecheck, lint and builds passed | 68.17 / 262.89 / 56.27 s |
| Standalone suite                              | 1,753 passed in 464 files                                    | 61.71 / 248.08 / 54.71 s |
| Targeted account Playwright                   | 12 passed across all four projects                           | 18.48 / 14.94 / 3.10 s   |

The partial-recovery build passed the quick suite with 31 cases in
29.88 / 41.78 / 8.88 s. Its first full run recorded 535 passed, one failed and
20 existing skips in 429.08 / 285.52 / 74.98 s. The iPad retry stopped before
sending the replacement after background sync incremented the outbox attempt
counter. Recovery now compares immutable command fields and ciphertext.
The focused rerun explicitly increments that counter and passed 69 in 486 ms.

| Final command after retry identity correction | Actual result                                                | Real / user / sys        |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation                           | 1,753 passed in 464 files, typecheck, lint and builds passed | 71.91 / 263.37 / 55.86 s |
| Standalone suite                              | 1,753 passed in 464 files                                    | 59.31 / 244.00 / 53.06 s |
| Targeted account Playwright                   | 12 passed across all four projects                           | 18.44 / 14.79 / 2.99 s   |

The final quick run passed 31 in 30.18 / 41.55 / 8.72 s. The final full
matrix passed 536 with 20 existing skips out of 556 selected in
424.47 / 279.07 / 71.94 s real / user / sys. The iPad retry passed after
the command identity correction. Node 24.18.0 and Playwright 1.64.1 were used.
Hosted and real DynamoDB validation remain deferred.

## November 10 ordinary sync with saved CSV imports

The focused run passed 22 tests in two files in 280 ms. It verifies that
routine replay leaves saved CSV ciphertext untouched and that ordinary resync
restores the task snapshot and advances its cursor while the saved import
remains queued. The required count stays at 1,753.

| Command             | Actual result                                                | Real / user / sys        |
| ------------------- | ------------------------------------------------------------ | ------------------------ |
| Required validation | 1,753 passed in 464 files, typecheck, lint and builds passed | 63.66 / 243.31 / 49.45 s |
| Standalone suite    | 1,753 passed in 464 files                                    | 51.15 / 227.07 / 47.03 s |
| Quick Playwright    | 31 passed                                                    | 28.65 / 38.53 / 7.67 s   |

The full matrix passed 536 with 20 existing skips out of 556 selected in
412.43 / 262.36 / 65.28 s real / user / sys. The saved CSV recovery journey
passed across all four projects. Node 24.18.0 and Playwright 1.64.1 were used.
Hosted and real DynamoDB validation remain deferred.

## November 10 catalog removal proof

The focused merchant component and durable handler run passed 36 in two files
in 494 ms. The durable category test checks proof issuance and preserves its
private-reference assertion. The merchant component test covers revocation
after preview. The existing browser journey verifies that confirmation after
revocation sends no deletion request. Required and browser case counts remain
unchanged.

| Command                          | Actual result                                                                             | Real / user / sys        |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| Required validation              | 1,753 passed in 464 files, typecheck, lint and builds passed                              | 63.33 / 244.06 / 50.91 s |
| Standalone suite                 | 1,753 passed in 464 files                                                                 | 50.84 / 227.49 / 48.52 s |
| First transaction Playwright run | 8 passed, 4 assertions expected merchant refresh after the Finance security screen opened | 24.72 / 17.52 / 3.58 s   |

The browser assertion now checks the Finance security screen and verifies that
no deletion request was sent.

The corrected transaction run passed 12 across the four projects in
13.74 / 13.14 / 2.62 s. Quick passed 31 in 27.95 / 38.50 / 7.89 s.

The full matrix passed 536 with 20 existing skips out of 556 selected in
414.79 / 257.67 / 66.53 s real / user / sys. The merchant revocation journey
passed in all four projects. Hosted and real DynamoDB validation remain deferred.

## Provider reconciliation source proof

The focused provider service, security and transaction component run passed
10 cases in three files in 2.59 s. Existing cases now cover revoked replay
access. The existing browser case covers a version conflict, a successful
decision with canonical review refresh, and revocation before another
submission. Required and browser test selections are unchanged.

| Command                          | Actual result                                                                        | Real / user / sys        |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| Required validation              | 1,753 passed in 464 files, typecheck, lint and builds passed                         | 62.67 / 245.43 / 51.08 s |
| Standalone suite                 | 1,753 passed in 464 files                                                            | 50.80 / 228.37 / 49.25 s |
| First transaction Playwright run | 8 passed, 4 fixture timeouts after the access revocation removed the decision button | 72.34 / 24.86 / 5.40 s   |

The fixture now holds cache verification until the click is dispatched,
then releases it with revoked evidence. The check requires that the
comparison disappear and that no third decision request reach the server.

The corrected transaction run passed 12 in 16.59 / 14.99 / 3.21 s.
Quick passed 31 in 29.94 / 38.44 / 7.73 s.

The full matrix passed 536 with 20 existing skips out of 556 selected in
413.65 / 263.39 / 66.35 s real / user / sys. The reconciliation journey
passed in all four projects. Hosted and real DynamoDB validation remain deferred.

## Transaction write source proof

Node 24.18.0 and Playwright 1.64.1 were used. The focused transaction,
transfer, retained-view and durable-runtime checks passed 42 cases in four
files in 2.49 s. The durable-runtime case verifies that the single-transaction
proof route uses point reads without a scope query or write. The existing
browser case checks transfer leg versions, ignores an unverified allocation
response and verifies that revocation blocks a second allocation write.

The intermediate full-graph refresh passed its targeted browser run
(12 passed in 16.52 / 14.90 / 3.23 s). The final implementation uses bounded
point reads for allocation and transfer and retains the full review refresh
for reconciliation. The selected test counts and required workflow are
unchanged.

The required and standalone suites each passed 1,753 tests in 464 files at
the intermediate checkpoints. Wall times for required and standalone were
63.85 / 52.11 s after the initial allocation and transfer changes,
64.46 / 51.58 s after expanding replay checks, 62.87 / 52.10 s during the
full-graph experiment, and 63.90 / 51.71 s after restoring point reads.

| Browser command              | Actual result                                        | Real / user / sys         |
| ---------------------------- | ---------------------------------------------------- | ------------------------- |
| Targeted transaction journey | 12 passed across four projects                       | 17.22 / 14.94 / 3.20 s    |
| Quick suite                  | 31 passed                                            | 28.14 / 39.07 / 8.11 s    |
| Full matrix                  | 536 passed and 20 existing skips out of 556 selected | 415.44 / 262.72 / 66.78 s |

Source remained fixed throughout the full browser run. The following
account-receipt update changes server authorization only. The combined
focused run passed 48 in five files in 2.65 s, including retries after
the account changed to an inaccessible scope.

| Final command       | Actual result                                                         | Real / user / sys        |
| ------------------- | --------------------------------------------------------------------- | ------------------------ |
| Required validation | 1,753 passed in 464 files, runtime, typecheck, lint and builds passed | 64.75 / 247.83 / 52.14 s |
| Standalone suite    | 1,753 passed in 464 files                                             | 51.09 / 229.06 / 48.65 s |

## Account edit and budget replay checks

The account component and repository checks passed 10 in two files in
0.74 s. The budget service, replay, durable runtime and account component
checks then passed 49 in four files in 0.65 s. The targeted account browser
suite passed 12 in 20.12 / 13.90 / 3.04 s. Its existing case verifies canonical
refresh after rename and that revocation prevents a second balance request.
Selected browser counts and required validation workflow are unchanged.

| Command                                                      | Actual result                                                                                  | Real / user / sys         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------- |
| Required validation                                          | 1,753 passed in 464 files, runtime, typecheck, lint and builds passed                          | 63.38 / 246.76 / 49.98 s  |
| Standalone suite                                             | 1,753 passed in 464 files                                                                      | 50.70 / 227.40 / 47.61 s  |
| Quick browser suite                                          | 31 passed                                                                                      | 28.60 / 38.98 / 8.01 s    |
| First full browser run                                       | 244 passed, 10 skipped, 6 failed, 2 interrupted, 294 did not run                               | 342.21 / 180.48 / 48.96 s |
| First WebKit retry                                           | Preview did not become ready within the existing 60-second web-server deadline, zero cases ran | 63.22 / 0.52 / 0.46 s     |
| Targeted WebKit retry on a separately verified local preview | 2 navigation timeouts, 6 did not run after the failure limit                                   | 115.93 / 1.73 / 3.70 s    |

The first full run was interrupted after consecutive desktop WebKit
timeouts in task timer, task sync recovery, task lists and urgency filtering.
The changed Finance account case passed in Chromium and WebKit before the
timeouts. The failure report includes both test-startup and in-journey
timeouts. The existing test deadlines were retained.

During the targeted retry, the local preview answered its HTTP check.
Both failures occurred during navigation. Host diagnostics immediately
afterward showed a load average of 84.26 / 95.07 / 59.71, 43 stuck processes
and 24 GB of compressed memory. A WebContent sample during startup showed
inspector and JavaScript initialization. It did not identify a Keychain
wait. The current full browser matrix remains unverified.

## November 11 receiving checkout — protected sync and visit invalidation

Branch `codex/task-item-creation-uploads`, HEAD `fdc6505b`, and feature pointer
`specs/016-finance-experience-expansion` matched before work. The requirements
checklist was 16/16. Node 24.18.0, Playwright 1.64.1 and the matching Chromium and
WebKit binaries were present. Discovery selected 556 full cases in 70 files and
31 quick cases in 20 files. The selection, projects, retries, timeouts and
workflow were kept as configured.

| Command                                     | Actual result                                                         | Real / user / sys        |
| ------------------------------------------- | --------------------------------------------------------------------- | ------------------------ |
| First full matrix                           | 0 ran / 556 selected, preview startup denied                          | 4.07 / 5.47 / 1.03 s     |
| Quick baseline                              | 0 ran / 31 selected, preview startup denied                           | 3.67 / 5.65 / 0.75 s     |
| Full matrix after host load settled         | 0 ran / 556 selected, preview startup denied                          | 3.65 / 5.42 / 0.82 s     |
| Required validation before edits            | 1,753 passed in 464 files, runtime, typecheck, lint and builds passed | 67.25 / 257.76 / 54.40 s |
| Final focused security and foundation suite | 167 passed in 15 files                                                | 10.49 / 16.77 / 4.34 s   |
| Final required validation                   | 1,762 passed in 464 files, runtime, typecheck, lint and builds passed | 66.34 / 255.28 / 54.33 s |
| Final standalone suite                      | 1,762 passed in 464 files                                             | 52.77 / 234.94 / 51.51 s |
| Final quick suite                           | 0 ran / 31 selected, preview startup denied                           | 3.47 / 5.36 / 0.72 s     |

Both full attempts used `caffeinate -i`. The first one-minute load readings
were above 30 on a 12-logical-CPU Mac. The resumed run started after the
one-minute load fell to 2.66. The preview build completed and its server
received `listen EPERM` on `127.0.0.1:4173` in both attempts. The separate
Chromium startup probe also failed during macOS Mach-port registration with
`bootstrap_check_in` permission denied (1100). These are startup permission
failures in this session. The previous completed full run remains 536 passes
and 20 existing skips. No browser cases ran in this continuation.

Regression checks reproduced late grant expiry failing ordinary delivery,
late unlock writes restoring stale browser security state, cancelled requests
locking a newer visit, unbound replay acknowledgements, and group revocations
leaving cache evidence active locally or in peer tabs. The focused run above
passed after correction. The Foundation fixtures exercise bounded local
commands and provide no measured live DynamoDB latency or consumed capacity.
The required suite gained eight cases for this continuation and also includes
one existing-checkout task retry regression added alongside it. The browser
selection and required workflow settings stayed fixed. Hosted duration for the
current checkout remains deferred.

## November 13 protected budget/account-link replay checkpoint

The selected-account offline budget flow now atomically stores the encrypted budget,
stable link records and dependency-ordered semantic mutations. Server replay uses
current budget/account locators and authorization revisions plus a deterministic
same-table budget/account pair singleton. It does not download relationship history
to the browser and does not scan protected relationship rows. Group-scope preparation
verifies and repairs the singleton set in bounded, restartable pages before stamping
coverage. The migration was not run.

| Command                                                   | Actual result                                                         | Real / user / sys                           |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Focused budget/account-link replay, PWA and runtime tests | 119 passed in 9 files                                                 | not separately timed after final formatting |
| Required validation                                       | 1,805 passed in 468 files; runtime, typecheck, lint and builds passed | 64.19 / 254.28 / 51.58 s                    |
| Standalone suite                                          | 1,805 passed in 468 files                                             | 53.17 / 231.21 / 46.78 s                    |
| Targeted budget browsers                                  | 16 passed                                                             | 12.37 / 13.68 / 2.64 s                      |
| Quick browser suite                                       | 31 passed                                                             | 27.65 / 38.78 / 8.31 s                      |

The first targeted-browser attempt inside the restricted runner failed before test
execution with loopback `listen EPERM`; the permitted unchanged retry passed. Browser
selection, projects, retries, deadlines and required workflow selection are unchanged.
The latest complete full-matrix evidence remains 536 passed and 20 existing skips out
of 556 selected in 402.97 seconds real. T027 remains unchecked for other semantic
replay families and the complete delivery story. T018/T029/T032 also remain open.

The next replay slice wires the existing encrypted `financeBudgetItem` queue helper to
the item form and adds strict `budget-item-create-v1` replay. The browser retains the
form if encrypted queueing fails and never treats the optimistic row as canonical.
The server point-loads the budget, exact item/retry, category/optional references,
related accounts and their active pair singletons. Missing active-link evidence
conflicts, exact retry does not write twice, and the tested replay path executes no
DynamoDB Query.

| Command                                      | Actual result                                                         | Real / user / sys        |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------ |
| Focused budget item/replay/PWA/runtime tests | 63 passed in 4 files                                                  | not separately timed     |
| Required validation                          | 1,810 passed in 468 files; runtime, typecheck, lint and builds passed | 63.64 / 247.29 / 51.83 s |
| Standalone suite                             | 1,810 passed in 468 files                                             | 52.79 / 230.28 / 49.70 s |
| Targeted budget browsers                     | 16 passed                                                             | 13.73 / 13.51 / 2.77 s   |
| Quick browser suite                          | 31 passed                                                             | 27.24 / 38.94 / 7.98 s   |

No test selection, timeout, retry, Playwright project, AWS resource, Apple contract or
migration changed. T027 and the other open foundation/access-control tasks remain
unchecked.

## November 13 canonical catalogue write follow-up

Category creation/rename and merchant creation no longer install the mutation response
as retained UI state. Each publishes a fresh authorized catalogue read; category rename
also refreshes and verifies the displayed source version before dispatch. Merchant
selection occurs only when the canonical post-write catalogue identifies one matching
new row. Three focused component regressions pass and do not change browser selection.

| Command                           | Actual result                                                         | Real / user / sys        |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------ |
| Focused catalogue component tests | 3 passed in 1 file                                                    | 0.29 s Vitest            |
| Required validation               | 1,813 passed in 469 files; runtime, typecheck, lint and builds passed | 61.82 / 246.57 / 49.84 s |
| Standalone suite                  | 1,813 passed in 469 files                                             | 55.34 / 242.92 / 54.02 s |
| Quick browser suite               | 31 passed                                                             | 28.86 / 41.69 / 9.32 s   |

This is partial T029 evidence, not completion of the retained-view audit. T018/T027/
T029/T032 remain open. The current complete full browser evidence remains 536 passed,
20 existing skips and 556 selected in 402.97 seconds real.
