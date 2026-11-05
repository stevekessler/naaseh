# Finance Experience Required Validation Runtime

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
