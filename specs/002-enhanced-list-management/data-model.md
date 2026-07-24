# Data Model: Enhanced List Management

## Conventions

- Identifiers are ULIDs and immutable after creation.
- Timestamps are ISO 8601 UTC.
- Every mutable domain record has a positive integer `version` used for optimistic concurrency.
- User-acknowledged mutations have immutable revisions and idempotent mutation results.
- Deletion is an archived/deleted state plus authorized feed tombstones; physical cleanup follows
  retention and recovery rules.
- Monetary values are signed integer minor units in the deployment's configured ISO currency.
- S3 object keys, signed URLs, and file bytes never appear in synchronized domain views.

## Authorization Matrix

| Resource | Owner | Active global user | Active group member | Administrator | Mutation authority |
|---|---:|---:|---:|---:|---|
| Unlocked ungrouped list/items | Yes | Yes | Yes | Yes, audited | Owner only |
| Unlocked group list/items | Yes | No | Yes | Yes, audited | Owner only |
| Locked list/items | Yes | No | No | Yes, audited | Owner only |
| Public task/subtask | Yes | Yes | Yes | Yes | Existing owner-only rules |
| Private/locked task/subtask | Yes | No | No | Yes, audited | Existing owner-only rules |
| Global directory item | Yes | Yes | Yes | Yes | Every active user |
| Attachment | Inherits parent | Inherits parent | Inherits parent | Inherits parent, audited | Parent editor only |
| Copy of accessible list | May copy | May copy | May copy | May copy | Copy owned by caller |
| CSV export | N/A | No | No | IAM-authorized operator | Export workflow only |

Hidden memo plaintext remains outside administrator ordinary-content access and requires the
existing PIN/recovery decryption boundary.

## List

| Field | Type | Rules |
|---|---|---|
| id | ULID | Immutable |
| ownerId | User ID | Immutable; active user at creation |
| name | string | Trimmed, 1–300 characters |
| groupId | Group ID or null | Retained while locked; active group controlled by owner |
| locked | boolean | Default false; takes precedence over group |
| status | active / archived | Archived lists are not discoverable |
| createdAt / updatedAt | timestamp | Server-canonical |
| version | integer | Starts at 1; increments per accepted mutation |

**Derived audience**:

1. Owner and administrator always qualify for reads.
2. If `locked`, no non-owner ordinary audience.
3. Else if `groupId`, current active members of that group.
4. Else all active users.

**Transitions**:

- create → active/unlocked/ungrouped
- active ↔ locked, preserving `groupId`
- active group assignment/change/removal by owner
- active → archived; restoration is an explicit later operation
- copy job publishes a new active/unlocked/ungrouped list owned by requester

## ListItem

| Field | Type | Rules |
|---|---|---|
| id | ULID | Immutable |
| listId | List ID | Immutable; authorization always loads parent |
| orderKey | opaque sortable string | Compare `(orderKey,id)`; bounded rebalance allowed |
| status | open / completed / removed | Removed is a retained tombstone state |
| directoryItemId | ULID or null | Links to active/archived directory record |
| directorySnapshot | object or null | Last name, amount, and directory version observed |
| nameOverride | string or absent | Trimmed, 1–300 characters when present |
| valueOverride | absent / none / amount | Absent inherits; none is explicitly unvalued |
| valueOverride.amountMinor | safe integer | Required only for amount variant |
| completedAt / completedBy | timestamp/User ID or null | Both present only when completed |
| createdAt / updatedAt | timestamp | Server-canonical |
| version | integer | Independent optimistic version |

For an unlinked item, the locally authored name and optional value are stored as the snapshot
and treated as its base values. Linking records the current directory snapshot. Effective
name/value resolution is override → current directory record → retained snapshot.

**Invariants**:

- An item belongs to exactly one list and cannot become a task.
- Completion metadata is all-present only in `completed`.
- Reset clears both overrides and requires an active linked directory item.
- Completed items continue contributing to total.
- Removal does not remove referenced attachment bytes before retention/reference checks.
- Reorder changes only the moved item's order key except during bounded deterministic rebalance.

