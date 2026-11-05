# Finance Experience Expansion Implementation Validation

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
