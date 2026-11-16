# Finance experience foundation operations

This records implemented foundation behavior, not completion of Finance 016.
User routes, PIN lifecycle and downstream stories still have their own unfinished
gates. No live deployment, alarm-delivery test or AWS performance acceptance has
been performed in this continuation.

## Safe event and alarm signals

Finance uses the existing sync/application log group with 30-day retention.
Structured schema-version-2 events contain only the operation, outcome, safe
correlation ID, duration bucket, optional examined count (at most 1,000), error
category, retry kind and optional projection-lag bucket. Raw exceptions, revision
vectors, allocation/calendar payloads, credentials, grants, filenames, financial
values and search/filter contents are excluded or redacted.

Publication start time is persisted with a rebuilding checkpoint and account
marker. Retries retain it. Events bucket known elapsed publication age as `<2s`,
`2-9s`, `10s-14m` or `>=15m`; the raw timestamp/age is not logged. An already
completed idempotent retry reports no pending lag. Old undated checkpoints have
unknown age until resumed; do not infer a start time or claim those are measured.

The existing global Finance series and SNS-connected FinanceFailureSignalAlarm
are reused, with no new paid metric series or account/user dimensions:

| Failure                                                                  | Existing series              | Alarm input threshold               |
| ------------------------------------------------------------------------ | ---------------------------- | ----------------------------------- |
| Currency, arithmetic or cardinality invariant                            | FinanceDataIntegrityFailures | At least 1 in a five-minute period  |
| Known rebuilding publication at least 15 minutes old, or storage failure | FinanceImportFailures        | At least 1 in a five-minute period  |
| Access denied or throttled                                               | FinanceAuthorizationDenials  | At least 10 in a five-minute period |

Projection age is observed when publication is invoked/retried; this is not a
new scheduled sweeper and does not promise detection when no worker runs. Normal
version/capacity conflicts remain distinct from integrity failures. Unknown
exceptions use a generic storage category without copying exception messages.
Query workers preserve trusted authorization/invariant categories as well.

## Triage without discarding work

Use safe correlation IDs and the bounded event fields to locate a failed
operation. An integrity event blocks acceptance: investigate the source and
summary/index conservation before republishing. Never delete a checkpoint,
capacity claim or mutation receipt to hide a failure or force success.

For stalled rebuilding state, resume the same source publication and durable
operation offset. Competing input is rejected. An interrupted v1 text publication
finishes its original batch ordering before v2 bitmap conversion; do not rewrite
its offset against the new representation. Final publication atomically commits
summaries, current fact and ordinal copy, with account state `awaiting-coverage`.
Only then are both temporary fact copies removed from the completed checkpoint.
The current fact remains the next correction's reversal source; canonical source
history is retained.

If a refund's original allocation disappears or its currency no longer agrees,
capacity calculation requires review. It must not silently free the accepted
claim for another refund. Provider source data is retained; explicit relationship
resolution remains the owning story's responsibility.

Query expiry is enforced before computation, before a new checkpoint is
published and after hydration/current-access checks immediately before delivery.
An expired query cannot return rows or totals even if DynamoDB TTL has not yet
removed it. Restart with a new authorized query rather than extending an expired
checkpoint or relaxing its revision checks. Background computation never grants
interactive delivery access.

## Acceptance still required

Current local test/runtime and synthetic representation evidence is recorded in
[the validation report](../testing/finance-experience-validation.md) and
[the cost forecast](finance-experience-cost.md). The conditional combined forecast
is $6.466201/month against the approved $6.50 ceiling, with little headroom.
Actual DynamoDB bytes/ConsumedCapacity, cold/warm/sparse/empty readiness and exact
total deadlines, deployed log/alarm delivery, live restore, human usability and
current hosted runtime remain separate gates.

The repository's [release procedure](release-with-aws.md) states there is no
staging environment. Establish an approved isolated environment and explicit
synthetic fixtures before live acceptance; this runbook does not authorize
creating one, deploying this branch or using production as the performance lab.


## T018 live acceptance

The release procedure requires an isolated target. The published staging
workflow is still a placeholder. To run the remaining checks, identify the
separate AWS account/profile and trusted hosted URL, the integration revision
deployed there, and the staging DynamoDB and versioned receipt storage resources.
Confirm the one-time fixture spend independently of the ongoing $6.50 forecast.
Keep production data and the production migration outside this exercise.

### Synthesize the staging target