## GlobalDirectoryItem

| Field | Type | Rules |
|---|---|---|
| id | ULID | Immutable |
| name | string | Trimmed, 1–300; need not be unique |
| amountMinor | safe integer or null | Negative cost, positive credit, null absent |
| currency | ISO 4217 code | Must equal deployment currency |
| status | active / archived | Archived entries cannot be newly linked/reset |
| createdBy / updatedBy | User ID | Active actor |
| createdAt / updatedAt | timestamp | Server-canonical |
| version | integer | Optimistic concurrency |

Every active user can create, edit, or archive directory entries. Every mutation is revised and
audited. Archiving preserves resolution snapshots for linked list items.

## Task Extension

The existing Task retains `visibility: public | private`. The UI maps private to locked and
public to unlocked, using accessible icons. Read authorization changes to:

```text
public OR actor is owner OR actor has active admin role
```

The administrator branch emits an audit event. Group association remains organizational for
tasks. Hidden memo ciphertext may be visible under ordinary task access, but plaintext still
requires existing decryption authority.

## Attachment

| Field | Type | Rules |
|---|---|---|
| id | ULID | Immutable; one parent |
| parentType | task / listItem | Immutable |
| parentId | ULID | Immutable; parent-first authorization |
| blobId | ULID | Set after upload initiation; never exposed as S3 key |
| originalFilename | string | Sanitized display name, 1–255 |
| mediaType | allowlisted string | Verified against extension/signature |
| sizeBytes | integer | 1 through 25 MiB |
| checksumSha256 | string | Canonical base64/hex contract value |
| uploaderId | User ID | Immutable |
| status | AttachmentStatus | See transitions |
| failureCode | safe enum or null | No scanner internals/content |
| createdAt / updatedAt | timestamp | Server-canonical |
| version | integer | Optimistic version |

**AttachmentStatus**:

```text
pending_upload → scanning → available
       │             ├──→ scan_failed
       ├──→ expired  └──→ rejected
       └──→ cancelled
available → deleted
scan_failed → scanning (authorized retry)
```

Only `available` is downloadable or copyable. Threat-positive objects become inaccessible
immediately. Metadata synchronizes; S3 key/version/tags and signed URLs do not.

## AttachmentBlob and BlobReference

**AttachmentBlob** is immutable after clean finalization except lifecycle state:

| Field | Type | Rules |
|---|---|---|
| blobId | ULID | Opaque identity |
| objectKey | string | `attachments/{blobId}`; server-only |
| objectVersionId | string | Exact clean version; server-only |
| sizeBytes / checksumSha256 | scalar | Must match Attachment |
| encryptionKeyArn | string | Server/recovery metadata |
| scanStatus / scannedAt | enum/timestamp | GuardDuty result |
| lifecycle | uploading / scanning / clean / quarantined / deleting / deleted | Controlled transitions |
| createdAt / updatedAt | timestamp | Server-canonical |

**BlobReference** uses `(blobId, attachmentId)` as identity. Creating a list copy adds new
Attachment and BlobReference records to an already-clean blob. Direct deduplication across
unrelated uploads is prohibited. Blob deletion begins only when no live references remain.

## AttachmentUploadSession

| Field | Type | Rules |
|---|---|---|
| id | ULID | Upload/idempotency identity |
| attachmentId / blobId | ULID | Immutable |
| actorId / parent identity | IDs | Authorization context |
| expected size/type/checksum | scalar | Bound into upload contract |
| expiresAt | timestamp/TTL | Five minutes for capability; stale cleanup after one hour |
| status | initiated / uploaded / completed / expired / cancelled | Idempotent |

A replay with the same mutation/idempotency identity returns the same stable session/result.

## CopyJob

