# Na’aseh Finance 016 handoff for Steve’s Codex

> November 16 T018 staging checkpoint: both staging stacks synthesize with
> isolated inputs and the production templates match the earlier synthesis.
> Local validation passed 2,013 tests in 506 files in 70.11 s. T018 remains
> open for a deployed staging target, live measurements and cost acceptance.
> The [staging inputs](finance-experience.md#synthesize-the-staging-target)
> describe the account, DNS and recovery role needed for the next step.

> November 16 T123/T018 checkpoint: 125/166 tasks checked. Steve reported
> 12/12 integrated Phase 11 browser cases passing. T018 local preflight passed
> 217 checks. Live DynamoDB, receipt storage and hosted timing still need a
> separate staging target. The projected receipt-retention sensitivity crosses
> $6.50/month by month 24; cost acceptance remains open. See the
> [acceptance procedure](finance-experience.md#t018-live-acceptance).

> November 16 integration checkpoint: 124/166 tasks checked. T122 is complete.
> A combined DynamoDB restore fixture verifies the exact receipt bytes, one
> canonical fulfillment claim, and both directions of the task relationship
> after provider reconciliation and an interrupted write. The SimpleFIN
> refresh repairs older task links retained under the alias. Required validation
> passed 2,008 tests in 506 files in 69.00 s. T123 needs the integrated desktop
> browser evidence. T018 remains open for live storage and hosted acceptance.

> November 15 two-computer integration checkpoint: 123/166 tasks checked.
> The integration branch merges Computer 1 at `131e515f` and Computer 2 at
> `3b5a7b58` from common base `c4c4978`. The combined paths retain bounded
> transaction browsing, private receipts, upcoming expenses, task links and
> dashboard preferences. T126 retains its eight-case pre-integration Terminal
> browser pass. On November 16, integrated validation passed 2,007 tests in
> 506 files, typecheck, lint and builds. The quick browser fixture now handles
> initial Finance cache sync. Its rerun needs a local preview server. See the
> [validation runtime record](../testing/finance-experience-validation-runtime.md).
> T122 and T123 still need combined reconciliation, restore and browser evidence.
> T018 remains open for live storage and hosted acceptance under the $6.50 ceiling.

> November 15 dashboard widgets checkpoint: 98/166 tasks checked. The dashboard
> uses current personal flags to show only opted-in account balances and persists
> the upcoming count (5/10/15/20) through protected versioned settings.
> Account and upcoming reads report loading and failure independently. Overdue
> rows remain separate, and the upcoming selector deduplicates explicit planned
> sources and ignores old unpaid copies of a newer paid record.
> Full local validation passed **1,946 tests / 498 files / 68.24 s**. Steve ran the
> dedicated desktop suite in macOS Terminal. All eight Chromium and WebKit cases
> passed after the initial cache sync fixture was corrected. T126 is complete.
> T124 and T131 are in progress. The dashboard still uses the existing
> authorized list APIs. Bounded widget queries, open-budget/recent-activity
> sections, and preference sync remain open.

> November 15 dashboard inclusion controls checkpoint: **97/166 tasks checked**.
> T130 is complete. Account, budget, category and merchant views expose personal
> dashboard inclusion flags. The controls use the protected API, send the displayed
> version, confirm changes through a fresh read, and clear their values on lock.
> Focused web tests passed **44/44**. Full local validation passed **1,943 tests /
> 498 files / 67.97 s**. The quick browser command could not bind
> `127.0.0.1:4173` in the agent session. T126 browser journeys, widget queries,
> dashboard widget composition and preference sync remain open.

> November 15 dashboard preference API checkpoint: **96/166 tasks checked**.
> T128 is complete on `codex/finance-016-dashboard-preferences`. The protected
> GET, PUT and PATCH routes use caller-owned storage and point-read account,
> budget and catalog authority. Runtime checks cover current group membership on
> writes and retries. Writes save a conditional version, immutable revision and
> exact-intent retry receipt together. Full local validation passed **1,940 tests
> in 497 files in 67.98 s**. Steve confirmed **12/12** T111 Chromium/WebKit cases
> in **10.4 s** from macOS Terminal. Widget queries, preference controls and
> cross-device sync remain open. Phase 8, Phase 10 and T122 are on the second
> computer for the combined handoff. Leave the migration unrun and preserve the
> approved $6.50 combined cost ceiling.

> November 15 first-computer dashboard checkpoint: T111 is complete and preserved
> on `codex/finance-016-dashboard-preferences`. The branch also starts Phase 12
> dashboard preferences. Strict request/response contracts and an owner-partitioned
> service implement default-off flags, the default upcoming count of ten, conditional
> updates, current-source fencing for writes, and dormant flags when access is lost.
> Six integration cases pass with a simulated DynamoDB client. Required validation
> passes **1,938 tests / 497 files / 68.67 s** with runtime, typecheck, lint and builds.
> The 95/166 task count holds until the dashboard adapter and endpoints are wired.
> Next, bind the service to canonical account/budget/catalog access proof and the
> protected Finance routes, then wire owner-only sync and dashboard consumers.
> Phase 8, Phase 10 and T122 remain on the second computer for the combined handoff.

> Current local checkpoint (November 15, Phase 11 task/expense relationships in
> progress): 95/166 tasks checked. T109–T121 are complete. Canonical
> budget-item/transaction/upcoming-expense links now support multi-link task create and
> edit, source-to-task and task-to-source navigation, bounded reverse reads, protected
> default-off task/post-it details and encrypted offline replay behind the ordinary task
> mutation. Current task plus Finance access is rechecked on writes, reads and retries;
> inaccessible links disclose no IDs/counts and ordinary task/export/notification/search
> data contains no Finance metadata. Task lifecycle never mutates payment state. The
> focused implementation set passes **112 tests / 8 files**; required validation passes
> **1,932 / 496 files / 73.47 s** with runtime, typecheck, lint and builds. The dedicated
> Chromium/WebKit relationship journey passes **12/12 / 10.13 s real**, including multi-select offline queuing,
> source-to-task navigation and embedded unlock/cancel. The second computer owns
> Phase 10/T122 reconciliation and restore evidence;
> complete T123 after combining it. Preserve the Apple project edit and `outputs/`, the
> $6.50 combined AWS ceiling and the unrun migration. Do not deploy or change production.

> Current local checkpoint (November 14, Phase 9 upcoming expenses complete):
> 82/166 tasks checked; T082–T093 are complete. The canonical protected list/create/
> detail workspace, account actions and dashboard upcoming/overdue widget are connected
> through the shared Finance page. Create captures immutable browser-local entry
> context, including encrypted offline intent; delayed Auckland replay preserved the
> original date and zone. Current eligibility excludes inactive budgets from new links
> while existing associations remain manageable. Reschedule/cancel and partial/full/
> reversed payment-reference journeys reload canonical state and never post or
> double-count money. The dedicated Chromium/WebKit gate passes **6/6 / 8.22 s real**.
> Required validation passes **1,910 tests / 492 files / 63.58 s real** with runtime,
> typecheck, lint and builds; the required command, 31-case quick selection, timeouts,
> retries and browser projects are unchanged. Phase 8 remains isolated on the second
> computer. Phase 10 is next here. T018 real DynamoDB/hosted acceptance remains
> deferred; preserve the $6.50 combined ceiling, leave the migration unrun, and do not
> deploy or change production.

> Current local checkpoint (November 14, manual transaction entry complete): 70/166
> tasks checked. Phase 7 T064–T071 is complete. Manual debit/credit entry now works
> for every editable account type/source with current-access and revision checks,
> exact validation, stable idempotency and encrypted offline replay. Connected-account
> entries remain provisional and do not change provider balances. Provider refresh
> preserves user-owned payment/classification data, refund capacity and canonical
> references. Focused validation passes **70 tests / 6 files**; the dedicated
> Chromium/WebKit journeys pass **6/6 / 8.63 s real**. Required validation passes
> **1,876 / 483 files / 67.19 s real** with typecheck, lint and builds; standalone
> passes **1,876 / 483 / 53.57 s real**. The unchanged quick gate passes **31/31 /
> 28.89 s real** and the full matrix passes **560 / 28 existing skips / 588 selected /
> 433.96 s real** without a retry. No timeout, retry, project or required selection
> changed. Phase 8 starts at T072. T018 remains deferred for real DynamoDB/hosted
> acceptance. Preserve the $6.50 combined ceiling, leave the migration unrun and do
> not perform AWS, hosted, production, Apple, push or merge actions.

> Current local checkpoint (November 14, active budgets using existing groups
> complete): 62/166 tasks checked. T057–T063 are checked. Budget creation uses named
> active memberships and succeeds without linked accounts. Ordinary saves are active;
> legacy drafts require explicit activation. Activity and closure are independent,
> versioned states: deactivation preserves existing links, flags and history while
> blocking new/reassigned upcoming associations, and reactivation never reopens a
> closed budget. Online and offline actions recheck current membership and retain
> denied input/intent safely. The focused implementation set passes **71 tests / 12
> files**, the new Chromium/WebKit journeys pass **6/6**, and the affected desktop
> set passes **20/20**. Required validation passes **1,866 / 482 files / 63.69 s real**
> with typecheck, lint and builds; standalone passes **1,866 / 482 / 52.20 s real**.
> The unchanged quick gate passes **31/31 / 27.52 s real**. The final full matrix
> passes **548 / 28 existing skips / 576 selected / 506.68 s real**. Its first run
> found two enhanced-list WebKit/iPhone navigation races; keyboard activation of the
> same accessible button made the four-project focused file and complete rerun pass.
> No timeout, retry, project or required selection changed. Phase 7 starts at T064.
> T018 remains deferred for real DynamoDB/hosted acceptance. Preserve the $6.50
> combined ceiling, leave the migration unrun and do not perform AWS, hosted,
> production, Apple, push or merge actions.

> Current local checkpoint (November 13, payment classification/refund story
> complete): 55/166 tasks checked. T042–T056 are checked. Payment/check metadata,
> one-level categories and immutable classification snapshots now persist through
> protected Finance flows. Merchant changes are versioned and authorized. Explicit
> full/partial refund relationships enforce source-access intersection, currency and
> principal capacity while retaining the refund's received date; correction/removal,
> provider refresh, competing claims, original recategorization and canonical alias
> repair preserve only compatible confirmed history and exact contributions.
> The focused domain/contract/integration/security set passes **59 tests / 14 files**;
> the new Chromium/WebKit classification/refund journeys pass **2/2**. Required
> validation passes **1,854 / 480 files / 65.18 s real** with typecheck, lint and
> builds; standalone passes **1,854 / 480 / 52.66 s real**. The unchanged required
> quick suite passes **31/31 / 26.99 s real**. The decisive full matrix passes
> **542 / 22 existing skips / 564 selected / 417.68 s real**. Its first run exposed
> eight stale browser-test navigation assumptions and two completion-feedback layout
> races; the corrected focused runs and complete awake-held rerun pass without any
> timeout, retry, project or required-selection change. One Mac-suspended diagnostic
> run is not accepted evidence. Phase 6 starts at T057. T018 remains deferred for
> real DynamoDB/hosted acceptance. Preserve the $6.50 combined ceiling, leave the
> migration unrun and do not perform AWS, hosted, production, push or merge actions.
>
> Current local checkpoint (November 13, Finance navigation/account story complete): 40/166 tasks checked.
> T033–T041 are checked. Finance now uses one canonical direct-entry/back-forward
> route model, orders Tasks/Lists/Finance/Journal/Search/Admin, and exposes the ten
> contracted Finance destinations through an accessible keyboard/touch menu while
> preserving secondary tools. Task-filter query state no longer leaks across sections.
> New Account is a dedicated retained-input page and confirms the saved id/version
> through a protected canonical read before navigation. Account detail is divided
> into readable summary, balance/freshness, settings, transaction/import and
> destructive regions without 375px page overflow. The protected dashboard has
> truthful checking, empty, fresh/stale and unavailable states and no mock totals.
> SimpleFIN remains per connection under Accounts/New Account; repository evidence
> confirms no application-wide Admin credential UI is required.
> The focused UI set passes **18 tests / 5 files**. The new account browser case
> passes **4/4 / 9.60 s real** and the consolidated account matrix passes
> **16/16 / 21.53 s real** across Chromium, WebKit, iPhone and iPad.
> Required validation passes **1,827 / 473 files / 62.53 s real** with typecheck,
> lint and builds; standalone passes **1,827 / 473 / 52.61 s real**. The unchanged
> required quick suite passes **31/31 / 27.71 s real**. A legacy view-less Finance
> route serializer remains compatible with `/finance`; parsed routes stay explicit.
> T032’s consolidated contract/security/component set passes **168 tests / 14 files**;
> all **12/12** PIN browser cases and the **536-pass / 20-skip** full matrix pass.
> Offline unlock requires the encrypted verifier already established on that device,
> never persists or mints an online grant, and fails closed for new/missing/stale devices.
> The T027 audit and **82 tests / 6 files** confirm independent ordinary/Finance
> checkpoints, current-source delivery gating, legacy lock/upgrade behavior, ordinary
> progress while Finance is withheld, strict replay for every mutation the PWA can
> queue and safe retry retention for future unsupported intent.
> The full T029 named-path audit and **87 tests / 7 files** confirm controller-bound
> decrypt/cache/search/embedded reads, request/replay cancellation, sign-out purge,
> page lifecycle/expiry/reconnect revision locks, worker termination and plaintext
> index/snapshot clearing. No Finance Blob URL producer exists.
> SimpleFIN claim and refresh responses are no longer display authority. The PWA
> loads a proof-bearing canonical connection list, rechecks the retained id/version
> before refresh, ignores both mutation response bodies and publishes only the
> confirmed canonical row. A failed connection read does not masquerade as an empty
> setup state. The API list is actor-scoped and omits encrypted credentials.
> Queued budget creation and its selected-account links preserve stable identities
> through exact-intent protected POSTs. The PWA encrypts the budget, link records and
> dependency-ordered outbox entries in one IndexedDB transaction; a child waits while
> its parent is pending or conflicted. Ordinary online budget creation remains
> server-ID-generated.
> Budget/account pair uniqueness is enforced by one deterministic same-table singleton,
> not by downloading relationship history to the device. Replay point-loads current
> budget/account locators, authorization revisions, the pair singleton, requested link,
> and receipt. Missing trusted relationship-index coverage safely retries instead of
> scanning protected rows. Exact retries do not write twice; duplicate active pairs and
> changed intent conflict.
> A bounded, restartable group-scope preparation phase verifies active links, repairs
> missing pair singletons, removes matching stale singletons and stamps coverage only
> after a complete pass. The migration remains unrun.
> An authorized budget-item form that loses connectivity now atomically queues its
> encrypted stable item and intent. Replay point-loads its budget, catalog references,
> related accounts and active-link singletons; missing or revoked evidence conflicts
> without a scope query. Queue failure leaves the form available.
> Category create/rename and merchant create no longer render mutation response bodies.
> They refresh the authorized canonical catalogue before publishing UI state; category
> rename also confirms the displayed version before sending the write.
> Fresh PWA Finance setup now reads current authorized canonical state in 100-row
> catalogue/owner/group pages, then starts the protected change feed at one captured
> frontier. Opaque continuations bind the user, exact active partition set and every
> canonical revision. Every page rechecks source, membership and task authority.
> Encrypted page data/proof/continuation commit atomically; the delivery cursor moves
> only on the complete page. Restart races purge downloaded cache but preserve pending intent.
> No scan, whole-scope Lambda hydration, new AWS resource/index or migration is used.
> Saved CSV recovery supports confirmed imports and explicit retries.
> An interrupted save can recover its verified available rows after review.
> Original T001–T159 remain intact; seven dependent forecast tasks T160–T166 were
> added for the requested known-plan/history methods and dashboard overview.
> Required **1,816 / 470 files PASS / 64.63 s**; standalone **1,816 PASS / 53.56 s**.
> Final focused budget/item replay, PWA and runtime set **63 / 4 files PASS**.
> Targeted budget browser matrix **16 / 13.73 s real**; current quick **31 / 26.98 s real**.
> Focused bootstrap/checkpoint coverage **74 / 4 files PASS**; its earlier quick
> browser suite **31 / 27.78 s real**.
> Focused retained account/budget/reusable batch **22 / 4 files PASS / 0.87 s**.
> A late Finance lock preserves ordinary sync and the previous Finance cursor.
> Replay checks mutation identity and version before removing saved intent.
> Group revocations invalidate Finance evidence. Cancelled visits cannot restore stale
> security state or lock a newer visit. Peer tabs also close after cache invalidation.
> Full browser matrix **536 passed / 20 existing skips / 556 selected / 408.55 s real**.
> The unchanged quick suite passed **31 / 26.98 s real**. Targeted account,
> budget and task-link matrices passed **12 / 18.81 s**, **16 / 14.07 s** and
> **12 / 10.50 s** across the four projects. Existing timeouts, retries, projects
> and required selection remain unchanged.
> Previous separate storage probe **25 checks each Chromium/WebKit PASS / 1.30 s**.
> Optional non-budgeted historical inputs require an explicit forecast request;
> budget report rows/totals stay budget-only. Shared selection/regression coverage
> is implemented; the forecast algorithms, API and UI remain dependent work.
> Open-ended forecasts default to the next 12 months. Dated forecasts use budget
> dates by default. Either forecast range can be adjusted without editing the budget.
> Account and transaction removal previews use current source proofs. Match
> reads and retries check current budget and related-account access.
> Budget-item creation and reconciliation now check their retained source before
> and after writes, ignore raw mutation DTOs and reload canonical proof-bearing data.
> Task links, normal online/offline CSV commits, offline reusable-item queues and
> budget creation/account linking also recheck their retained sources before
> publishing success or beginning the next dependent write.
> Household: two visible devices, mixed private/shared accounts, ten daily overall
> hours including two Finance hours. Receipts: 50/month about 2 MB, S3 Standard,
> no initial receipt imports; two total views/month primary, 100/month sensitivity.
> T018 remains open; T027/T029/T032 are checked. No hosted, real DynamoDB or combined-cost PASS;
> keep $6.50 including 30% contingency, no transaction expiry and migration unrun.

Prepared November 5, 2026. Implementation stopped at the user’s request. The Finance WIP is published on the existing GitHub branch.

- Existing repository: `stevekessler/naaseh`
- Branch: `codex/task-item-creation-uploads`
- Baseline checkpoint: `4d676379b1c3bc5771a49e6b323f9443e34d8b27`
- Published WIP commit: `0c0cc689318bf00403106c7c1ffc9e6ac465ea8c`
- `.specify/feature.json` resolves to `specs/016-finance-experience-expansion`.
- Apple directories were unchanged by the WIP commit. The parent checkpoint contains Apple and other existing work that must be preserved.

## Bring the work into Steve’s checkout

Fetch the latest branch from GitHub and fast-forward your local checkout. Run these commands from the existing Na’aseh checkout on `codex/task-item-creation-uploads`.

```sh
git fetch origin codex/task-item-creation-uploads
git merge --ff-only FETCH_HEAD
```

The branch includes the full WIP and this handoff. If Git reports divergence or an untracked file collision, stop and report it so existing work is preserved.

## Instructions for the receiving Codex

Continue using `$speckit-implement` in the existing repository. Read `AGENTS.md`, `.agents/skills/speckit-implement/SKILL.md`, the constitution, the Finance 016 spec, plan, research, data model, contracts, quickstart, checklists and tasks, and the Finance 015 task list. Read `docs/testing/finance-experience-validation.md`, `docs/testing/finance-experience-validation-runtime.md`, `docs/operations/finance-experience-cost.md`, and `docs/operations/finance-experience.md` for detailed evidence. Keep the existing spec, plan and tasks. Implement web/PWA, API, shared TypeScript, infrastructure, tests and docs only. Preserve Apple clients’ compatibility; defer native Apple changes and validation. No deployment, production changes, merge, or AWS writes were authorized. The user explicitly deferred real DynamoDB and hosted acceptance while local development continues.

## Validation to resume

Use Node 24 and `npm ci`. Keep the approved exact Playwright 1.64.1 and install its matching Chromium and WebKit binaries. Run the validation commands sequentially with the machine awake: `npm run validate`, timed `npm run test`, `/usr/bin/time -p npm run test:e2e:quick`, and `/usr/bin/time -p npm run test:e2e`. Do not raise timeouts to compensate for host suspension. The quick selection remains 31 cases, full selection 556, and required test discovery 1,415 cases in 435 files. Keep the required hosted PR target at or below ten minutes with the existing 15-minute timeout; current hosted duration remains unverified.

- The initial baseline had 1,321 unit/integration passes; validation failed on lint scanning a virtual environment, fixed in the WIP. Initial full browser run: 522 pass, 20 skip, 2 fail. Detailed baselines are in the runtime report.
- All 12 PIN cases passed unchanged in 23.14 seconds on 1.64.1 after the user added the updated Playwright app in macOS Keychain Access. That authorization is local to the sending Mac. If Steve sees the same WebKit freeze, first reproduce with a synthetic non-extractable CryptoKey IndexedDB persistence probe. The prior investigation found WebKit waiting on its own master-key access; do not replace or expose the key, weaken encryption, or assume the permission issue reproduces on Steve’s machine.
- The six bounded query-status HTTP tests, type checking, and lint passed. Latest `npm run validate`: 431/435 files passed, 1,400 cases passed, 1 failed, 14 skipped. Three infrastructure setup hooks and an urgency performance case timed out during documented Mac sleep. Build was not reached.
- Two full browser runs each returned 514 passed, 20 skipped and 22 failed during repeated 10–17 minute macOS sleep cycles. The first run’s 22 failures all passed unchanged in 26.77 seconds on targeted rerun. A fresh uninterrupted full run is still required. No validation gate was accepted from the failed runs.

## Resume foundation work before dependent stories

19 of 159 tasks are checked. Foundation T012, T013, T017 and T018 remain open. Local building blocks include bounded reads and compact text postings, reversible/restartable fact publication, canonical source loaders, coverage proofs, migration tooling, and owner-only query jobs. Query status now resolves before legacy whole-scope hydration and checks the current session, tab grant and security revision. Initial bounded transaction query creation and pagination, automatic incremental publication from canonical writes, and remaining infrastructure review still need work. Keep legacy Apple-facing API and sync behavior compatible. Do not turn on a whole-scope read fallback or schedule a complete rebuild after every write.

T018 still needs actual DynamoDB and hosted measurements. The conditional ongoing combined Finance AWS estimate is $6.466201/month against Steve’s approved $6.50/month ceiling; the synthetic initial 100k-row migration extrapolates to $25.215 for writes alone. Do not run that migration under the approved ceiling. Optimize it and repeat the cost and bounded-read acceptance when an authorized isolated environment is available. Local fixtures are not live capacity or latency evidence.

The PIN story is partial. Current server and web code covers self-only PIN management, canonical session/tab grants, offline verification, encrypted metadata, and withholding locked data. T022 records the passing representative PIN tests only. Semantic Finance replay, the independent web delivery cursor, pending-data recovery/invalidation coverage and the final lifecycle audit remain open. Keep subsequent task checkboxes tied to their own passing evidence.

## Local receiving-checkout continuation — November 6, 2026

The local checkout remains `codex/task-item-creation-uploads` at published HEAD
`fdc6505bb17bc6572dfa8d461ee629c037328b7f`, with substantial uncommitted continuation
work. Nothing was pushed, deployed or migrated. Preserve the existing local Apple
project edit and untracked `outputs/`; no native Apple implementation was performed.

Bounded query creation/rows/continuation, independent verified row readiness,
compact aggregate/checkpoint paths and original-source proof checks now have local
tests. Canonical writes atomically journal publication work. Private dependency
directories/reverse references, per-source coverage applications, pinned account
publication windows, proven source/account initialization and the durable outbox
consumer now handle targeted updates without scheduling full rebuilds. Completed
worker metadata/journals retain replay for 30 days; pending work never expires.
Canonical transactions are not expired or deleted by that bookkeeping policy.
Trusted native dispatch and bounded missed-signal recovery are now wired in the local infrastructure template, reusing the existing Finance function and default event bus; nothing was deployed. Physical transaction removal now has bounded, restartable projection cleanup backed by canonical deletion evidence. Account scope moves remain unfinished. T012/T017 are checked for local implementation evidence; T013/T018 remain open.

Latest completed required local validation: **1,557 passed / 441 files / 62.95 s**,
runtime/typecheck/lint/build pass. Latest unchanged quick browsers: **31 passed /
28.56 s real** (Playwright 28.2 s). Node **24.18.0**, exact Playwright **1.64.1**.
Keychain consent was resolved; do not restart the old permission investigation
without a reproduced browser failure. Detailed intermediate failures/counts and
timings are retained in the runtime report. Hosted/real DynamoDB acceptance
remain explicitly deferred; migration remains unrun. Tasks now **21/159 checked**.

User sizing answers: one broad search daily, usually its first 200 results; one
couple with modest transaction volume; transactions stay until the user deletes
them. Treat 50 accounts/100,000 transactions as stress sizing, not expected usage
or a deletion horizon. Offline retained-history and publication-command artifacts
show that the old conditional **$6.466201** scenario no longer establishes the
**$6.50 combined ceiling** after workflow overhead. See the updated cost document
and `docs/testing/finance-publication-sizing.json`; many-account routing excludes
the other accounts' child work and is a lower bound, not acceptance.

Resolved household answer: **8 linked accounts / 250 total new transactions per
month** across all accounts. Corrections were unspecified; retain the earlier
500/month assumption conservatively, plus an explicitly assumed 500 other metadata
commits/month. Eight-account complete child-work sizing is now in the publication
artifact. No transaction retention limit is inferred.

Dispatch failure preserves successful canonical commits and pending work. One
combined EventBridge event/schedule rule, one exact rule-ARN invoke permission,
and strict native envelopes preserve the unchanged 400-resource guard. Native
workers yield between bounded source batches. Recovery checks up to five pending
records per five-minute tick; idle polls make no writes. Empty, stale, conflicting,
corrupt and HTTP-spoofed work have local coverage. Current additional publication
EventBridge allowance makes the old conditional scenario $6.468801; this remains
unaccepted pending complete request/compute/read/storage accounting and external
evidence. Do not equate the household write estimate with cost acceptance.

Private physical-deletion evidence and bounded projection cleanup pass at
**1,557 tests / 441 files**. Both writers record identifiers/versions atomically
with actual canonical deletion. Cleanup reverses summaries and last-applied
coverage uses once, removes fact/reference/ordinal rows, and preserves neighbors.
Frozen cleanup finishes before a later recreation is reenrolled. Scope moves
produce no false deletion witness. Remaining mutation handling precedes
stories; preserve the spec, plan, tasks and user-deferred external gates.

Latest continuation additionally expires only the matching completed deletion
proof alongside its 30-day job/archive; an older job cannot expire a newer pending
proof. Representative removal costs 397.18 estimated WRUs/source including coverage
subtraction, plus 252 eight-account window/routing WRUs. Replacing all 500 assumed
monthly corrections with permanent removals would exceed the old $6.50 quantity
scenario (about $6.58 before unresolved invocation/compute/read overages). The
current user question asks rough monthly correction and permanent-removal counts;
8 accounts and 250 new transactions/month are already resolved. Do not ask about
AWS activation or the migration again; those remain deferred.

Resolved later November 6: the user supplied **100 corrections and zero permanent
deletions/month**. Use these with eight accounts/250 new transactions. The previous
500-correction/all-deletion sensitivity remains historical stress evidence, not
expected household usage. User asked to continue local work; account relocation
is being implemented before dependent stories. No further response is currently
needed for these volume assumptions.

Latest local account-move continuation: **1,563 tests / 442 files PASS**, required
**65.87 s**, typecheck/lint/build pass. Bounded move discovery handles chains and
returns with post-baseline creation proofs. Deferred source claims are durable,
generation-bound and must clear before query readiness; explicit repair remains
available without an automatic full rebuild. T013 is still open for empty-account
physical retirement/recreation and lifecycle review. T018 remains deferred, and
tasks remain **21/159**. Preserve the Apple project edit and untracked outputs.

The user expects **five years initial history**. At the supplied volume this is
about **15,000 transactions**, not an inspected input count. The offline household
snapshot is **127,616,386 estimated projection bytes**, excluding other data.
Current focused question: will history arrive as bank CSV uploads or is it already
stored in Na'aseh? Setup import/backfill cost depends on this; no migration or
cloud action is authorized. Do not re-ask resolved account/monthly edit quantities.

Final unchanged quick browser repeat passes **31 / 28.62 s real** (Playwright
28.2 s), exact version 1.64.1. Sizing-tool lint/workspace typecheck pass. No hooks
are configured. All local checks for this batch pass; actual DynamoDB/hosted,
setup source/cost and empty-account retirement remain open. No push, deployment,
production action, migration, or Apple source change occurred.

Latest retirement continuation: **1,571 / 443 files PASS / 61.46 s**, all required
stages pass; audit **29 / 323 ms**. T013 now has local implementation evidence;
tasks **22/159 checked**. Empty-account removal drains proven source cleanup,
preserves pending first-source birth/generation proof, and retains identifier-only
retirement certificates for old jobs/directory entries. Current birth pointers
prevent bootstrap from an earlier lifecycle. Both canonical writers and plain/
hashed legacy absence paths have passing checks. Keep T018's actual DynamoDB,
hosted, initial-history source and complete setup cost unresolved. No Apple edit,
cloud write, deployment, push or migration occurred. Continue the existing local
US2 PIN/reset security work under the user's continuation instruction.

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

### November 9 continuation: administrator parity and retained budget snapshots

Applied Steve's explicit decision: active administrators may access personally
owned and actual active member-group Finance under the same PIN/session and
ordinary group-role checks. No foreign-owner/nonmember-group access or destructive
role elevation. Existing admin MFA and PIN-grant requirements remain. Finance task
relationships use ordinary task permissions, preventing the application's separate
private-task administrator override from exposing a Finance relationship. Legacy
repository loading, bounded budget replay, query actor resolution, targeted source
reads, protected feed and opaque proof issuance/verification are covered locally.

Budget directory/detail views now collect account/category/source proofs, retain
opaque snapshots, recheck before opening/saving, and reload canonical data after
writes. Lock or owner change disposes retained tokens and clears form/dependent
views; late create completion cannot repopulate or navigate. Partial account-link
failure preserves the created budget and displays a warning. Reusable-item and
other subview audits remain open; no complete offline budget-item story is claimed.

Added seven administrator and three budget cases: required 1,704→1,714, files 455→456.
Required baseline 66.47s; administrator checkpoint1,711/66.53s; final production
source 1,714/65.03s; standalone 1,714/53.82s. Targeted budgets 16 PASS/13.64s,
reconciliation 12 PASS/9.97s. Expanded existing mobile budget journey proves revoked
access closes the full Finance boundary, removes a draft and sends no create POST.
No browser case additions; quick 31/full556 with20 existing skips stay selected.
The subtask test now waits for parent-save form reset before entering the child;
its unchanged baseline reproduced a failure, corrected targeted run4 PASS/6.87s.
All failed full runs and actual timings remain in validation/runtime/task evidence.
No failure is converted to a full-gate PASS by a targeted repeat.

Request accounting: docs/testing/finance-budget-snapshot-sizing.json and the cost
report distinguish added proof/GET calls from the old conditional forecast. No
current combined-cost, real DynamoDB or hosted acceptance. Simultaneously visible
device count remains the next household cost input; ten daily overall hours include
two Finance hours. Keep $6.50 including 30% contingency, originals in S3 Standard,
no transaction expiry, no migration.28/159 checked; T018/T027/T029/T032 remain open.
No push, merge, deploy, production/AWS write or native Apple work. Existing Apple
project 1/1 edit and untracked outputs/ preserved. Extension file absent; no hooks.

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
recorded in the November 9 forecast window checkpoint.

Correct branch codex/task-item-creation-uploads and feature016; Apple project 1/1
edit and untracked outputs/ preserved. git diff --check passes. Extension file
absent, no hooks. No push, merge, deployment, production/AWS write, real DynamoDB,
native Apple implementation/validation or migration. $6.50 including 30% contingency
unchanged. Original receipts stay S3 Standard and transactions do not expire.

### November 9 retained-route checkpoint

The local handler test exercises nine proof-backed budget, reusable, match,
and removal-preview GET paths through the same handler used by the API gateway.
It verifies cache-only proof invalidation after group membership is removed.
The web account and transaction preview changes retain display fields only
and discard late results after lock. Match generation and saved replies check
the current transaction, budget and related accounts.

T027 remains open. Older encrypted CSV queue entries keep the account reference
in their companion record. Their command payload has rows, batch identity,
chunk index, and final-chunk status, but lacks the file mapping and review
digests used by the current import contract. Preserve the encrypted queue and
establish a verified account binding and replay identity before dispatch.
Forecast model, API and UI tasks remain dependent work.

### November 10 CSV recovery decision

The user chose to allow recovery from encrypted saved rows even when the
original CSV is unavailable. Recovery must show the destination account for
confirmation and require a fresh duplicate review before import. The legacy
account hint lives outside the authenticated chunk payload. Use it to locate
a candidate and verify current account access. Do not treat it as proof of
the original destination. Preserve the original queue until a reviewed
replacement is durably acknowledged.

New offline chunks carry account, scope, and review metadata inside both
encrypted copies. The normal CSV wizard respects Include and Exclude choices
in staging and online requests. This supplies evidence for a later adapter.
The recovery UI, dispatch and acknowledgement are pending.

### November 10 saved CSV inspection

The selected account now offers **Check saved CSV imports**. It revalidates the
current account snapshot, reads local staging and outbox pairs, checks their
decrypted payloads agree, and reports counts and incomplete batches without
displaying transaction details. It preserves all queue bytes. Legacy account
hints still require confirmation before import. The next step is to obtain
fresh duplicate candidates from authorized transaction data and let the user
review the saved rows before dispatch.

The next checkpoint adds an explicit saved-row preview for the selected batch.
It displays up to 100 verified rows and retains the complete row count. It
does not alter either encrypted copy. The existing CSV commit now shares an
exact duplicate matcher that compares the selected account, timestamp, amount,
and description, retaining the same-batch retry exemption. The matcher does
not itself authorize a source or prove index coverage. A recovery comparison
must establish current account access and canonical coverage before reporting
an empty result. Destination confirmation, duplicate choices and dispatch
remain pending.

### November 10 bounded duplicate check

The saved batch preview now offers **Check displayed rows for duplicates**.
It sends only the displayed row ordinals, amounts, timestamps and descriptions
to the selected account's Finance route. The route checks current edit access,
the ordered index coverage marker and its source revisions before and after a
bounded read. Results are possible-duplicate ordinals. Stale coverage or a
range that exceeds the bound returns an error. The preview currently checks
at most the first 100 saved rows. Review pagination, destination confirmation,
choices and reviewed dispatch remain pending.

### November 10 saved CSV pagination and choices

Saved CSV review supports 1, 10, 25, or 100 rows per page. Smaller pages can
reduce the date span sent to the bounded duplicate endpoint. The selected
account proof and encrypted copies are checked again when opening each page.
A duplicate Include or Exclude choice is bound to the batch, ordinal and row
content in the current unlocked visit. A later check clears choices for rows
that no longer match. Account refresh, selection change and lock clear choices.
The encrypted queue is unchanged. Destination confirmation, complete-review
evidence, reviewed dispatch and durable acknowledgement remain pending.

### November 10 reviewed CSV recovery

Saved imports can be submitted after the user confirms the destination,
checks every available row for duplicates, and decides each possible match.
The user chose to allow recovery of rows saved before an interruption. The
preview distinguishes that case, and recovery requires a contiguous sequence
of verified chunks. A batch with a missing interior chunk stays available
for inspection.

The browser encrypts the approved replacement before dispatch. A retry
explicitly resumes that same plan. The server checks file, review and chunk
identity on repeat requests. Acknowledgement verifies the replacement batch,
account, digests and final row count, then removes the matching original
queue and plan in a single local transaction. Hosted and real DynamoDB
validation remain deferred.

### November 10 ordinary sync with saved CSV imports

Automatic replay skips saved CSV chunks before decryption. Task snapshot
refresh and ordinary feed resync can run with those chunks in the encrypted
queue. Automatic retry accounting skips the held chunks as well. Explicit
saved-import review and submission remains available on the destination
account. The broader protected replay checklist item remains open.

### November 10 catalog removal preview

Category and merchant removal now request an access proof for the preview.
The client keeps the confirmation token inside the verified snapshot, reads
it again at confirmation, and discards the preview on lock. Only the selected
record and its outcome appear in the UI. This adds partial T029 evidence.

### November 10 provider reconciliation proof

The decision flow now rechecks the displayed transaction, review issue, and
candidate before sending a request. Stale responses disable decisions until
refresh. A successful request reloads the authorized transaction and review
graph. The API checks current account access and review identity before
returning a saved reconciliation result. This adds partial T029 evidence.

### November 10 transaction write proof

Allocation and transfer actions verify current access before sending a write.
Transfers also send the displayed version of each leg. The API accepts the
earlier transfer payload for existing clients. After a successful write, the
web client refreshes only the affected transactions through the existing
proof-bearing point-read route. The API reauthorizes account access before
returning receipts for transaction creation, correction, allocation, merchant
association and transfer. This adds partial T029 evidence.

Manual account creation and balance retries also check the current account
scope before returning saved receipts. A retry for an account moved out of
the caller's scope returns the standard unavailable result. A permitted
retry returns the original receipt and creates no duplicate balance.

### November 11 account edit and budget retry checks

Account name and balance edits verify the displayed account through the
retained proof before dispatch. Success follows a verified reload of the
selected account. Legacy budget creation and edit retries verify current
group membership. Account-link and budget-item retries also verify access
to their related accounts. This adds partial T029 evidence.