The CDK entry point supports separate `NaasehStagingEdge` and
`NaasehStaging` stack IDs. Obtain the staging account's delegated Route 53
zone and same-account recovery role. Set these values for the synthesis:

| Environment variable | Value |
| --- | --- |
| `NAASEH_STAGE` | `staging` |
| `NAASEH_STAGING_ACCOUNT_ID` | Intended separate staging AWS account |
| `CDK_DEFAULT_ACCOUNT` | Account returned by STS using the staging CLI profile |
| `NAASEH_STAGING_DOMAIN_NAME` | Hostname to use for staging |
| `NAASEH_STAGING_HOSTED_ZONE_ID`, `NAASEH_STAGING_HOSTED_ZONE_NAME` | Delegated staging zone containing that hostname |
| `NAASEH_STAGING_BREAK_GLASS_ROLE_ARN` | Existing recovery role in the staging account |
| `NAASEH_STAGING_ALERT_EMAIL` | Optional destination for staging alerts |

With the Node 24 toolchain, build the web app and synthesize the assembly.
Use a separate output directory for review.

```sh
staging_assembly="$(mktemp -d /tmp/naaseh-staging-synth.XXXXXX)" &&
npm run build -w @naaseh/web &&
(
  cd infra &&
  CDK_OUTDIR="$staging_assembly" node --import tsx bin/naaseh.ts
)
```

Review the staging deployment under the AWS release procedure before enabling
the staging workflow. Account and DNS setup, OIDC, and the hosted smoke test
are deployment prerequisites. Synthesis alone validates template generation.

### Measure the deployed target

1. Seed the synthetic scale in the [Finance quickstart](../../specs/016-finance-experience-expansion/quickstart.md)
   and publish projections. Record the revision and verify canonical coverage
   for every measured account. Keep independent expected row IDs, counts and
   currency totals for each query, including an exact leading-zero check match
   and a verified no-match case.
2. Use the protected hosted transaction browse route with `browse=1` and an
   explicit authorized account or account list. Measure the four cases in 20
   runs each using the specified mobile/network profile, including cold and warm
   runs, sparse results and verified zero-match. Use the bound query status and
   rows endpoints for a returned query ID. Poll for progress and exact totals
   without paging through rows. Separate time to progress, time to first actual
   rows or confirmed empty, and time to exact count and totals.
3. Correlate each run with staging API/worker telemetry and DynamoDB operation
   counts, examined rows, and consumed capacity. Record raw timings and p95.
   Use `ReturnConsumedCapacity: TOTAL` for staged SDK instrumentation where
   applicable, including worker requests, and separate it from command counts.
   Verify authorization and projection revision during delivery and compare the
   results with the independent ledger.
4. Upload and restore a synthetic receipt on the staging storage path. Confirm
   both policy and malware verdicts for the same object version and compare the
   restored bytes to the original SHA-256. Record stored bytes, version/backup
   growth, reads and scan costs. Reprice the full household forecast against the
   unchanged ceiling. Record the hosted Validate result and duration for the
   integration revision separately from the application timing.

## SimpleFIN configuration finding

The current SimpleFIN Bridge integration does not require an application-wide
client registration, shared administrator credential or global provider health
configuration. A permitted owner or group member claims a connection-specific
setup token inside the protected Accounts or New Account workflow, and the API
stores that connection secret under its Finance scope. The canonical connection
read returns only safe connection state; it never returns the encrypted setup
token or provider secret.

Therefore Finance 016 intentionally adds no Admin → SimpleFIN Setup destination
and does not require ordinary users to become administrators. If the provider
contract changes to require application-wide credentials, that is a new security
and operations decision and must not be inferred from the current per-connection
flow.

## Finance PIN development status

Auth-only management uses the current password and canonical pepper version.
Finance PIN state is separate from recovery PIN and Journal keys; ordinary
password reset invalidates sessions/grants through epoch changes while retaining
Finance protection. Management is self-only, including for administrators. Grant
expiry is enforced by a canonical transactional snapshot of profile, session,
preference and supplied grant, independently of TTL cleanup. This prevents mixed
pre-reset/post-reset authorization state; availability failures stay closed. Verification
attempt leases prevent concurrent server guesses from bypassing failure counts.

The browser gate is application access control over existing device-key-encrypted
records. It is not Journal-style encryption or a new encryption root. It preserves
pending encrypted edits/receipt bytes and the device key during Finance PIN
replacement. Visit grants stay in tab memory. Lock notices contain no grants,
PINs, verifiers or financial data. Offline verification cannot mint server grants.
Downloaded files cannot be recalled; disconnected devices cannot learn remote
security changes until reconnect. Missing or known-stale material stays closed.

