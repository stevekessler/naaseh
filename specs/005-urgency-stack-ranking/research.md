# Research: Urgency Levels and Personal Stack Ranking

## 1. Canonical urgency representation

**Decision**: Use the wire values `extra_low`, `low`, `medium`, `high`, and `critical` in that stable
display order. Add required `urgency` to Task and List with domain default `medium`. List Items remain
governed by their parent List. Add required `urgencyAtCompletion` to each new Completion Event.

**Rationale**: One enum prevents API, browser, export, and report label drift. A categorical value
preserves the product rule that urgency does not calculate execution order. Capturing urgency in the
existing atomic completion transaction prevents later edits from rewriting historical reports.

**Alternatives considered**: Numeric scores imply arithmetic priority and were rejected. A nullable
field adds an unwanted sixth state. Inheritance from parent Task/List prevents independently urgent
Subtasks and contradicts the specification.

## 2. Personal ordering storage model

**Decision**: Store personal order as an immutable semantic operation log per `(user, scope)`, with
one `overall` scope and one scope per Project. Periodically compact operations into chunked ordered-ID
snapshots. Rank is derived for display and never stored on shared Task/List records.

**Rationale**: Personal operations isolate users and let overall and Project orders differ. A single
stack array would exceed DynamoDB's 400 KB item limit at 50,000 IDs, while a filtered permutation can
touch more than DynamoDB's 100-action transaction limit if modeled as per-row rewrites. Operation
chunks and snapshot chunks remain below item and 4 MB transaction limits, and snapshots are
rebuildable derived data. See the official [DynamoDB constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
and [transaction documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html).

**Alternatives considered**: Rank fields on Task/List violate per-user privacy. Fractional/LexoRank
keys make ordinary moves cheap but cannot implement exact filtered occupied-slot permutation without
multi-row changes. One rank row per visible user/work pair creates eager public/group fan-out and
revocation cleanup cost. CRDT/LSEQ ordering adds collaborative complexity even though each stack has
one logical user owner.

## 3. Membership and implicit tail ordering

**Decision**: Stack membership is the intersection of active work and the viewing user's current
authorization. Work absent from a snapshot or operation log enters an implicit tail ordered by its
authorization/activation feed sequence and immutable work ID. The next stack operation or compaction
incorporates it. Re-entry after archive, deletion recovery, or renewed authorization receives a new
membership epoch and returns at the tail.

**Rationale**: Membership remains correct without synchronously creating rank rows for every user
who might see a public or group item. Current authorization is always authoritative, so stale rank
metadata cannot reveal revoked/private content. A deterministic tail gives multiple devices the same
initial order.

**Alternatives considered**: Eager per-user fan-out multiplies writes and makes privacy transitions
expensive. Retaining a prior active position after authorization loss risks resurrecting stale rank
state and violates the specified bottom-on-return behavior.

## 4. Exact filtered reorder semantics

**Decision**: Model a filtered move as a permutation of only the visible matching IDs in the affected
source-to-destination span. Replay takes their occupied slots from the base stack version, reorders
the matching IDs, and puts them back into those slots; omitted IDs are unchanged. Persist the affected
IDs in bounded operation chunks when necessary.

**Rationale**: This directly implements the accepted clarification. An operation manifest, chunks,
mutation receipt, private audit fact, and conditional stack-version advance can fit in one DynamoDB
transaction for the 50,000-item fixture when the logical Work References are encoded as compact
tuples, compressed into bounded binary chunks, and kept well below 400 KB/4 MB with a performance
gate. The browser can apply the same pure function optimistically and test it exhaustively.

**Alternatives considered**: Inserting the moved item beside the visible destination in the full
stack changes hidden items' occupied positions. A separate order per filter combination destroys the
canonical stack. Rewriting every local/server rank row before acknowledging makes large moves slow
and vulnerable to partial failure.

## 5. Concurrency, idempotency, and conflict behavior

**Decision**: Give each personal stack scope a monotonically increasing version. Queue one reorder
mutation per scope, identified by a user-scoped mutation ID and expected base version. Auto-rebase a
stale simple move only if the item and anchors remain eligible and produce one unambiguous result.
Return an actionable conflict for overlapping filtered moves, removed anchors, authorization changes,
or lifecycle changes. Different users and different scopes never conflict.

**Rationale**: Scope-level serialization prevents a multi-item filtered reorder from partially
converging as unrelated row mutations. Existing outbox/mutation receipts already provide durable
retry and replay semantics. Explicit conflicts satisfy the constitution better than silent
last-write-wins.

**Alternatives considered**: Whole-stack last-write-wins loses accepted offline work. Per-item base
versions cannot detect overlapping reorder intent. A general CRDT is unnecessary for a private stack
and makes the exact occupied-slot rule harder to explain and validate.

## 6. Stack API and synchronization boundary

**Decision**: Add authenticated endpoints for overall and Project stack reads/reorders plus operation
status. Stack reads are cursor-paginated and return the viewer's rank overlay only. Reorders require
CSRF, mutation ID, client ID, expected stack version, scope, and validated move intent. Add
`personalStackOperation` to sync contract version 4 and publish changes only to the owning user's
feed; bootstrap may return a compacted snapshot generation plus later operations.

**Rationale**: A mixed Task/List stack needs a dedicated interface rather than content PATCH calls.
Owner-only feeds support offline cross-device convergence without exposing ranks to public, group,
or administrator audiences. DynamoDB Query results paginate at 1 MB, so the contract uses opaque
cursors throughout; see [DynamoDB query pagination](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html).

**Alternatives considered**: Adding rank to Task/List PATCH couples private preferences to shared
content and creates false content revisions. Browser-only rank cannot synchronize or recover. A
public/group rank feed violates privacy.

## 7. Browser storage and interaction

**Decision**: Add encrypted Dexie stores for personal stack metadata, snapshot chunks, operations,
and conflicts, with only minimum scope/version/index metadata outside ciphertext. Create a mixed-work
Stack page with Overall/Project scope selection. Use explicit Move up, Move down, and Move to position
controls as the accessible baseline; Pointer Events drag/reorder is optional progressive enhancement.
Use an `aria-live` status announcement, visible focus, reduced-motion behavior, and existing touch
target conventions. Before adding the next Dexie version, reconcile the repository's current schema
markers (`schema.ts` reports 8, `database.ts` defines version 9, and `sync-cursor.ts` accepts 7), then
advance them together and regression-test preservation of keys, settings, cursor, conflicts, and
pending outbox mutations.

**Rationale**: The current Task and List screens cannot express one combined canonical stack. Native
HTML drag-and-drop is inconsistent on touch Safari and inaccessible without an equivalent keyboard
path. Rank-first indexed local selection avoids decrypting and sorting all 50,000 work records on
every render.

**Alternatives considered**: Retrofitting only TaskList excludes Lists. Copying current List Item
renumbering rewrites too much data. A new drag dependency is unjustified until the portable controls
are proven insufficient.

## 8. Urgency filters and reporting semantics

**Decision**: Use a multi-value urgency filter with labeled checkboxes in Task, mixed-stack, archive,
Project/workload, completion, drill-down, and export/report contexts. Current workload reports use
current urgency; completion reports use `urgencyAtCompletion`. Every aggregate returns all five
zero-filled buckets in stable order. Completion queries accept comma-delimited `urgencies` because
the current API Gateway handler consumes a single value per query parameter. Contract version 4
adopts the deployed `/api/v1/reporting/completion-report` route and `period` vocabulary, adds `asOf`,
and stops returning raw Completion Events by default; authorized drill-down remains a separate call.

**Rationale**: Identical filter vocabulary and bucket order make report totals reconcilable. Text
labels avoid color-only meaning. Snapshot reporting preserves history. Comma-delimited values fit the
deployed handler without inventing a second parameter parsing convention.

**Alternatives considered**: Repeated query parameters are not reliably preserved by the current
handler shape. Omitting zero buckets makes comparisons unstable. Using current urgency for old
completion events silently rewrites history.

## 9. Reporting query and export access patterns

**Decision**: Extend workload projections with urgency-specific categorical counters/pointers.
Query completion events by completing user and timestamp through the existing GSI capacity rather
than table scans, then apply exact local-time, Project/Category, and urgency predicates. Report and
CSV detail rows overlay only the authenticated viewer's personal overall/Project positions. Add
`urgency`, `overallRank`, and `projectRank` to the existing to-do CSV; rank cells are blank for archived
or inapplicable work.

**Rationale**: Stream/transaction-maintained projections support the 50,000-record fixture and avoid
repeated scans. Viewer overlays prevent administrators or collaborators from receiving another
user's private ordering. Stable urgency text is portable and does not imply a score.

**Alternatives considered**: Table scans conflict with performance and cost goals. Per-user urgency
counters multiply shared report state unnecessarily. Exporting target-user ranks during an admin
report would violate the clarification and security boundary.

## 10. External integrations

**Decision**: Keep urgency and personal stack ranking Na'aseh-authoritative and outside Google Tasks
publish/import/merge snapshots. A Google-imported Task receives the normal Medium default. Later
Google updates preserve urgency and all personal stack operations.

**Rationale**: The current integration maps title, due date, and status only. Inferring urgency from
Google order or due date would couple the two explicitly independent concepts and produce lossy
round trips.

**Alternatives considered**: Mapping Google Task position to rank makes one user's provider order a
shared or cross-user side effect. Encoding urgency in title/notes changes user content and leaks
metadata.

## 11. AWS serverless, cost, observability, and recovery

**Decision**: Reuse the on-demand KMS-encrypted table, existing sync/reporting paths, CloudWatch, PITR,
and AWS Backup. Add a pay-per-use Ranking Lambda and asynchronously invoked compaction handler; begin
with opportunistic compaction only after an operation-depth/size threshold measured in performance
tests. Canonical META/OP/OPCHUNK records are backed up; snapshot chunks are integrity-checked derived
state. Extend restore validation with contiguous versions, chunk count/hash, snapshot pointer,
user/scope isolation, replay equivalence, and urgency report totals.

**Rationale**: Bursty user-driven work fits Lambda and on-demand DynamoDB without idle cost. Keeping
the operation log canonical makes damaged/missing snapshots rebuildable. Low-cardinality telemetry
can diagnose latency, conflicts, backlog, compaction, sync, and consistency failures without logging
protected rank or urgency content.

**Alternatives considered**: ECS/EC2 adds idle cost. A new database adds unjustified operational
surface. Treating snapshots as canonical weakens recovery. Logging user/Project/urgency/rank values
creates sensitive high-cardinality telemetry.

## 12. Server-side filtered pagination

**Decision**: Treat `limit` as returned authorized matches and paginate from the last candidate
examined. For personal stacks, iterate the canonical snapshot/operation/tail sequence in rank order,
batch-load up to 100 current work records, reauthorize them, and apply current lifecycle, Project,
content-type, and urgency filters before adding them to the response. Do not copy urgency into private
stack snapshots. For archive and workload drill-down detail, replace table scans with
transaction-maintained pointer items partitioned by authorization audience, lifecycle, scope, and
urgency; merge the actor's permitted pointer streams by stable key, deduplicate, hydrate, and
reauthorize. Use a separate per-completing-user completion-detail pointer ordered by completion time
and event ID; keep raw events out of the aggregate response and evaluate reversal against the page's
`asOf`. Preserve existing archive search/Category/Project and completion week-start/assignment/user
filters in the normalized cursor fingerprint. Bound each request to
`max(500, min(4000, 20 × limit))` examined candidates, four 1 MB
source pages, and the reserved request-deadline margin, allowing a short or empty page with a non-null
cursor. Encrypt and sign single-source cursor state inline. Store multi-source merge vectors in an
owner-scoped encrypted DynamoDB cursor item with 15-minute TTL and return only a signed opaque ID.
Bind both forms to actor/access epoch, endpoint, scope, normalized-filter fingerprint, source
watermark/position(s), and stack version/tail watermark where applicable. Reject malformed,
mismatched, expired, or stale-context cursors with an actionable restart response.

**Rationale**: Counting only matches prevents filters from producing incorrect page sizes, while a
last-evaluated cursor prevents skipped or repeated candidates when sparse filters hit the bounded
work limit. Hydrating stack references preserves current urgency and authorization without fan-out to
every user's private rank state. Audience projections reuse the existing workload counter/pointer
pattern and create records per owner/public/group/global-admin audience rather than per viewer. The
bounded evaluation budget limits Lambda time and DynamoDB read amplification; low-cardinality metrics
can show when the initial strategy needs a more specialized access pattern. Current authorization is
always enforced even when that shortens a page. Each audience pointer partition maintains a META source
epoch updated with pointer changes; a cursor pins the relevant epoch vector and restarts when urgency,
lifecycle, membership, or audience state changes instead of claiming cross-request snapshot isolation.

**Alternatives considered**: Filtering a single DynamoDB page after applying `limit` omits valid
matches and can return premature end-of-results. Putting current urgency into every private stack
snapshot creates prohibited cross-user write fan-out. A dedicated urgency GSI cannot directly produce
personal rank order and adds merge/update complexity. Unbounded replay or table scans jeopardize cost
and timeout limits. Versioned point-in-time materialization for every filtered traversal provides
stronger cross-page isolation but is unnecessary for the current 10-user scope and substantially
increases storage, write amplification, expiry, and recovery complexity.

## 13. Reproducible performance profile and count telemetry

**Decision**: Make one versioned `urgency-stack-ranking-v1` profile the release authority for the
one-second target. Run it in a digest-pinned Linux container with Node.js 24.18.0, lock-file
dependencies, Playwright Chromium 1.61.1, two logical CPUs, 4 GiB memory, one worker, UTC, a fixed
clock/seed, disabled animation, a 390×844 touch viewport at device scale factor 2, and 4× CPU
slowdown. Networked samples use 150 ms latency, 200,000 bytes/second download, and 93,750 bytes/second
upload; cache-local samples use the same CPU profile with network disabled. Freeze time at
`2026-08-05T12:00:00.000Z` and seed 50,000 authorized active work records, a proportional 10,000-item
Project subset, and 40,000 counted Task/Subtask Completion Events using the exact deterministic type,
urgency, audience, report-window, stack-version, and 1% sparse-filter distributions in the plan. For
every specified journey, discard five warm-ups, collect 40 sequential samples
from reset state, and calculate nearest-rank p95 as the 38th sorted sample. Pass only when p95 is at
most 1,000 ms and at least 38 samples meet the threshold. Preserve the first canonical result and its
complete environment manifest; reruns are diagnostic evidence rather than replacements.

Use one shared telemetry count classifier with the closed buckets `zero`, `one`, `two_to_ten`,
`eleven_to_hundred`, `hundred_one_to_thousand`, `thousand_one_to_ten_thousand`,
`ten_thousand_one_to_fifty_thousand`, and `over_fifty_thousand`. Rank, reporting, synchronization,
reconciliation, pagination, and compaction telemetry emit `affectedCountBucket` whenever an affected
count is known and never emit its exact value. Other emitted record/operation cardinalities reuse the
same classifier under semantic `*CountBucket` or `*DepthBucket` names. Omit an unavailable count
instead of adding an unbounded or ambiguous value. Exact counts remain only in authorized canonical
domain records and calculations, not logs or metric dimensions.

**Rationale**: Fixed resource, browser, throttle, fixture, state-reset, sampling, percentile, and
evidence rules make the performance claim repeatable and prevent a faster laptop, warm residue,
parallel load, or a favorable rerun from redefining success. Chromium is the canonical performance
runner because its CPU and network controls are automatable; WebKit/iPhone/iPad remain separate
correctness gates. A single boundary-tested bucket function eliminates telemetry drift, bounds
CloudWatch cardinality and cost, and prevents exact affected sizes from leaking private stack or
report characteristics.

**Alternatives considered**: Developer-laptop timings, `ubuntu-latest` without resource controls,
one-shot timings, and percentile calculations over mixed journeys are not reproducible. Mixing
Chromium and WebKit measurements creates incomparable distributions. Per-module bucket boundaries,
exact affected counts, free-form labels, and an `unknown` dimension create privacy, cardinality, and
dashboard-consistency risks.
