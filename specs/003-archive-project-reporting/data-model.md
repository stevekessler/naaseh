# Data Model: Archive, Projects, and Completion Reporting

## Conventions

- IDs are ULIDs and immutable.
- Timestamps are ISO 8601 UTC strings; Project end dates are `YYYY-MM-DD` calendar dates.
- Every mutable entity has a positive integer `version` used for optimistic concurrency.
- Names are stored in display form and reserved with an NFKC-normalized, trimmed,
  case-insensitive canonical form.
- Protected labels, names, descriptions, and report values remain encrypted in the browser.
- `projectId` is the sole work assignment. Category is resolved through Project and cannot be
  supplied independently by a work mutation.
- Archive is lifecycle state, not a separate copy. Permanent deletion removes the business
  entity; content-free audit, receipt, and restore-ledger facts are not business records.

## Category

Top-level organizational node.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `name` | string | 1–80 characters; unique across Categories after canonicalization |
| `color` | hex color | Existing accessible Category color behavior |
| `defaultAssigneeId` | user ID, optional | Must reference an eligible active user when set |
| `groupId` | group ID, optional | Preserved access/organization metadata; cannot widen linked content access |
| `lifecycle` | `active` or `archived` | Archived Category cannot accept assignments through its Projects |
| `archivedAt` | UTC timestamp, optional | Required exactly when archived |
| `archivedBy` | user ID, optional | Required exactly when archived |
| `createdAt` | UTC timestamp | Immutable |
| `updatedAt` | UTC timestamp | Changes on mutation |
| `version` | positive integer | Incremented on mutation |

### Category validation

- Category names are globally unique after canonicalization.
- A Category has no parent and may contain zero or more Projects.
- Archive does not mutate child Project lifecycle values; it makes them effectively
  unavailable for assignment.
- Restore re-enables only child Projects whose own lifecycle is active.
- Permanent deletion is allowed only when there are no Projects, work assignments, archive
  references, completion-event references, projection pointers, or pending mutations/jobs.

### Category state transitions

```text
active --archive(admin)--> archived
archived --restore(admin)--> active
active|archived --hard delete preview + confirm(admin, empty)--> absent
```

## Project

Second-level organizational node and the only assignable classification.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `categoryId` | Category ULID | Required; exactly one active or archived parent |
| `name` | string | 1–80 characters; unique among siblings after canonicalization |
| `endDate` | `YYYY-MM-DD`, optional | Calendar date; no time-zone conversion in storage |
| `groupId` | group ID, optional | Preserved access/organization metadata; does not widen work access |
| `lifecycle` | `active` or `archived` | Own lifecycle state |
| `archivedAt` | UTC timestamp, optional | Required exactly when archived |
| `archivedBy` | user ID, optional | Required exactly when archived |
| `createdAt` | UTC timestamp | Immutable |
| `updatedAt` | UTC timestamp | Changes on mutation |
| `version` | positive integer | Incremented on mutation |

### Project validation

- A Project always has one Category; a third hierarchy level is invalid.
- Canonical name reservation is scoped to `(categoryId, canonicalName)`.
- Moving a Project to another Category is an edit that atomically changes its scoped name
  reservation and fails if the destination has the same canonical name.
- A Project is assignable only when both it and its parent Category are active and the actor
  has applicable assignment/read permission.
- Restoring a Project while its Category is archived does not make it assignable; the API
  reports the effective parent block.
- Permanent deletion is allowed only with no active/archived work, completion history,
  projection pointers, or pending mutations/jobs referring to it.

### Project state transitions

```text
active --archive(admin)--> archived
archived --restore(admin)--> active (effective availability still depends on Category)
active|archived --hard delete preview + confirm(admin, empty)--> absent
```

## Task

Existing Task/Subtask extended with orthogonal classification, completion, and lifecycle.

### Changed fields

| Field | Type | Rules |
|---|---|---|
| `projectId` | Project ULID, optional | Replaces current assignable `categoryId`; absent means Unassigned |
| `completionState` | `open` or `completed` | Independent from lifecycle |
| `lifecycle` | `active`, `archived`, or `deleting` | `deleting` is server-owned and inaccessible to ordinary reads |
| `archiveReason` | `completed` or `manual`, optional | Required when archived |
| `archivedAt` | UTC timestamp, optional | Required when archived/deleting from archived |
| `archivedBy` | user ID, optional | Required when archived |
| `completedAt` | UTC timestamp, optional | Required when completed |
| `completedBy` | user ID, optional | Required when completed |
| `currentCompletionEventId` | CompletionEvent ULID, optional | Required when completion is currently counted |