The current PIN story is not release-ready: the 12 representative browser cases
now pass after the user updated local Playwright Keychain access, but full-browser
acceptance is interrupted by macOS sleep. Semantic sync replay and final lifecycle
coverage remain unfinished. Embedded task unlock now keeps the ordinary editor in place, uses a
generic control independent of link existence, and relocks on closing the task.
Pending unlock cancellation/unmount cannot deliver a late UI success. Generic Finance push returns safe retry before generic
receipt lookup; pending intent remains saved rather than being falsely acknowledged.
Do not treat that pause as implemented semantic replay. Current read costs/latency
must be measured with the canonical guard enabled at the deferred T018 gate.

## Account coverage is a separate proof

Publishing one transaction now leaves its account `awaiting-coverage` with
`coverageVerified=false`. A completed contribution checkpoint proves only that
source's reversible publication. It does not prove every canonical transaction,
refund source or source revision is covered, including accounts with zero facts.
Query runtime rejects a marker unless it is explicitly `ready`, coverage is
verified, and its source-scope revision matches the current canonical revision.
Legacy ready markers without the proof are rejected as incomplete.

The bounded canonical/refund verifier, canonical fact loader and restartable
account/scope drivers now exist and pass local tests. They pin source/dependency
revisions, compare the complete canonical set with projected facts and cardinality,
and certify empty accounts only after enumeration. Do not set the coverage flag
manually. T013 still requires automatic incremental canonical-write publication
and bounded query integration; these explicit migration tools do not complete it.

Saved query rows are rebound to their stored references during hydration, and
current original-source/budget access is checked again before delivery. The final
canonical snapshot and visit-grant checks run after those dependency reads so a
revocation during hydration cannot release the result. Source identity mismatches
are trusted integrity failures; inaccessible associations are safe authorization
failures, without echoing their private identifiers.

## Explicit migration tool (execution deferred)

Build with the committed dependencies under Node 24:

```sh
npx esbuild tools/backfill-finance-projections.ts --bundle --platform=node --format=cjs --outfile=/tmp/naaseh-finance-backfill.cjs
node /tmp/naaseh-finance-backfill.cjs --help
```

Help and failed preflight perform no AWS operations. Writes require explicit
`--apply`, `NAASEH_TABLE` and `AWS_REGION`; this continuation tested only help and
rejected preflight paths. DynamoDB execution remains user-deferred.

In a separately approved environment, prepare the catalog and each relevant
owner/group scope before the account phase. Scope preparation creates canonical
locators and verifies the refund singleton index before stamping metadata. Account
steps publish canonical facts and then prove coverage. The default is one bounded
step; `--steps` permits 1–100. Resume with the same input. After a source revision
or calendar change, review the cause and use explicit `--restart`; it restarts
proofs without deleting financial sources or pending mutations. Progress output
contains phase and completion only. An interrupted publication resumes its stored
input before a newer source version.

The tool is not authorized for a 100,000-record live run under the current cost
model: the sampled initial-publication write cost exceeds the approved monthly
ceiling. Resolve that cost gap before any migration, as recorded in the cost gate.

## Local conflict classification

New ordinary/revocation/timer conflict writers persist an additive, non-indexed
entity-type marker beside the existing encrypted value. Ordinary task review and
its badge exclude Finance conflicts even during an unlocked Finance visit; no
protected payload is decrypted by that generic view. Unknown legacy records stay
encrypted until a permitted local Finance visit can classify them. Classification
runs explicitly outside live queries, updates only the marker and keeps the original
ciphertext. Unreadable or unclassifiable legacy formats remain held without exposing
a financial identifier/count. Typed ordinary conflicts remain reviewable while
Finance is locked. The total saved-conflict safety count used for sign-out remains
separate from the visible ordinary-review count.

This is isolation, not Finance conflict resolution: financial conflict records are
retained for the unfinished semantic Finance replay/review path. They are never
acknowledged or deleted merely because ordinary task review excludes them. Generic
sync activity/history and independent Finance delivery cursors still need their
T027/T029 review before release. No US2 completion is claimed.

## Bounded query status delivery

`GET /api/v1/finance/queries/{queryId}` resolves before legacy scope hydration.
It uses only the authenticated owner's checkpoint, validates the current source
snapshot, and binds delivery to the current session/tab grant and security
revision. Expired queries return `finance_query_expired`; changed access/source
returns `finance_query_restart_required`; unavailable computation/storage returns
`finance_query_unavailable`. Responses remain no-store. This status route does
not complete initial transaction query creation/paging or authorize a migration.

