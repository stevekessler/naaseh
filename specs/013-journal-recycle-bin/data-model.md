# Data Model: Journal Recycle Bin

## Encrypted Journal projection v2

| Field | Type | Protection | Rules |
|---|---|---|---|
| `schemaVersion` | `2` | ciphertext | v1 decrypts as active |
| `entryId` | UUID | authenticated envelope | stable across recycle/restore |
| `date` | local date | ciphertext | unchanged across lifecycle |
| `title/summary/answers` | existing projection fields | ciphertext | unchanged by lifecycle-only mutations |
| `lifecycle` | `active \| recycled` | ciphertext | user-visible source of truth |
| `recycledAt` | ISO timestamp or absent | ciphertext | required exactly when recycled |

The existing encrypted body schema remains unchanged. AES-GCM AAD continues binding owner,
entry, kind, schema/key versions, and opaque date token.

## Server Journal entry control record

Existing `PK=JOURNAL#OWNER#{ownerId}`, `SK=ENTRY#{entryId}` gains:

| Field | Type | Rules |
|---|---|---|
| `lifecycleState` | `active \| recycled \| deleting` | authoritative transition control; never used as UI plaintext |
| `version` | positive integer | increments for every accepted mutation |
| `projection/body` | encrypted envelope | absent only after hard deletion |
| `dateToken` | opaque digest/token | immutable and never logged |
| `updatedAt` | ISO timestamp | operational ordering only |

Existing records without `lifecycleState` are interpreted and backfilled as `active` on their
next successful mutation; deployment performs no destructive migration.

## Date reservation

`SK=DATE#{dateToken}` remains present while an entry is active, recycled, or deleting. It
continues pointing to the stable UUID. It is removed only in the atomic hard-delete finalization.

## Journal lifecycle mutation

| Field | Type | Rules |
|---|---|---|
| `mutationId` | UUID | idempotency key |
| `entryId` | UUID | owner-scoped |
| `operation` | `upsert \| recycle \| restore` | explicit intent |
| `baseVersion` | nonnegative integer | optimistic concurrency |
| `projection/body` | encrypted envelopes | required for state-bearing mutations |
| `dateToken` | opaque token | must match existing reservation after creation |
| `contractVersion` | integer | rejects unsupported clients |

Valid transitions are `active -> recycled`, `recycled -> active`, active-to-active upsert, and
idempotent retry of the already-applied mutation. Edits to recycled/deleting entries, restore of
active entries under a different mutation, and all mutations after a deletion ledger match are
rejected with stable safe codes.

## Local encrypted entry

The existing `secureJournalEntries` row retains encrypted envelopes and top-level owner,
entry ID, opaque date token, version, and sync state. It gains indexable lifecycle control used
only to divide active and recycled rows locally; user-visible timestamp remains encrypted.
Pending rows cannot be replaced by pull. A permanent tombstone removes the entry plus matching
outbox/conflict records in one Dexie transaction.

## Owner feed change

| Operation | Payload | Result |
|---|---|---|
| `upsert` | encrypted projection/body | write active entry |
| `recycle` | encrypted projection/body | write recycled entry |
| `restore` | encrypted projection/body | write active entry |
| `tombstone` | none | purge local entry/outbox/conflicts |

Feed cursors remain paginated and monotonic. Pull applies all pages in order. A local pending
mutation produces a conflict rather than overwrite.

## Permanent deletion job

The existing durable job schema accepts resource type `journalEntry` and UUID identifiers.
Its dependency digest and preview contain no plaintext/date token. Journal checkpoints are:
`locked`, `feedHistory`, `receipts`, `finalized`, `verified`, `complete`. Failure stores a safe
code and resume checkpoint. Preview is valid only for the authenticated owner, a recycled entry,
the expected version, and an unexpired HMAC-bound token.

## Deletion ledger and tombstone

The ledger holds `resourceType=journalEntry`, UUID, owner-scoped digest (not plaintext owner ID
when avoidable), deletion time, job ID, scope digest, and ledger version. No ciphertext, date,
date token, title, or body is retained. A content-free owner-feed tombstone makes connected stale
clients purge. Every new Journal mutation checks the ledger/tombstone authority first.

## Restore invariants

- A ledger-matched UUID has no ENTRY row, DATE pointer, or ciphertext-bearing FEED row after
  remediation.
- Active/recycled entries have exactly one date reservation and consistent owner/UUID/version.
- Recycled entries never enter active projections, dashboard values, streaks, or prerequisites.
- Deleting is not user-readable and can only resume or complete the deletion workflow.
- Receipts and tombstones contain no protected Journal content.
