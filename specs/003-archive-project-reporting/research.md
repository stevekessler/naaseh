# Research: Archive, Projects, and Completion Reporting

## 1. Existing Architecture

**Decision**: Extend the existing TypeScript 5.8/React 19 PWA, Node.js 24 Lambda API, shared
Zod domain/contracts, one on-demand DynamoDB table, encrypted Dexie cache, authorized change
feeds, private S3 attachment store, and consolidated CDK deployment.

**Rationale**: These layers already provide versioning, optimistic writes, idempotent mutation
receipts, revisions, offline outbox, access-control purge, PITR, locked backup, and safe
observability. The feature changes domain semantics but does not need another application or
data platform.

**Alternatives considered**: A separate archive table, reporting database, or analytics
service would duplicate authorization, synchronization, recovery, and operational cost.

## 2. Archive Representation

**Decision**: Archive is lifecycle metadata on the current Task or List: state, actor, time,
and reason. It is not a copied ArchiveRecord. Search, queries, and feeds select lifecycle scope.

**Rationale**: Identity, ownership, group, lock, revisions, attachments, and permissions stay
attached to one record, preventing partial moves and policy drift. Existing versioned upserts
and tombstones already distribute state transitions.

**Alternatives considered**: Copying to an archive partition risks duplicate identities,
partial failures, stale permissions, and expensive restore joins. Deleting completed records
contradicts the feature.

## 3. Completion and Lifecycle State

**Decision**: Replace the current mutually exclusive `open|completed|archived` task status
with orthogonal completion and lifecycle dimensions. Complete-and-archive is one semantic,
idempotent mutation that writes the Task, revision, completion event, projections, mutation
receipt, and feed changes atomically. Restore/reopen reverses the counted event.

**Rationale**: Current task validation removes completion metadata when status becomes
archived, so it cannot preserve both facts. One semantic mutation prevents offline or server
partial state such as “completed but still active.”

**Alternatives considered**: Keeping the enum loses attribution; sending completion and
archive separately creates ordering and retry ambiguity.

## 4. List Aggregate Archival

**Decision**: Finish or archive only the List parent. List Items retain their individual state
and inherit active/archive visibility from the parent. Restore returns the same aggregate.

**Rationale**: Large Lists exceed transaction limits if every child must change. Parent-
governed lifecycle makes the user-visible change atomic and matches existing containment.

**Alternatives considered**: Updating each child creates partial archives and unnecessary feed
traffic. Adding List Items to the global archive violates the specification.

## 5. Category and Project Model

**Decision**: Keep Category as the top-level entity and introduce Project with `categoryId`,
optional calendar `endDate`, lifecycle, and version. Work stores only optional `projectId`;
Category is resolved from the Project. Reserve canonical Project names using Category ID plus
normalized name.

**Rationale**: One assignment makes conflicting Category/Project values impossible. Parent-
scoped name keys allow API under different Categories and reject duplicates among siblings.
The existing Category keeps color/default-assignee behavior and stable identity.

**Alternatives considered**: Storing both IDs on work can drift. A flat name namespace blocks
the requested duplicate names. Recursive nesting adds unsupported scope.

## 6. Legacy Category Migration

**Decision**: Preserve every existing Category as a top-level Category, create an idempotently
named `General` Project beneath it, and backfill each task's former `categoryId` to that
Project. Existing Lists remain unassigned because they have no prior category. Existing
completed tasks become completion-archived with one synthesized event from their stored
completion metadata; manually archived tasks receive no completion event.

Use deterministic IDs or a durable mapping, checkpointed pages, dual reads/writes during
deployment, reconciliation counts, and an explicit cutover marker.

**Rationale**: This preserves users' top-level reporting meaning and loses no assignments.
Server-controlled mapping prevents different browsers from inventing conflicting Projects.

**Alternatives considered**: Making legacy categories Projects under a new `Legacy` Category
changes roll-ups. Making all old work unassigned destroys useful organization.

## 7. Authorization Model

**Decision**: Unify tasks with the shared List authorization semantics before aggregation.
Each ordinary record has one exclusive read audience—PUBLIC, GROUP, or OWNER when locked—plus
an ADMIN mirror. Every archive read, count, drill-down, report, search, feed, and attachment
request evaluates current actor status and group membership.

**Rationale**: Current task code treats public group-associated work too broadly while List
authorization is parent-aware. A single policy prevents drift and makes audience projections
deduplicated. Aggregating before authorization leaks existence through totals.

**Alternatives considered**: UI-only filtering and post-count filtering are unsafe. Project
permission alone cannot widen a task's own lock or ownership boundary.

## 8. Counts and Drill-down

**Decision**: Maintain transactional count and drill-down projection rows per exclusive
audience, Project, Category roll-up, and work type. Archive/delete decrements, restore
increments, and reassignment transfers. The browser derives offline totals in one pass from
the fully synchronized authorized cache using the same inclusion predicate as drill-down.

**Rationale**: This satisfies exact count/drill equality and the one-second target without
scanning 50,000 records. Exclusive audiences avoid duplicate contributions when a user owns
otherwise global or group-visible work.

**Alternatives considered**: On-demand scans are simpler but have unstable latency/cost.
Globally materialized counts leak inaccessible work. Independent UI predicates drift.

## 9. Completion Events and Reporting

**Decision**: Store a first-class completion event for each transition, with Task ID,
completing user, UTC occurrence, historical Category/Project IDs and safe display snapshots,
counted/reversal state, and links between reversal and original event. Preserve events through
archive and reassignment; remove their contribution on hard delete.

Reports query a bounded date range, then bucket events using a validated IANA time zone and an
explicit week-start value. Store Project end dates as `YYYY-MM-DD` calendar dates.