`POST /api/v1/finance/queries` now creates a bounded query using the internal
`start(userId, securityRevision, request, requestId)` primitive. Its strict shared
request accepts 1–50 explicit
account IDs and filters; it rejects caller-supplied owner/security/source vectors
and contradictory account filters. The server caller supplies the authenticated
identity and current gate revision. Canonical profile/membership, account locators,
scope/dependency revisions and verified projection coverage are read in bounded
batches before the owner-only job is stored. No whole-scope repository factory,
transaction hydration, migration or rebuild fallback is invoked.

Account-name filtering uses current canonical friendly names with the shared text
normalization. A verified name-filtered empty scope stores an exact zero job and
does not dispatch a worker or read transaction facts. Its source vector still
contains every requested account, so subsequent name/scope/coverage changes
invalidate that empty result. Missing coverage is unavailable, never a guessed
zero. Creation still requires a current delivery grant/security revision even
when no account name matches; status retains its final source/grant rechecks.

Creation requires the ordinary Origin/CSRF checks, `idempotency-key`, current
session/tab gate and source authorization. The body is
`{accountIds,filters?}`; no owner, security revision, source vector or internal
worker envelope is accepted from the client. A 202 response contains only
`{queryId}` plus a `Location` pointing to the protected status route. A final visit
check withholds even that identifier if the visit locks while creation is pending.

Request identity is hashed into an owner-only receipt key and atomically committed
with the first checkpoint. Same-request retries recover the current checkpoint,
including after a lost write response or a concurrent identical creation. They
do not extend the original expiry. Changed filters/scope/security revisions with
the same identity return `finance_query_request_conflict` (409); start a new query
identity after reviewing the new scope. Concurrent different-scope reuse returns
the same safe conflict rather than a retryable storage error. Expired/missing jobs
remain unavailable even while TTL cleanup is pending. A pending retry may repeat
trusted dispatch; conditional worker checkpoints prevent duplicate totals. No
raw filter/source/grant is sent in the internal invocation. Receipts use the
existing table/TTL/backup controls; no new paid service or metric series is added.

`GET /api/v1/finance/queries/{queryId}/rows?limit=50&cursor=...` now provides
independent row pages (default 50, maximum 200). Encrypted cursors bind the owner,
root query, filters and source/security revisions. Completed windows contain up
to 200 references in descending instant/ID order. Moving beyond a window starts
idempotent bounded continuation work with an older-row boundary and the original
root expiry. A page without ready rows returns 202 with `Retry-After: 1`, no rows/next cursor
or exact totals; retry the same URI. Ready pages return 200 and include the original
query's full-scope count/totals only when exact. Pagination is unnecessary for aggregate
completion. Incompatible temporary ordering checkpoints require a query restart;
no canonical data or client contract version is migrated.

Every page rechecks owner/source/grant authority and expiry after hydration.
Continuation count conservation is checked against its preceding window. Indexed
upper bounds retain the boundary day (month for compact text); an exact
instant/ID predicate handles timestamp precision variants. Candidate reads can
repeat within those ranges. Full-history continuation currently re-examines many
facts; the offline sizing report records this unresolved cost/performance gap.
Continuation windows wait for exact completion. The first window can now become
ready independently through the verified compact preview below; actual two-second
row readiness and ten-second exact-total deadlines remain unmeasured. Progress
is not accepted as either deadline.

The legacy Apple-facing transaction routes remain unchanged. Transaction-table
integration and automatic incremental canonical-write publication remain
unfinished. Use `start` to resolve untrusted query scope; the lower-level job
`create` primitive expects already resolved trusted server context. Actual
DynamoDB latency/capacity and hosted runtime remain deferred, and the migration
remains unrun.

Step receipts now store only the committed job identifier. Recovery reads the
current checkpoint, including concurrent workers or a lost transaction response,
instead of retaining another growing copy of the job for every worker step.
Checkpoint storage packs row references using partition indexes; earlier plain
temporary records remain readable. A page hydrates only its selected references,
then rechecks authority and expiry. The whole window's reference/count invariant
still applies.

