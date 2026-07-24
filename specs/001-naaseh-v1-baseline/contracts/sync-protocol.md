# Contract: Offline Synchronization Protocol

## Goals

- Every locally acknowledged mutation is durable until applied, explicitly rejected, or resolved.
- Replays are idempotent and cannot create duplicate revisions.
- Private tasks never enter another user's bootstrap or feed.
- Conflicts never silently discard user-entered text or memo ciphertext.

## Bootstrap

`GET /api/v1/sync/bootstrap` returns the complete authorized working set, a schema version,
server time, current user/session epoch, KMS public wrapping-key registry, and a cursor vector.
The server queries the public visibility index plus the caller's private-owner index; it does
not scan all private tasks and filter them in memory.

The client replaces a prior local snapshot only after the new snapshot and cursor commit in
one IndexedDB transaction. Interrupted bootstrap leaves the prior valid snapshot intact.

## Push

`POST /api/v1/sync/push` accepts at most 100 ordered mutations and 1 MiB. Each mutation has:

```json
{
  "mutationId": "01...",
  "clientId": "01...",
  "entityType": "task",
  "entityId": "01...",
  "operation": "patch",
  "baseVersion": 7,
  "clientCreatedAt": "2026-07-22T12:00:00Z",
  "payload": { "label": "Updated label" }
}
```

For each mutation the server returns one stable result:

- `applied`: new version and canonical record.
- `alreadyApplied`: the original stable success response.
- `conflict`: HTTP batch response remains 200, item result includes current record/version,
  conflicting fields, and safe proposed payload.
- `rejected`: validation/authorization error that will not succeed unchanged.
- `retry`: transient failure with retry guidance.

Mutations for one entity remain ordered. Independent entities may run concurrently. A
create uses `baseVersion=0`; update/delete operations require the last observed version.

For an accepted task mutation, the canonical task, immutable revision, stable mutation
result, every required feed tombstone/upsert, and each affected feed-counter advance commit
in one DynamoDB transaction. The writer first reads the affected counter values and then
conditionally advances those exact values inside the transaction. A concurrent counter
change causes the whole mutation to retry with fresh values. Therefore a successful task
commit can never exist without its feed changes, and clients can safely advance cursors
without missing a late record. Counter gaps and out-of-order post-commit feed insertion are
not permitted.

## Conflict Rules

1. If `baseVersion` equals current version, apply normally.
2. If the same mutation ID already exists, return its stored result.
3. If changed field sets since `baseVersion` do not overlap, the server may merge and append
   a revision identifying both sources.
4. Same-field edits, memo changes, privacy changes, and update-versus-archive/delete never
   auto-merge. Return a conflict record.
5. Completion/reopen are semantic idempotent operations, not blind object replacement.
6. User resolution creates a new mutation against the current server version; history keeps
   both inputs and the selected resolution.

## Pull

`POST /api/v1/sync/pull` accepts the cursor vector and a per-feed limit. The server queries:

- all 16 `PUBLIC` feed shards;
- the authenticated user's `OWNER#{userId}` feed;
- public administration feeds for users/categories/groups as applicable.

It returns ordered changes per feed/shard and the next vector. The client commits entity
changes and cursor advances atomically. Repeating a pull is safe.

Visibility transitions emit paired changes:

- public to private: public tombstone + owner-feed upsert;
- private to public: owner-feed tombstone + public upsert;
- user disable/session epoch change: authorization tombstone causing local purge/lock.

Tombstones never include private labels, memos, revision values, or existence metadata beyond
the identifier already known to the authorized client.

## Drain Triggers and Retry

Drain on app startup, page visibility, browser `online`, successful foreground requests, and
manual retry. Feature-detected Background Sync may trigger an additional drain but is not
required. Use exponential backoff with full jitter, honor `Retry-After`, and stop automatic
retry for permanent validation/authorization failures.

## Schema Evolution

Every request includes `contractVersion`; bootstrap includes minimum and current supported
versions. Breaking changes require a migration that preserves the outbox. A client below the
minimum version enters read-only/update-required mode without dropping unsynced mutations.