All existing owner, group, privacy/lock, parent, content, attachment, reminder, revision,
created/updated, and version fields remain authoritative.

### Task invariants

- `completionState=completed` requires completion metadata and a counted current event.
- An ordinary completion produces `completionState=completed`, `lifecycle=archived`, and
  `archiveReason=completed` in one mutation.
- Restore of a completion-archived Task is also a reopen: the current event is reversed and
  the Task becomes active/open while its event history remains.
- Manual archive may preserve `completionState=open`; restore returns it to active/open.
- Subtasks inherit no classification independently when baseline parent rules govern them;
  where existing independent assignment is retained, it must resolve to a valid Project.
- Archived Tasks cannot be reassigned or edited until restored.
- `deleting` can be entered only by a server-authorized DeletionJob and cannot be restored or
  edited by a client.

### Task state transitions

```text
active/open --completeAndArchive--> archived/completed
active/open --archive(manual)-----> archived/open
archived/completed --restore------> active/open + reverse completion event
archived/open --restore-----------> active/open
active|archived --begin hard delete--> deleting --job complete--> absent
deleting --retry/recover job---------> deleting
```

## List

Existing List extended with Project assignment and archive metadata.

| Field | Type | Rules |
|---|---|---|
| `projectId` | Project ULID, optional | Absent means Unassigned |
| `lifecycle` | `active`, `archived`, or `deleting` | Replaces/normalizes existing status |
| `archiveReason` | `finished` or `manual`, optional | Required when archived |
| `archivedAt` | UTC timestamp, optional | Required when archived |
| `archivedBy` | user ID, optional | Required when archived |

Existing owner, group, lock, name, timestamps, and version remain.

### List invariants

- Finish and archive mutate only the parent lifecycle; all current List Items are logically in
  the same archive scope.
- List Item completion does not create a personal Task CompletionEvent.
- Archived Lists and their Items cannot be edited until restored.
- Hard deletion of a List includes List Items, revisions, attachments, projection pointers,
  feed copies, and search/cache representations enumerated by the preview.

### List state transitions

```text
active --finish--> archived(reason=finished)
active --archive--> archived(reason=manual)
archived --restore--> active
active|archived --begin hard delete--> deleting --job complete--> absent
```

## List Item

No independent archive lifecycle is added. Existing identity, order, completion/removal,
directory link/overrides, attachments, timestamps, and version remain. Effective lifecycle,
Project, Category, group, lock, and ownership are always resolved through the parent List.

## Completion Event

Durable historical fact used for personal and authorized aggregate reporting.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable event identity |
| `taskId` | Task ULID | Required; hard deletion removes event contribution |
| `completedBy` | user ID | User credited with completion |
| `occurredAt` | UTC timestamp | Authoritative instant |
| `projectIdAtCompletion` | Project ULID, optional | Null for Unassigned |
| `projectNameAtCompletion` | string, optional | Historical display snapshot, protected like organization data |
| `categoryIdAtCompletion` | Category ULID, optional | Derived through Project at completion |
| `categoryNameAtCompletion` | string, optional | Historical display snapshot |
| `counted` | boolean | Exactly one unreversed event may be current for a completed Task |
| `reversedAt` | UTC timestamp, optional | Required when `counted=false` due to reopen |
| `reversedBy` | user ID, optional | Required with `reversedAt` |
| `reversalMutationId` | mutation ULID, optional | Makes replay deterministic |
| `createdAt` | UTC timestamp | Same as or after occurrence |

Completion Events are append-oriented. Reversal updates only reversal fields with a condition
that the event is still counted. Re-completion creates a new event rather than reactivating the
old one.

## Workload Projection

Derived, rebuildable online records supporting exact authorized counts and drill-down.

| Field | Type | Rules |
|---|---|---|
| `audience` | PUBLIC, GROUP, OWNER, or ADMIN identifier | Exclusive ordinary audience plus admin mirror |
| `scopeType` | `project` or `category` | Category is roll-up |
| `scopeId` | Category/Project ULID | Required |
| `workType` | `todo` or `list` | Separate user-visible counts |
| `activeCount` | non-negative integer | Transactionally adjusted |
| `updatedAt` | UTC timestamp | Last adjustment |
| `version` | positive integer | Conditional update |

Each included work entity also has an audience-scoped drill-down pointer with work ID/type,
scope IDs, lifecycle, and safe sort key. Count and pointer writes occur with the authoritative
mutation. Reconciliation derives expected projections from current records and alarms on
differences; projections contain no labels or protected content.