New contribution publications also atomically update compact account-index
aggregate inputs, including same-date corrections. Private unfiltered job scans
use their checked spend totals, active/posted state and authorization dependencies;
no transaction description or fabricated row is delivered from them. Filters
requiring omitted fields and public rows continue to read full facts. Legacy
references retain bounded full-fact fallback, and malformed compact inputs fail
closed. This is not a complete account-level rollup: every candidate reference
is still examined, and automatic canonical-write publication is unfinished.

Canonical coverage proofs now accumulate and version the original-source account
set across all verified pages. Query creation adds those server-derived accounts
to its revision/access vector (maximum 100 accounts including the selected scope),
without adding them to selected rows or totals. Missing/inaccessible/partial
dependency coverage fails closed. Original-source access is rechecked at delivery,
including after fact hydration. Earlier incomplete coverage proofs require an
explicit trusted restart; they cannot certify the missing earlier dependency set.
Legacy ready markers without the new proof retain their conservative behavior:
an unpinned external refund source is unavailable, never guessed or omitted.

Text cardinality metadata is now a conservative occupied-bucket hint. A counter
changes when a bitmap bucket appears/disappears, rather than for every bit. Each
bucket covers at most 500 ordinals; selection uses `chunks × 500`. Legacy exact
text counters are ignored for selection until adopted conservatively at a bucket
transition. Missing/legacy hints are unknown, not zero. Account and ordinary
dimension cardinalities remain exact, including the account counter used for
coverage. Hints never substitute for an actual indexed read or exact query count.

Canonical account coverage now also verifies each account/date index reference
and checks any compact aggregate against its canonical fact. Missing/mismatched
references cannot certify empty coverage. Only fully normalized compact coverage
receives `accountIndexOrderVersion: 1`; legacy references retain full-completion
behavior. On compatible unfiltered starts, the runtime reads at most 1,000
candidates/account with concurrency at most five. A globally stable first 200
can be published while aggregates continue automatically. If every source is
exhausted, its exact result (including verified empty) needs no worker. Otherwise
each account must provide its ordered first 200 or be exhausted; an insufficient
prefix stays pending. Source/grant/expiry checks precede publication.

Ready first-window pages omit totals while `aggregateState=pending` and keep
`complete=false`/`coverage.scopeComplete=false`. Poll completion separately and
retain the same row cursor; a cursor at the end of the first window waits for
aggregate completion before a continuation can start. Workers deduplicate preview
references and preserve their stable order. Preview work does not count as exact
aggregate contribution twice. No early rows are exposed from an unverified legacy
index or from a changed/locked source.

Both canonical writer paths now commit a pending publication manifest and
per-scope revision journal alongside the canonical write/receipt. The manifest
contains identifiers, versions and digests of potentially name-bearing keys;
it does not copy descriptions, monetary fields, uploaded bytes or credentials.
Pending records have no TTL. They are durable recovery input, not a new public
API or a claim that publication ran. The automatic consumer, incremental
coverage advancement and completed-record retention remain unfinished. No
dispatch, stream mapping or resource was enabled by this prerequisite. Conditional
UOW limits include the journal rows and enforce a 3.5 MB request budget before
storage, matching the legacy writer's transaction headroom. This incomplete
pipeline is not ready to deploy; the user's deployment prohibition remains.

Trusted canonical coverage now enrolls its dependency scopes in a private hashed
directory before marking the account ready. Enrollment persists at most ten
entries/step, supports up to 80 scopes, and rechecks the complete source vector
and account cardinality at final publication. Partial/failed enrollment remains
unavailable; a changed earlier dependency requires explicit restart. Directory
identity conflicts fail closed rather than overwriting another account entry.
Records hold only scope/account identities and have no TTL. Older incomplete
proofs without the enrollment protocol require a trusted restart. No interactive
request invokes this full verification as a fallback or after every write.
Future consumers must recheck each directory candidate against its current
marker/dependency set; stale entries are not authority. Cleanup and automatic
incremental consumption remain unfinished.

Query authority reads now project only the Finance security preference key and
revision. They do not load the PIN verifier/salt; an existing malformed preference
still cannot appear absent because its primary key is included.

Publication now maintains private reverse references for merchant, budget-item,
original-expense and original-account dependencies. Corrections/unlinking remove
only the affected transaction's references. These records contain identifiers,
not copied financial content; they are inputs for the unfinished consumer and
do not grant access. Old completed publications upgrade once; interrupted older
publications finish their saved operation order before upgrading. Publication
identity sorts map keys while preserving allocation-list order, matching DynamoDB
map semantics. Canonical coverage requires a completed current-format publication
whose fingerprint matches the current fact before certifying dependency coverage.
No automatic consumer or migration was enabled by this index support.

