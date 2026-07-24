# Contract: Enhanced Synchronization Protocol

This document extends [the baseline sync contract](../../001-naaseh-v1-baseline/contracts/sync-protocol.md).
Baseline authentication, mutation IDs, versions, stable results, batching, retry, cursor, and
schema-evolution rules remain authoritative unless changed here.

## Entity Types

Contract version 2 adds:

```text
task | category | group | list | listItem | directoryItem | attachment | copyJob | accessControl
```

Attachment mutations synchronize metadata/lifecycle only. Upload capabilities, S3 keys,
versions, scan tags, checksums, and bytes never enter bootstrap or pull payloads.

## Audiences

- `PUBLIC#{00..15}`: unlocked ungrouped lists, public tasks, active directory items.
- `OWNER#{userId}`: owner-private content and user-specific access-control events.
- `GROUP#{groupId}`: unlocked lists assigned to the active group.
- `ADMIN#{00..15}`: all ordinary task/list/list-item/attachment metadata for administrators.
- Existing public administration feeds remain as defined in the baseline.

Ordinary pull uses public shards, caller owner feed, and feeds for current active memberships.
Administrator pull uses administrator shards plus globally required administration data.
Entity ID/version deduplication is mandatory.

## Mutation Envelope

```json
{
  "mutationId": "01...",
  "clientId": "01...",
  "entityType": "listItem",
  "entityId": "01...",
  "parentId": "01...",
  "operation": "patch",
  "baseVersion": 4,
  "clientCreatedAt": "2026-07-23T12:00:00Z",
  "payload": { "nameOverride": "Local name" }
}
```

`parentId` is required for listItem and attachment metadata mutations but is never trusted
for authorization; the server loads canonical parent relationships.

Semantic operations use explicit operation names:

- `complete` / `reopen`
- `lock` / `unlock`
- `resetOverrides`
- `reorder`
- `archive`
- `releaseAttachment`

## Stable Results and Conflicts

Results remain `applied`, `alreadyApplied`, `conflict`, `rejected`, or `retry`.

- Distinct fields changed since base version may merge.
- Same-field changes return a conflict.
- Separate list items never conflict merely because their parent list version changed.
- Same-item order-key changes conflict; display always sorts by `(orderKey,id)`.
- Completion/reopen is semantic and idempotent.
- Reset clears both overrides against the current active directory item. If it was archived,
  return `conflict` with reason `directory_archived`.
- Archive/delete versus update never auto-merges.
- Authorization changes return `rejected: authorization_changed`; pending local work remains
  recoverable but cannot be uploaded.
- Copy jobs use their mutation ID as idempotency identity and deterministic child IDs.

## Atomic Server Commit

A normal accepted mutation transaction contains:

1. canonical current record;
2. immutable revision;
3. stable actor-scoped mutation result;
4. every required audience counter and upsert/tombstone.

A change must never become visible without its feed records. When the number of writes exceeds
one transaction, an unpublished CopyJob owns chunked progress; no destination feed upsert is
written until all child and BlobReference records are complete.

## Visibility Transitions

Examples:

- global list → group: public tombstone, group upsert, admin upsert;
- group A → group B: group A tombstone, group B upsert, admin upsert;
- group → locked: group tombstone, owner/admin upsert;
- locked → prior group: group upsert, owner/admin upsert;
- list archive: tombstones to every prior audience;
- task public ↔ private: baseline public/owner transition plus admin upsert;
- attachment lifecycle update: same audiences as its current parent.

Tombstones contain only identifiers already known to that audience and no protected fields.

## Access-Control Events and Purge

Membership revocation, session/role change, and forced rebootstrap use `accessControl` changes
on the affected owner's feed. A group revocation includes only group ID and safe sequence.

Before advancing the cursor, the browser atomically:

1. removes lists/items/attachment metadata for that group;
2. removes their MiniSearch documents and counts;
3. revokes in-memory object URLs/download capabilities;
4. moves unauthorized pending mutations to a quarantined conflict/recovery view;
5. commits the access event and cursor.

Lock transitions use ordinary group tombstones with the same purge ordering. Unauthorized
content may never remain visible after cursor advancement.

## Browser Commit

Pull parses by entity type and writes encrypted records to the corresponding Dexie store.
The transaction includes all entity upserts, tombstones, derived purge work, and cursor
advancement. A parsing, quota, or encryption failure aborts the entire pull transaction.

Directory updates cause effective linked fields/totals to recompute and linked item search
documents to reindex after the entity transaction. Search is marked rebuilding until derived
work is complete; stale values are not presented as current.

## Offline Attachments

Attachment metadata and deletion intent may use sync. File initiation, byte upload, completion,
and download are connected control-plane operations. Offline file selection is deferred; the
browser never places arbitrary bytes into the encrypted outbox or service-worker cache.

## Schema Evolution

Contract version 2 bootstrap advertises encrypted-store schema requirements. A v1 client enters
update-required read-only mode before receiving group-restricted or administrator feed data.
Migration creates new stores without dropping the existing outbox. Query text and protected
file data never enter migration diagnostics.