| Field | Type | Rules |
|---|---|---|
| id | ULID | Idempotency identity |
| sourceListId / sourceVersion | identity/version | Snapshot basis |
| destinationListId | ULID | Hidden until ready |
| requestedBy | User ID | Destination owner |
| status | pending / copying / ready / failed | Terminal result stable |
| itemCount / copiedCount | integer | Progress |
| attachmentCount / linkedCount | integer | Progress |
| checkpoint | opaque | Server-only resume state |
| errorCode | safe enum or null | No protected content |
| createdAt / updatedAt | timestamp | Server-canonical |

Destination IDs derive deterministically from job/source IDs so retries do not duplicate items.
A failed or incomplete destination never enters authorized feeds/search.

## ExportJob

| Field | Type | Rules |
|---|---|---|
| id | ULID | Stable idempotency identity |
| requestedByPrincipal | safe IAM principal ID | Never credentials |
| status | pending / exporting / transforming / ready / acknowledged / expired / failed | Workflow |
| snapshotTime | timestamp | Exact DynamoDB export point |
| rowCount / byteLength / sha256 | scalar | Required at ready |
| stagingPrefix / resultKey | server-only | Never logged or returned except short capability |
| downloadExpiresAt | timestamp | Short-lived |
| createdAt / updatedAt | timestamp | Server-canonical |
| failureCode | safe enum or null | Actionable classification |

Raw table export can contain unrelated protected records. It is accessible only to workflow
roles, encrypted with the export key, deleted promptly after transformation, and lifecycle
expired within 24 hours. CSV never contains password/session records or raw S3 identifiers.

## Revision and Audit Records

A generic EntityRevision records entity type/ID, version, mutation ID, actor, time, operation,
changed fields, safe before/after values, source client, and sync outcome. Protected names,
memos, attachment filenames, and file content are not written into operational logs.

Administrator content reads, attachment access, lock/group changes, directory mutations,
copy/export operations, threats, and denials emit structured audit events with safe IDs and
outcomes. Audit logs retain 90 days.

## DynamoDB Access Patterns

The existing single-table design is extended; exact physical attribute names are finalized with
contract schemas.

| Pattern | Key/index |
|---|---|
| List current | `PK=LIST#{id}, SK=CURRENT` |
| List revisions/items | `PK=LIST#{id}, SK=REV#... / ITEM#{orderKey}#{id}` |
| ListItem direct current | `PK=LISTITEM#{id}, SK=CURRENT` plus parent reference |
| Directory current/revisions | `PK=DIRECTORY#{id}, SK=CURRENT / REV#...` |
| Attachment current | `PK=ATTACHMENT#{id}, SK=CURRENT` |
| Attachments by parent | GSI partition `ATTACHMENT#PARENT#{type}#{id}` |
| Blob and references | `PK=BLOB#{id}, SK=METADATA / REF#{attachmentId}` |
| Stale lifecycle reconciliation | GSI partition by lifecycle/status and timestamp |
| Copy/export job | `PK=COPY#{id}` or `EXPORT#{id}, SK=JOB` |
| Feed | existing `PK=FEED#{audience}, SK=CHANGE#{sequence}` |
| Mutation result | existing actor-scoped mutation key |

Feed audiences are sharded `PUBLIC#{shard}`, `ADMIN#{shard}`, `OWNER#{userId}`, and
`GROUP#{groupId}`. Client bootstrap/pull unions authorized feeds and deduplicates entity ID
plus version. A mutation transaction writes canonical entity, revision, stable result, and all
audience counter/change entries; if the transaction limit would be exceeded, an unpublished
job/checkpoint owns the multi-transaction workflow.

## Browser Storage and Search Documents

The next Dexie schema adds encrypted stores for lists, list items, directory items, attachment
metadata, and job state. Only routing/filter fields needed for local queries remain outside
ciphertext. File bytes, signed URLs, S3 keys, checksums, names, and query terms are never stored
in the service-worker cache.

Search document identities:

- `task:{taskId}`
- `list:{listId}`
- `list-item:{itemId}` with `parentListId`

List-item hits are grouped by parent. Directory changes reindex linked items. Authorization
tombstones purge entity stores and search documents atomically before cursor advancement.

