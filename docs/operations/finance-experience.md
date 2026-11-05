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