Household scope/retention clarification (November 6): Finance is planned for one
couple with modest transaction volume. Transactions remain until the user deletes
them; no age-based transaction deletion or transaction TTL is introduced. The
100,000-source multi-year sizing cases are stress scenarios rather than expected
household usage. Expiring private query jobs and receipts do not expire transactions.

Trusted coverage now retains per-source dependency/original-account sets and their
publication fingerprint, bound to a proof-generation identifier. Account proofs
carry exact use counts and the canonical source count. Later source publications
preserve that prior applied input and account baseline while withholding coverage.
A private incremental application step compares the current canonical graph and
completed publication, then atomically replaces that source's use counts and saved
input. A scope/original account disappears only when its last use is removed.
Lost responses replay safely; missing/different-generation baselines, incomplete
publications and canonical revision conflicts fail closed. This step deliberately
leaves the account awaiting coverage: it neither advances the source revision
vector nor certifies complete journal processing. New-source enrollment, journal
consumption, final readiness and asynchronous infrastructure wiring remain open.

Private impact reads now use strong, five-item directory/source-reference queries
with partition-bound typed cursors and current account dependency checks. Stale
directory entries are candidates only; absent/corrupt proofs cannot silently mean
no work. A separate private journal reader requires each revision in order, at
most five per call, and checks every manifest's digest and matching transition.
Reordered DynamoDB maps retain their original publication identity. Gaps, missing
manifests, unknown formats and malformed identities block replay. Neither reader
advances coverage, removes pending manifests or enables an invocation path.

A missing per-source application can now be enrolled only using a persisted
creation manifest and matching scope journal row newer than the account's saved
coverage vector. The manifest must identify that transaction's creation in its
current account/scope. Its source count and dependency counts commit atomically
with the new application. A creation record for another transaction, a missing
journal, stale evidence or malformed older application cannot substitute for the
old verified baseline. Concurrent enrollment conflicts retry without losing a
source; lost-response replay does not increment twice. Empty verified accounts
are supported. This remains private preparation for the unfinished consumer;
enrollment does not certify that all source changes have been processed.

The private per-account consumer now pins a revision window and durably walks its
journals, direct sources and reverse references. It retains at most five source
identifiers in its current action. Changed account metadata uses five-reference
account-index pages, never canonical whole-scope enumeration. Interrupted source
publication resumes its saved input; newer canonical revisions restart the window
from the last verified vector while preserving already applied source inputs and
counts. Final readiness requires completed journal progress, enrolled dependencies,
matching index cardinality and an atomic recheck of every pinned revision. New
dependencies are enrolled before ready; zero-use scopes are removed from the
delivered proof while old directory entries remain non-authoritative candidates.

These are locally tested worker building blocks. Automatic outbox dispatch,
new-account bootstrap, recovery scheduling/retention/alarms and remaining
infrastructure integration are unfinished. Physical transaction removal and account
scope moves require trusted coverage repair rather than a false ready state. No
full rebuild is scheduled after an ordinary write, and no worker invocation path,
migration or production action was enabled by these local changes.

New-account initialization now requires a persisted account-creation manifest and
matching journal row. It seeds an unavailable zero-source baseline before creation,
enrolls the initial dependency and lets the ordinary journal consumer account for
the first transactions. Existing markers, moved-account evidence and nonempty
indexes are never replaced by this shortcut. Both writers establish negative
refund-index completeness only for a genuinely new scope without preexisting
relationship history; targeted first writes containing relationships retain their
verification requirement. Request-local legacy checkpoints preserve committed
protocol metadata across later commits. Existing scopes still require trusted
scope preparation; no historical backfill was run or scheduled automatically.

The durable outbox consumer processes direct account IDs and dependency
directory pages, waiting for each private account consumer to finish. A new
account uses journal-proven initialization; an existing account with a missing
baseline remains blocked. A parent cursor never conditions a stale child marker;
each child owns its own source/proof transactions. Completed manifests move
atomically out of the pending queue into immutable replay archives, with matching
journal retention for 30 days. Pending work never expires. This expiry applies
only to completed worker bookkeeping; canonical transactions are not expired or
deleted by this process. Archived completion replay does not reopen/extend work.
Explicit trusted full verification disables incremental consumption until its
new proof generation finishes. The following trusted-dispatch continuation wires
native invocation locally; recovery scheduling/alarms and final cost acceptance
remain unfinished. No resource was deployed.

