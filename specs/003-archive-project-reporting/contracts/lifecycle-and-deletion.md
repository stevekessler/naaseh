# Contract: Lifecycle and Permanent Deletion

## Lifecycle Semantics

- Archive changes the authoritative record; it does not copy or delete content.
- Completing a Task means one operation: set completed, archive with reason `completed`,
  create a counted CompletionEvent, update projections, write a revision and replay receipt,
  and publish feed changes.
- Reopening a completion-archived Task means one operation: restore active/open, reverse the
  current CompletionEvent, update projections, write revision/receipt, and publish feeds.
- Manual Task archive does not create completion credit.
- Finishing a List archives the parent with reason `finished`. Manual List archive uses reason
  `manual`. List Items inherit lifecycle and are never top-level archive entries.
- Archive and restore preserve owner, group, lock/privacy, Project, attachment, and history.
- Archived work is read-only until restored.

## Mutation Requirements

All lifecycle mutations require:

- authenticated active session;
- current resource authorization;
- same-origin CSRF token;
- quoted current version in `If-Match`;
- actor-scoped `Idempotency-Key`;
- a semantic operation rather than an arbitrary status patch.

Missing `If-Match` returns `428`. A stale version, invalid parent lifecycle, conflicting
assignment, or changed request under the same idempotency key returns `409`. Exact replay
returns the durable prior result.

## Permanent-Delete Preview

Permanent deletion is a two-step online-only workflow.

1. Client requests `{resource}/deletion-preview`.
2. Server loads canonical current state and authorizes the actor.
3. Server computes target label, current version, dependent counts/types, reporting impact,
   blockers, and a dependency digest.
4. Server returns `irreversible=true` plus a short-lived signed confirmation token bound to
   actor, resource type/ID, version, digest, and expiry.
5. UI displays the server label, every affected dependency class/count, reporting impact,
   “cannot be recovered,” and distinct Cancel and Permanently delete actions.

The confirmation token and preview are `Cache-Control: no-store` and must never be logged,
persisted to IndexedDB, placed in URLs, or synchronized.

## Permanent-Delete Confirmation

`DELETE {resource}` requires:

- CSRF token;
- quoted `If-Match` equal to previewed version;
- `Idempotency-Key`;
- `X-Deletion-Confirmation` token.

The server reauthorizes and recomputes the dependency digest. Expired, actor-mismatched,
resource-mismatched, changed-version, or changed-dependency tokens return a safe conflict and
delete nothing. Category/Project confirmation returns `delete_blocked` if any Project, work,
archive/history reference, projection pointer, or pending job remains.

Hard delete is never accepted in `/sync/push`. An offline client disables confirmation and
does not remove local records. Pending mutations affecting the target or its dependents must be
resolved before confirmation.

## DeletionJob

Task/List confirmation normally returns `202` with a safe DeletionJob. Small bounded targets
may complete synchronously only if they meet the same job invariants.

Stages:

1. **locking**: conditionally set server-owned `deleting`; prevent edits/restores and verify
   preview version/digest.
2. **purging**: enumerate and remove child records, revisions, CompletionEvents, completion
   and workload projections, mutation/search pointers, attachment references, and exact S3
   object versions when no other valid reference remains.
3. **publishing**: write a content-free deletion receipt/audit/ledger entry and audience
   tombstones; no protected payload enters a tombstone.
4. **complete**: remove the current entity and mark the job complete. Only now may the client
   display final success and purge local state.

Each stage/checkpoint is idempotent. A failed job remains inaccessible and retryable by the
service; operators receive a safe code and alarm. The UI shows pending/failure state and never
calls a partial job complete.

## Category and Project Deletion

- Administration privilege is required.
- Deletion never cascades into a Project or work record.
- Strong emptiness checks are repeated during confirmation.
- Entity and canonical name reservation are removed in one conditional transaction.
- A stable content-free receipt makes exact retry successful after removal.

## Browser Purge

After a confirmed tombstone/job completion, one IndexedDB transaction removes:

- target and dependent encrypted records;
- associated conflicts and unauthorized pending mutations;
- MiniSearch documents and derived count/report cache;
- in-memory attachment URLs/capabilities;
- then advances the sync cursor.

The browser may retain only a content-free notice that deletion completed. It must not keep a
recoverable encrypted snapshot.

## Backups and Restore

Live application rows and attachment versions are purged. Already-created 35-day
compliance-locked recovery points cannot be selectively edited and expire normally. A
content-free DeletionLedger is copied into restore control material and must be applied to an
isolated restore before access, search, report, or integrity validation. Any restored target or
dependent matching the ledger is re-purged; a ledger failure blocks restore exposure.

This is permanent application deletion with no user recycle bin. Backup infrastructure is not
an application restoration path for deleted content.

## Audit and Observability

Durable audit facts contain actor ID, target type/ID, operation, time, result, job ID, and safe
dependent counts. CloudWatch events add correlation ID, latency, stage, and safe error class.
Never record labels, names, task/list content, attachment metadata supplied by users,
confirmation tokens, dependency IDs, or report values.

Metrics/alarms cover preview denials, stale confirmations, blocked organization deletes,
deletion job failures/age, attachment purge mismatches, projection reversal failures,
tombstone publication failures, and restore-ledger enforcement.