**Rationale**: Current `completedAt` and revisions cannot reliably describe reopen and
re-complete cycles or historical organization. Event timestamps allow rebucketing when a user
changes time zone; persisted week/month aggregates would not.

**Alternatives considered**: Deriving from current tasks loses history. Persisting only daily,
weekly, or monthly buckets prevents correct time-zone and locale changes.

## 10. Permanent-Delete Confirmation

**Decision**: Reserve HTTP DELETE for permanent deletion. First request a server deletion
preview containing the target identity, current version, dependent counts, blockers, reporting
impact, and a short-lived token bound to actor, resource, version, and dependency digest.
Confirm with CSRF, quoted `If-Match`, `Idempotency-Key`, and the token.

**Rationale**: The warning is based on authoritative current data, a stale confirmation cannot
delete a changed target, and replay can return a stable receipt after the resource disappears.

**Alternatives considered**: Client-only `{confirm:true}` or typed-name confirmation cannot
bind the warning to current dependents. A recycle bin is explicitly out of scope.

## 11. Permanent-Delete Execution

**Decision**: Hard delete is online-only and never enters sync push. A small target may delete
in one transaction; an unbounded task/List aggregate uses a checkpointed Step Functions
DeletionJob. The job locks the target, enumerates dependents, removes attachments and exact S3
versions, reverses projections, deletes revisions/events/current rows, emits audience
tombstones, and retains only a content-free receipt/audit/ledger fact. UI success waits for
final server completion.

Category and Project hard deletion is blocked unless strongly checked empty; it never cascades
into work. Name reservations are removed conditionally with the entity.

**Rationale**: A 1,000-item List plus attachments and history cannot fit a DynamoDB transaction.
Checkpointing makes retry idempotent and observable without turning deletion into soft delete.

**Alternatives considered**: Offline queued deletion can falsely appear final. A logical
deleted state is recoverable and functions as a recycle bin. Cascading organization deletion
is too easy to misuse.

## 12. Backup and Restore Semantics

**Decision**: Delete content from live DynamoDB/S3, exclude it from future recovery points,
and retain a content-free deletion ledger that every isolated restore must apply before any
traffic is allowed. Existing compliance-locked backups expire normally after 35 days; they
cannot be selectively modified. Restored content matching the ledger is purged before
validation succeeds.

**Rationale**: This provides permanent application-level deletion and no user-accessible
recycle path while respecting immutable backup controls. Claiming immediate physical erasure
from already locked recovery points would be false.

**Alternatives considered**: Weakening vault lock harms recovery guarantees. Ignoring the
ledger could resurrect deleted content during disaster recovery.

## 13. Offline Database and Synchronization

**Decision**: Upgrade Dexie from v7 to v8, adding encrypted Project and CompletionEvent stores
and safe clear indexes for lifecycle, Project ID, actor, occurrence, and reversal status.
Extend sync contract v3 with Project, CompletionEvent, DeletionJob status, and semantic
complete/archive/finish/restore operations. Do not decrypt/rewrite every record during the
Dexie upgrade; normalize lazily from server migration results.

**Rationale**: The established encrypted-store/outbox pattern protects content and preserves
pending work. A schema-only IndexedDB upgrade is safer on Safari and avoids long blocked
transactions. Authorization tombstones and confirmed deletion purge entities, derived search
documents, conflicts, and unauthorized pending mutations before cursor advancement.

**Alternatives considered**: A destructive cache rebuild can lose pending offline work.
Storing hard delete in the outbox violates confirmed-online semantics.

## 14. API and Contract Style

**Decision**: Publish an additive `/api/v1` OpenAPI contract using the existing session cookie,
CSRF, Problem Details, optimistic concurrency, and actor-scoped idempotency conventions.
Standardize new mutations on `Idempotency-Key` and quoted `If-Match`; retain the legacy
mutation header only as a transition alias.

**Rationale**: Existing repositories already use conditional transactions and durable replay
records. Enforcing preconditions prevents cross-device lost updates. Additive routes avoid a
needless API replacement.

**Alternatives considered**: GraphQL and API v2 add migration cost without solving a present
problem. Last-write-wins is unsafe for lifecycle and destructive operations.

## 15. Browser UX and Dates

**Decision**: Add Archive and Dashboard routes, an accessible two-level disclosure tree in
administration, grouped Project pickers with Unassigned, explicit to-do/List count labels,
end-date badges, and shared Category/Project filters. Search defaults to active and exposes an
explicit Archive scope. Format completion buckets with `Intl.DateTimeFormat(...).formatToParts`
rather than relying on Temporal; never parse a date-only Project end date as UTC midnight.

**Rationale**: The controls remain usable on keyboard, touch, screen readers, and Safari.
Shared selectors ensure badges and drill-down agree and date-only values do not shift by zone.

**Alternatives considered**: A flat admin table obscures hierarchy. Independent Category and
Project pickers permit conflicts. Temporal is not a safe current Safari baseline.

## 16. Observability and Verification

**Decision**: Add privacy-safe lifecycle, organization, completion, deletion, report,
migration, and restore-ledger events and alarms. Verify domain invariants, transaction replay,
authorization matrices, projection reconciliation, migration, DST bucketing, online-only
deletion, attachment purge, locked-backup restore gating, and complete Chromium/WebKit
responsive/offline/accessibility journeys.

**Rationale**: The highest risks cross browser, API, data, attachment, backup, and security
boundaries. Logs must diagnose outcomes without becoming a copy of protected content.

**Alternatives considered**: UI-only tests miss transactional and restoration failures;
payload logging violates the constitution.