Canonical writer paths now signal the existing default EventBridge bus only after
their durable transaction commits. The event contains only the publication ID;
transport/partial delivery failure preserves the successful canonical result and
pending outbox work. Source/type-restricted permissions and the exact rule ARN
bind delivery to the existing Finance function. The API/importer functions keep
their existing identities and avoid a circular function-reference dependency.
Native publication envelopes are strict; HTTP bodies remain on the authenticated
HTTP path. The worker executes up to five durable actions with time headroom,
then continues using only the server-validated ID. Structured failures reuse
existing metrics and do not copy raw error content. Missed-signal recovery now checks up to five strongly read pending records per
five-minute scheduled tick. A monotone cursor revision prevents old receipts
from swallowing later wraps; idle polls write nothing. Event delivery and the
schedule share one rule and strict source/detail transformer, keeping the
unchanged resource ceiling. Per-record corruption or dispatch failure does not
starve the rest of the selected page. Existing integrity/import-failure metrics
report failures and stalled work without logging financial payloads.

Source publication also yields after one atomic mutation per step; a long text
index cannot turn a nominal five-action worker into an unbounded invocation.
Remaining move/deletion handling and feasibility/cost acceptance are unfinished.

User-authorized physical deletion now records a private identifier/version witness
inside the canonical transaction. A recreated canonical row or locator defeats
an old proof; relocating a row creates no deletion pointer. The bounded consumer
finishes frozen earlier work, removes only the deleted source's bitmap/reference/
ordinal/fact rows and reverses its current summary plus last applied coverage
counts once. Creation/deletion before first publication requires its creation
journal and does not subtract an uncounted source. Later recreation follows its
own creation journal. These are projection maintenance actions following existing
canonical deletion; no worker expires or deletes canonical transaction history.
Account scope relocation and remaining feasibility/cost acceptance are unfinished.

Account scope relocation now discovers atomic old-account removal/new-account
creation manifests through bounded five-revision journal pages. Each new scope
starts at its recorded pre-move revision; unrelated earlier history is not treated
as unprocessed work. Chained moves, returning to an earlier scope and newly
created sources on either side retain their causal creation proof. Source use
counts and directory enrollment move before readiness; no canonical full scan is
scheduled by ordinary publication. Sources encountered before their creation
journal are durably deferred and must pass five-row proof checks before ready.
Missing coverage applications stay unavailable. An explicitly requested full
canonical verifier creates a fresh generation; prior-generation deferred claims
are retired in bounded pages and query delivery remains blocked until they clear.
No automatic full verifier or migration was run by this continuation.

Local lifecycle review still finds an empty-account physical-deletion gap: the
outbox's account consumer currently requires a canonical account, so account
retirement/recreation needs its own proven, bounded handling before T013 closes.
Transaction physical deletion is covered; do not conflate it with account deletion.
All cloud/hosted acceptance and initial-history import remain deferred.

Physical empty-account retirement is now covered locally. Both canonical writers
record identifier-only account deletion evidence. The worker resumes frozen source
work and removes only transaction projections with their own canonical deletion
proofs, one durable action at a time. A zero-source/index account becomes a private
retirement certificate. This certificate has no TTL because older pending jobs and
stale dependency-directory entries may outlive completed job archives. It contains
no financial record body; birth lineage also retains only the current publication
ID/account/scope. Short-lived account deletion evidence receives completed-job
retention after retirement, without making pending work expire.

Recreated live accounts defeat retirement and require their current genuine birth
journal for initialization. An old birth job cannot initialize a new lifecycle.
Birth/deletion before bootstrap requires the pending birth proof rather than a
missing-baseline assumption. A first source whose account disappears before coverage
keeps its proven creation generation until application, allowing exact cleanup
without decrementing an uncounted source. Missing/untrusted coverage remains a
repair condition, with no full-scope automatic fallback. Query markers for retired
accounts are never ready; stale directory entries are ignored only with a valid
private retirement certificate. Plain and hashed legacy canonical keys both block
false absence. T013 local implementation is complete; T018 external acceptance and
initial-history setup/cost remain open, and no migration was run.

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

Current-source sync boundary (November 7): feed payloads cannot establish rights.
The local server checks current canonical source rows, scope revisions, canonical
memberships and related task visibility before Finance delivery. A detected source
change withholds Finance without advancing its checkpoint or stalling ordinary
task delivery. Unsupported/unproven new entities remain fail-closed pending their
stories. Reconciliation source account IDs are private sibling metadata on the
canonical scope row, outside public/Apple DTOs. Both REST history (including archived
budgets) and sync require current access to every contributor. Never reconstruct
historical contributor provenance from today's links or add it to public payloads.
Missing provenance requires repair/evidence, not a guessed history. No existing
Finance data exists per the user's November 7 clarification, and migration is unrun.