## Completion Projection

Derived, rebuildable counter keyed by credited user, UTC source date, historical Category,
historical Project, and counted state. It accelerates bounded report queries but never replaces
the CompletionEvent source. Local-time day/week/month buckets are derived from event instants;
projection reconciliation must equal counted source events.

## Deletion Preview

Short-lived, non-persistent response calculated from canonical state.

| Field | Type | Rules |
|---|---|---|
| `resourceType` / `resourceId` | enum / ULID | Exact target |
| `displayLabel` | string | Shown to user; never logged |
| `targetVersion` | integer | Bound to confirmation |
| `dependentCounts` | map | Tasks, Items, revisions, events, attachments, and report effects |
| `blockers` | array | Non-empty for Category/Project dependencies |
| `irreversible` | `true` | Constant |
| `expiresAt` | UTC timestamp | Short lifetime |
| `confirmationToken` | opaque signed value | Bound to actor, resource, version, and dependency digest |

## Deletion Job

Server-owned checkpoint for permanent deletion of an aggregate.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Stable status identity |
| `resourceType` / `resourceId` | enum / ULID | Target |
| `requestedBy` | user ID | Authorized actor |
| `requestMutationId` | string | Actor-scoped idempotency identity |
| `targetVersion` | integer | Version previewed and locked |
| `dependencyDigest` | digest | Detects stale preview |
| `status` | `pending`, `locking`, `purging`, `publishing`, `complete`, `failed` | Monotonic except retry within stage |
| `checkpoint` | opaque safe map | Page cursors/counts; no protected content |
| `createdAt` / `updatedAt` | UTC timestamps | Required |
| `completedAt` | UTC timestamp, optional | Required when complete |
| `safeFailureCode` | string, optional | No content |

Only `complete` authorizes the UI to present permanent deletion as final. Stable deletion
receipts allow an exact replay to return the same result after target removal.

## Deletion Ledger Entry

Content-free record used to prevent disaster recovery from resurrecting hard-deleted data.

| Field | Type | Rules |
|---|---|---|
| `resourceType` / `resourceId` | enum / ULID | Target identity only |
| `deletedAt` | UTC timestamp | Final job completion |
| `deletionJobId` | ULID | Audit correlation |
| `scopeDigest` | digest | Verifies dependent purge set without retaining content |
| `ledgerVersion` | integer | Restore compatibility |

Ledger entries are not user-restorable records. Restore validation must apply all applicable
entries to the isolated restore before authorization or traffic tests pass.

## Name Reservation

- Category: `CATEGORYNAME#{canonicalName}` → Category ID.
- Project: `PROJECTNAME#{categoryId}#{canonicalName}` → Project ID.
- Rename/move deletes the old reservation and creates the new reservation in the same
  conditional transaction as the entity update.
- Hard deletion removes the reservation only after dependency emptiness is rechecked.

## Migration Records

### Category-to-Project Mapping

| Field | Type | Purpose |
|---|---|---|
| `legacyCategoryId` | Category ULID | Stable source |
| `generalProjectId` | Project ULID | Deterministic destination |
| `status` | `planned`, `created`, `backfilled`, `verified` | Idempotent progress |
| `lastEvaluatedKey` | opaque map, optional | Page checkpoint |
| `taskCountExpected` / `taskCountMigrated` | integer | Reconciliation |
| `updatedAt` | UTC timestamp | Operations visibility |

### Rollout sequence

1. Deploy schemas that read legacy `categoryId` and new `projectId` but write both compatibly.
2. Create/verify one `General` Project per existing Category.
3. Backfill tasks in checkpointed pages and synthesize events for already completed tasks.
4. Compare source/migrated counts, authorization audiences, events, and projections.
5. Publish Project/Event feeds and require compatible clients.
6. Stop legacy writes, retain bounded legacy reads for rollback, then remove only after a
   successful backup/restore migration exercise.

## Local IndexedDB v8

- Add `secureProjects`: indexes `id, updatedAt`.
- Add `secureCompletionEvents`: safe clear indexes `id, taskId, completedBy, occurredAt,
  projectId, categoryId, reversedAt` while payload snapshots remain encrypted.
- Extend `secureTasks` with `projectId, lifecycle, completionState` safe indexes.
- Extend `secureLists` with `projectId, lifecycle` safe indexes.
- Preserve `secureCategories`, outbox, conflicts, search settings, and cursor atomically.
- Do not run asynchronous decrypt-and-rewrite work inside the Dexie version upgrade; lazily
  normalize records from server-fed v3 payloads.
