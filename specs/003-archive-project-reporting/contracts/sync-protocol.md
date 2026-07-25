# Contract: Archive and Project Synchronization Protocol

This document extends the [enhanced synchronization contract](../../002-enhanced-list-management/contracts/sync-protocol.md).
Authentication, mutation IDs, versions, stable results, feed sequencing, retry, conflicts,
cursor behavior, and encrypted browser storage remain authoritative unless changed here.

## Contract Version 3

New synchronized entity types:

```text
project | completionEvent | deletionJob
```

Category, Task, List, and List Item payloads gain the fields defined in
[data-model.md](../data-model.md). Deletion confirmation tokens, DeletionLedger entries,
projection internals, S3 identifiers, and report responses never enter synchronization.

## Semantic Operations

Version 3 adds:

```text
completeAndArchive | reopenAndRestore | archive | finish | restore | assignProject
archiveOrganization | restoreOrganization
```

Hard delete is intentionally absent. A sync mutation whose operation requests permanent
deletion is rejected without changing state.

## Atomic Accepted Mutation

An accepted semantic mutation contains, as applicable:

1. authoritative current entity;
2. immutable revision;
3. CompletionEvent create or reversal;
4. workload/completion projection adjustments;
5. actor-scoped stable mutation result;
6. audience feed upserts/tombstones.

No completion may become visible without archive state and its event/projection, and no count
may change without the corresponding authoritative state.

List archive/restore changes only the parent record. List Item clients derive effective
lifecycle and Project/Category through their synchronized parent.

## Audiences and Authorization

Use exclusive ordinary content audiences plus administrator mirror:

- `PUBLIC#{shard}` for unlocked ungrouped public work;
- `GROUP#{groupId}#{shard}` for unlocked group work;
- `OWNER#{userId}` for locked/private owner content and user-specific events;
- `ADMIN#{shard}` for explicit administrator oversight;
- existing administration feeds for authorized Category/Project metadata.

CompletionEvents travel only on feeds authorized for the credited user/reporting actor and
must not reveal inaccessible Task or organization content. Counts are not synchronized as
global totals; the browser derives them from authorized records/events.

## Conflict Rules

- `completeAndArchive` and `reopenAndRestore` are indivisible semantic operations.
- Exact replay returns the stored result and cannot create a second CompletionEvent.
- Same-resource edit/lifecycle changes from a stale base version return conflict.
- Assignment to an archived Project or a Project under an archived Category is rejected with
  an actionable, content-safe conflict.
- Project rename/move conflicts on the scoped canonical name reservation.
- Category archive does not rewrite child Project lifecycle; effective availability is derived.
- Archive/delete versus update never auto-merges.
- Authorization change quarantines pending local content and prevents upload.
- Confirmed hard deletion wins over any stale local mutation and purges its conflict snapshot.

## Version 2 Compatibility and Migration

During bounded rollout:

1. Server accepts v2 payloads and resolves legacy `categoryId` through the durable
   Category→`General` Project mapping.
2. Server dual-writes compatible fields/revisions while the checkpointed backfill runs.
3. Bootstrap advertises minimum/maximum contract and migration status.
4. A v3 client uses server-provided Project IDs and never creates local legacy mappings.
5. After reconciliation and compatible-client adoption, legacy writes are refused with an
   upgrade-required response; legacy reads remain for the documented rollback window.

Existing completed Tasks receive one synthesized CompletionEvent keyed deterministically from
Task ID/version so migration replay cannot duplicate credit.

## Browser Schema v8 Commit

Pull processing for v3 atomically commits:

- encrypted Category, Project, Task, List, List Item, CompletionEvent, and DeletionJob upserts;
- lifecycle/authorization/deletion tombstones;
- removal of affected MiniSearch documents and derived count/report cache;
- quarantine or removal of invalid pending mutations/conflicts;
- the merged cursor.

The Dexie upgrade adds stores/indexes only. Payload transformation happens lazily during
validated pull/read so Safari is not held in a long asynchronous version-change transaction.

## Hard-Delete Notification

Hard delete starts through the direct API, not outbox. While a DeletionJob is pending, the
browser may synchronize safe job status but retains content in a locked, non-editable pending
state. Final audience tombstones trigger the atomic purge before cursor advancement. A client
that misses job polling still converges through feeds.

## Offline UX

- Archive, restore, completion/reopen, assignment, and allowed hierarchy edits queue safely.
- Project tree, archive, counts, and completion dashboard remain readable from the last fully
  synchronized authorized cache and display synchronization age/pending state.
- Hard-delete preview/confirm is disabled offline and no destructive outbox entry is created.
- Storage failure or conflict preserves pending non-destructive work and shows an actionable
  status; it never silently drops or falsely confirms it.

## Required Tests

- v2→v3 compatibility and cutoff;
- deterministic legacy mapping and synthesized-event idempotency;
- atomic complete/archive/event/projection/feed behavior;
- parent-only List archive with 1,000 Items;
- same-name Projects under different Categories and sibling collision;
- archive/assignment conflicts;
- membership/lock/admin feed authorization and purge;
- DeletionJob pending/final tombstones and stale local mutation removal;
- Dexie v7→v8 preservation of encrypted records, cursor, conflicts, and outbox;
- Chromium/WebKit offline restart, reconnect, and conflict journeys.