Private witnesses persist with the reconciliation row and are removed with that
row; no separate TTL or cleanup of transactions is introduced. The canonical table
backup/recovery boundary includes this metadata. Independent web checkpoint storage
is implemented, but connecting it to source-aware cache invalidation/transport and
semantic replay remains unfinished. Do not mark US2 complete until those paths and
all current entry points have their own passing evidence.

Private scope cache-authority metadata (November 7): canonical owner/group META
records may carry `financeAuthorizationRevision`. It advances atomically for
ownership/scope moves, removal and permission-defining parent/withdrawal changes,
and is preserved by both canonical writers and older metadata callers. It remains
absent for untouched/brand-new scopes (logical baseline zero). Ordinary amount/date
edits and genuine new sources do not revoke existing cache authority. This counter
is separate from the personal PIN/security revision and session epoch; it never
changes a user's PIN or grants. Connected cache-certificate verification is still
unfinished, so no client cache gate is accepted from this metadata alone. No new
resource, schedule, paid metric, transaction TTL or migration is introduced.

November 7 local implementation note: source-aware cached reads use an opt-in
sync request `{contractVersion:8,financeCacheProtocol:1,financeCacheOnly:true,
financeCursor,financeCacheProof?}` behind the existing current-session/Finance PIN
gate. Current proof returns `financeCache:{status:"current",proof}`; stale evidence
returns `refresh-required` without protected data/cursor acknowledgement; locked
or deliberately held Finance returns `locked` without a proof. Proofs reuse the
existing cursor secret (minimum32characters, domain-separated AEAD), not a new
credential/resource. Legacy clients never opt in and receive their original DTOs.

Client proof/checkpoint/generation is encrypted and owner-bound; synchronized rows
carry an unindexed generation marker (no new Dexie schema/migration). Connected
cached batches verify source rights before and after returning data; concurrent
widgets coalesce checks. Proof refresh does not consume new Finance feed events.
Offline cached reads use previously trusted local evidence and the existing PIN
lease only, and cannot learn remote revocation. A known source change closes reads
and discards cache/checkpoint; pending encrypted edits/conflicts/receipt bytes/key
and ordinary task cursor remain. Explicit confirmed full sign-out remains a
separate destructive local-data purge. Unproven records cannot borrow a new proof.

The new-row transport and actual server semantic mutation replay are still
unfinished. So are remaining memory-search/API-derived-view current-source audits;
do not accept T027/T029/T032 or claim full US2 from these primitives/regressions.
No AWS resources/permissions/metrics were added, no production data/import/migration
was touched, and source-proof read/request/compute overhead remains in the
unaccepted $6.50 combined cost model. Initial import is transaction records only;
ongoing receipt-upload volume is now pending user clarification, not assumed zero.

### Budget/account link uniqueness and replay preparation

Active budget/account pairs use a deterministic hashed singleton in the existing
Finance table. The browser sends only its stable link intent; the API verifies current
budget and account access, point-reads the singleton and link evidence, and writes the
link plus singleton transactionally. The browser does not receive or scan the group's
relationship history to decide uniqueness.

Before enabling targeted link replay for an existing group scope, run the existing
explicit Finance preparation tool in an approved environment until its group-scope
checkpoint completes. Its bounded `budget-account-links` phase reads only link rows,
rejects duplicate active pairs, creates missing singletons, removes a matching stale
singleton for a removed link, and stamps `budgetAccountLinkIndexVersion: 1` only after
the complete pass. The operation is restartable. A missing stamp makes replay return a
safe retry; it does not fall back to a scan or whole-scope hydration.

This checkout has not run the migration. No DynamoDB table, secondary index, timer or
deployment setting was added. Keep it unrun until an isolated environment and the
separate AWS/cost authorization are available.

Budget-item creation uses the same trusted coverage. If an authorized browser loses
connectivity during item creation, it encrypts one stable optimistic item and semantic
intent in the existing local transaction. Replay validates the original budget version,
point-loads current budget/category/merchant/reusable references, verifies every related
account and active pair singleton, and then uses the existing item POST. A missing or
revoked source produces a safe conflict; there is no group-history download or scan.
Failed local encryption/storage leaves the item form intact.
