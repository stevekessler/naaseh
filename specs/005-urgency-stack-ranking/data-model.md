# Data Model: Urgency Levels and Personal Stack Ranking

## Conventions

- IDs and mutation IDs are ULIDs unless an existing entity contract specifies another immutable ID.
- Timestamps are ISO 8601 UTC strings.
- Mutable shared entities and each personal stack scope use positive integer optimistic versions.
- Urgency wire values are `extra_low`, `low`, `medium`, `high`, and `critical`; display labels are
  Extra Low, Low, Medium, High, and Critical in that order.
- Urgency is categorical. No stored or calculated numeric urgency score exists.
- A rank shown to a user is a one-based ordinal derived from that user's authorized active stack; it
  is not persisted on Task or List and is not authorization evidence.
- Personal stack operations and snapshots are private to their `userId`. Operational logs never
  contain work IDs in bulk payloads, filter values, urgency values tied to work, position data, or
  exact affected-item counts.

## Urgency Level

Canonical shared value used by all work and report contracts.

| Wire value | Display label | Default | Relative stack effect |
|---|---|---:|---|
| `extra_low` | Extra Low | No | None |
| `low` | Low | No | None |
| `medium` | Medium | Yes | None |
| `high` | High | No | None |
| `critical` | Critical | No | None |

### Validation

- Exactly one value is required on every Task/Subtask and List.
- New work uses `medium` when the input omits urgency.
- A change to urgency increments the shared work version and records a shared revision, but it does
  not mutate any user's stack scope or position.
- List Items do not have urgency independently; their parent List supplies reporting/display urgency.

## Task / Subtask

Existing entity extended with urgency.

### Changed field

| Field | Type | Rules |
|---|---|---|
| `urgency` | Urgency Level | Required; defaults to `medium` during creation |

### Changed behavior

- Existing owner-only edit authorization governs urgency changes.
- Task revisions allowlist `urgency` as a safe categorical before/after field.
- `completeAndArchive` copies current `urgency` into `CompletionEvent.urgencyAtCompletion` in the
  same accepted transaction.
- Google import creates Tasks through the normal default; Google merge/publish never maps urgency.
- Task lifecycle/project/authorization events affect eligibility in personal stacks but never read
  personal rank to make an authorization or lifecycle decision.

## List

Existing reusable List extended with urgency.

### Changed field

| Field | Type | Rules |
|---|---|---|
| `urgency` | Urgency Level | Required; defaults to `medium` during creation |

### Changed behavior

- Existing List edit authorization governs urgency changes.
- Shared List revision history records urgency changes.
- Finishing/archiving removes the List from active personal stack membership; restoration returns it
  at each authorized user's implicit tail.
- Lightweight List Items retain no independent urgency or personal rank.

## Completion Event

Existing immutable counted-completion fact extended with historical urgency.

### Changed field

| Field | Type | Rules |
|---|---|---|
| `urgencyAtCompletion` | Urgency Level | Required; copied from the Task when completion is accepted |

### Validation and reporting

- Reversal never changes `urgencyAtCompletion`.
- A later re-completion creates a new event with the then-current urgency.
- Completion reports filter and bucket only by `urgencyAtCompletion`, never current Task urgency.
- The deployment has no pre-feature completion events, so no legacy value or migration state exists.
- Aggregate responses contain no raw Completion Events. Authorized detail reads use a separate
  per-completing-user pointer written atomically with the event:

```text
PK: COMPLETIONDETAIL#USER#{completedBy}
SK: AT#{reverseOccurredAt}#EVENT#{eventId}
```

- Completion detail pagination is pinned to the requested range and `asOf`, orders by completion time
  then event ID descending, filters on `urgencyAtCompletion`, and treats an event as counted when its
  `reversedAt` is absent or later than `asOf`.

## Personal Stack Scope

The private versioned ordering boundary for one user.

| Field | Type | Rules |
|---|---|---|
| `userId` | user ID | Required; owner and only reader/editor |
| `scopeType` | `overall` or `project` | Required |
| `scopeId` | Project ULID, optional | Required exactly for `project`; absent for `overall` |
| `version` | positive integer | Advances once for each accepted semantic reorder |
| `currentSnapshotGeneration` | positive integer, optional | Points only to a complete verified snapshot |
| `snapshotThroughVersion` | nonnegative integer | Highest operation included in current snapshot |
| `operationDepth` | nonnegative integer | Operations after current snapshot; compaction input |
| `createdAt` | UTC timestamp | Immutable |
| `updatedAt` | UTC timestamp | Changes on accepted operation/snapshot switch |

### Identity and DynamoDB keys

```text
overall PK: STACK#USER#{userId}#OVERALL
project PK: STACK#USER#{userId}#PROJECT#{projectId}
metadata SK: META
```

### Membership

- Overall eligibility is every active Task/Subtask/List the user may currently view.
- Project eligibility adds `work.projectId == scopeId`.
- Snapshot/operation work IDs are intersected with current eligibility before return or display.
- Eligible work not represented in canonical operations/snapshot appears at the tail ordered by its
  authorization/activation feed sequence and immutable `(workType, workId)` tiebreaker.
- Archive, completion, deletion, or authorization loss removes eligibility without shifting the
  stored semantics of remaining items.
- Restoration or renewed authorization establishes a new membership epoch at the tail.
- Project reassignment preserves overall semantics, removes former Project membership, and enters
  the destination Project tail.

## Personal Stack Operation

Canonical immutable user-owned reorder command.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable operation ID |
| `mutationId` | ULID | Required; unique/idempotent within user |
| `userId` | user ID | Required; derived from authenticated session, never request body trust |
| `scopeType` | `overall` or `project` | Required |
| `scopeId` | Project ULID, optional | Matches scope rules |
| `baseVersion` | nonnegative integer | Client version operation was based on |
| `version` | positive integer | Assigned accepted scope version |
| `kind` | `simple_move` or `filtered_permutation` | Required |
| `movedWork` | Work Reference | Must be currently active, authorized, and in scope |
| `beforeWork` | Work Reference, optional | Simple-move anchor; mutually coherent with `afterWork` |
| `afterWork` | Work Reference, optional | Simple-move anchor |
| `filterBasis` | Filter Basis, optional | Required for filtered permutation |
| `affectedCount` | integer | `1..50000`; must match manifest/chunks |
| `affectedHash` | SHA-256 digest | Covers ordered affected work references and filter basis |
| `sourceClientId` | string | Existing bounded client identifier |
| `acceptedAt` | UTC timestamp | Server acceptance time |
| `outcome` | `applied`, `pending_compaction`, `conflict`, `rejected` | Stable result |

### Simple move

- Uses before/after anchors from the full applicable stack.
- Exactly one moved work reference is recorded.
- On stale base version, rebase is allowed only if the moved item and anchors remain eligible and
  their current relationship admits one unambiguous insertion.

### Filtered permutation

- `filterBasis` records normalized non-content filter criteria and a digest of any protected local
  search basis; raw search text or protected content is not sent or logged.
- The affected ordered work references cover the visible source-to-destination span only.
- Replay obtains those items' occupied slots at `baseVersion`, moves the selected item within the
  affected order, and places the resulting references back into exactly those slots.
- Hidden, unauthorized, and nonmatching items are never included or moved.
- A stale filtered permutation conflicts rather than silently rebasing.

### DynamoDB keys and atomic acceptance

```text
manifest SK: OP#{version padded}#{operationId}
chunk SK:    OP#{version padded}#{operationId}#CHUNK#{chunk padded}
```

Acceptance conditionally advances `META.version` and atomically writes the manifest, all required
chunks, the existing user-scoped mutation receipt, private audit data, and owner-only feed change.
Chunk sizes remain below 250 KB and the fixture is validated to remain below the 100-item/4 MB
transaction limits.

## Personal Stack Operation Chunk

Bounded payload for large filtered permutations.

| Field | Type | Rules |
|---|---|---|
| `operationId` | ULID | Parent manifest |
| `index` | nonnegative integer | Contiguous from zero |
| `count` | positive integer | Work references in this chunk |
| `workRefs` | ordered Work Reference array | Logical form; no duplicates; each authorized/in-scope at acceptance |
| `checksum` | SHA-256 digest | Covers canonical chunk encoding |

The manifest records expected chunk count and aggregate hash. Missing, extra, reordered, or corrupt
chunks invalidate the operation and block snapshot advancement. Physical DynamoDB chunks encode Work
References as compact tuples in deterministic compressed binary form; the uncompressed canonical
form is hashed, and performance/contract tests enforce the 50,000-item fixture remains within the
100-item/4 MB atomic-acceptance budget.

## Personal Stack Snapshot Chunk

Derived compacted ordering through a specific stack version.

| Field | Type | Rules |
|---|---|---|
| `userId` | user ID | Same as scope owner |
| `scopeType` | `overall` or `project` | Same as scope |
| `scopeId` | Project ULID, optional | Same as scope |
| `generation` | positive integer | Immutable snapshot generation |
| `throughVersion` | nonnegative integer | Highest canonical operation applied |
| `index` | nonnegative integer | Contiguous from zero |
| `workRefs` | ordered Work Reference array | Derived ordering, chunk-bounded |
| `membershipEpochs` | ordered epoch/token array | Same cardinality as `workRefs` |
| `checksum` | SHA-256 digest | Covers canonical chunk encoding |

```text
snapshot SK: SNAPSHOT#{generation padded}#CHUNK#{index padded}
```

Snapshots are not canonical. The compactor writes and verifies every chunk before a conditional
`META.currentSnapshotGeneration` switch. Old generations may expire only after backup/restore rules
and active-client compatibility permit. Missing/corrupt snapshots rebuild from canonical operations
and eligible membership.

## Work Reference

Non-content identity used inside private ordering records.

| Field | Type | Rules |
|---|---|---|
| `workType` | `task` or `list` | Subtasks use `task` |
| `workId` | ULID | Immutable shared work identity |
| `membershipEpoch` | bounded feed token | Changes when work leaves and later re-enters eligibility |

The rank service must load/authorize the referenced work before returning it. A stored Work Reference
alone never proves existence, visibility, ownership, or Project membership.

## Filter Basis

Normalized criteria proving filtered-slot semantics.

| Field | Type | Rules |
|---|---|---|
| `urgencies` | unique Urgency Level array, optional | Canonical enum order |
| `from` / `to` | date strings, optional | Existing date semantics |
| `assigneeId` | user ID, optional | Existing filter semantics |
| `categoryId` | ID, optional | Existing filter semantics |
| `projectId` | Project ID or `unassigned`, optional | Must agree with stack scope when applicable |
| `lifecycle` | `active` | Stack reorder accepts active work only |
| `contentType` | `all`, `todos`, or `lists`, optional | Existing mixed-work semantics |
| `searchBasisHash` | digest, optional | Proves client basis without sending protected search text |

## Authorized Work View Pointer

Transaction-maintained non-content projection used to enumerate archive and workload drill-down
candidates without scanning shared work or creating one projection per viewer.

| Field | Type | Rules |
|---|---|---|
| `audience` | owner, public, group, or administrator projection key | Represents an authorization source, not a requesting viewer |
| `lifecycle` | `active` or `archived` | Required and must match canonical work |
| `scopeType` | `overall`, `category`, `project`, or `unassigned` | Required |
| `scopeId` | Category/Project ID, optional | Required for matching scoped types |
| `urgency` | Urgency Level | Current shared urgency |
| `stableSortKey` | bounded sortable token | Archive uses reverse `archivedAt`; workload detail uses the existing report order |
| `workType` | `task` or `list` | Required |
| `workId` | ULID | Required; canonical work is always hydrated and reauthorized |
| `workVersion` | positive integer | Rejects stale pointer/canonical mismatches during reconciliation |
| `updatedAt` | UTC timestamp | Projection freshness and repair input |

```text
PK: WORKVIEW#AUDIENCE#{audience}#LIFECYCLE#{lifecycle}#SCOPE#{scopeType}#{scopeId-or-none}#URGENCY#{urgency}
SK: SORT#{stableSortKey}#TYPE#{workType}#ID#{workId}
partition metadata SK: META
```

- Task/List lifecycle, urgency, Category, Project, and audience changes delete obsolete pointers and
  write replacement pointers atomically with canonical state and workload counter changes. The same
  transaction advances each affected partition's monotonic META source epoch.
- Public and group work produces pointers for those shared audiences, not one pointer per authorized
  user. An administrator-only global pointer supports privileged traversal without mixing ordinary
  audience streams into the response.
- Reads query only the authenticated actor's applicable audience partitions, merge by `stableSortKey`,
  deduplicate Work References, then hydrate and reauthorize before filtering or return.
- Pointer data never grants access. Missing/stale pointers produce reconciliation metrics and are
  repaired from canonical work; they never bypass current authorization.

## Filtered Read Cursor

Opaque continuation state for server-side filtered stack, archive, and drill-down reads.

| Field | Type | Rules |
|---|---|---|
| `id` | random identifier, optional | Present for server-stored multi-source state |
| `actorId` | authenticated user ID | Owner and only permitted reader |
| `accessEpoch` | authorization/session epoch | Change invalidates traversal |
| `endpoint` | bounded endpoint enum | Prevents cross-route replay |
| `scope` | normalized read scope | Overall, Project, archive, Category, or unassigned |
| `filterHash` | SHA-256 digest | Covers canonical query criteria and requested order; no raw criteria stored in inline token |
| `sourceWatermarks` | source-epoch vector | Binds every candidate audience partition and excludes later changes |
| `sourcePositions` | one or more continuation positions | Last evaluated candidate, never merely last returned match |
| `visibleOrdinal` | nonnegative integer | Preserves dense viewer-authorized rank calculation |
| `stackVersion` | nonnegative integer, optional | Required for stack-driven traversal |
| `snapshotGeneration` | nonnegative integer, optional | Required when traversal uses a compacted snapshot |
| `tailWatermark` | bounded feed token, optional | Pins implicit-tail membership for stack traversal |
| `expiresAt` | UTC timestamp / TTL epoch | Fifteen minutes after issue |

- A single-source stack cursor is encrypted and signed inline and remains below the 4096-byte contract
  limit. A multi-source merge vector is encrypted in an owner-scoped `CURSOR#{id}` item with TTL; the
  client receives only a signed opaque ID.
- Cursor validation binds actor/access epoch, endpoint, scope, normalized filter/order hash, source
  context, signature, and expiry before any read occurs. Raw search text, content, urgency values tied
  to records, identifiers in bulk, ranks, and report totals are never logged.
- Each page advances from the last evaluated candidate. A page can contain fewer than `limit` items,
  including zero, while `nextCursor` remains non-null after the bounded evaluation budget is reached.
- Under an unchanged source context, one traversal returns each authorized matching candidate at most
  once in stable source order. Authorization and lifecycle are rechecked on every page; access loss
  removes work immediately. A changed stack/access/source context invalidates the cursor and requires a
  fresh traversal rather than silently mixing contexts.

## Personal Stack Conflict

Encrypted, user-visible record for a reorder that could not safely converge.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `userId` | user ID | Owner only |
| `scope` | Stack Scope reference | Required |
| `operationId` | ULID | Failed operation |
| `reason` | enum | `version_mismatch`, `anchor_removed`, `authorization_changed`, `lifecycle_changed`, `project_changed`, `filter_basis_changed`, or `hard_deleted` |
| `baseVersion` | nonnegative integer | Submitted version |
| `currentVersion` | nonnegative integer | Server version at conflict |
| `createdAt` | UTC timestamp | Required |
| `resolvedAt` | UTC timestamp, optional | Required after discard/reapply resolution |
| `resolution` | `discarded` or `reapplied`, optional | No silent keep-local path after lost authorization |

## Urgency Breakdown

Stable aggregate embedded in workload and completion report responses.

| Field | Type | Rules |
|---|---|---|
| `extra_low` | nonnegative integer | Always present |
| `low` | nonnegative integer | Always present |
| `medium` | nonnegative integer | Always present |
| `high` | nonnegative integer | Always present |
| `critical` | nonnegative integer | Always present |

- The five values sum to the enclosing authorized total after filters.
- Workload breakdowns use current Task/List urgency.
- Completion breakdowns use `urgencyAtCompletion`.
- Rank has no aggregate, average, or urgency-derived calculation.

## Reporting and Export Rank Overlay

Read-only viewer-specific projection joined after content authorization.

| Field | Type | Rules |
|---|---|---|
| `overallPosition` | positive integer, optional | Present only for authorized active work in viewer's overall stack |
| `projectPosition` | positive integer, optional | Present only for authorized active Project work in viewer's matching Project stack |

- API and browser responses calculate one-based positions after current eligibility intersection.
- An administrator viewing another user's completion report receives the administrator's own overlay
  only where otherwise applicable, never the target user's personal ranks.
- CSV exports resolve ranks for `ExportJob.requestedByPrincipal`; archived/inapplicable rank cells
  are blank.

## Operational Telemetry Count Bucket

Low-cardinality value object used anywhere observability needs the size of an affected set, examined
set, returned set, or backlog. The same boundaries apply across ranking, reporting, synchronization,
reconciliation, pagination, and compaction.

| Wire value | Inclusive count range |
|---|---:|
| `zero` | 0 |
| `one` | 1 |
| `two_to_ten` | 2–10 |
| `eleven_to_hundred` | 11–100 |
| `hundred_one_to_thousand` | 101–1,000 |
| `thousand_one_to_ten_thousand` | 1,001–10,000 |
| `ten_thousand_one_to_fifty_thousand` | 10,001–50,000 |
| `over_fifty_thousand` | 50,001 or more |

### Telemetry rules

- The classifier accepts only nonnegative safe integers and is exhaustively tested at every lower
  and upper boundary. Invalid values fail telemetry validation without changing the user operation.
- An event with a known affected count emits `affectedCountBucket`; it never emits `affectedCount`,
  `affectedItemCount`, or another exact-count alias. If no affected count was computed, the field is
  omitted rather than assigned `unknown`.
- Other emitted cardinalities use the same value object with a semantic field name such as
  `examinedCountBucket`, `returnedCountBucket`, or `backlogDepthBucket`.
- CloudWatch metrics count operations and outcomes with the bounded bucket as an optional dimension;
  they do not use the exact underlying count as a metric value or dimension.
- `PersonalStackOperation.affectedCount` remains an owner-private canonical validation field. It is
  converted to a bucket only at the observability boundary and is never copied verbatim into logs,
  metric dimensions, dashboards, alarms, traces, or diagnostic artifacts.

## State Transitions

### Personal stack scope

```text
absent --first authorized stack read--> version 0 + deterministic implicit tail
version N --accepted reorder--> version N+1 + immutable operation
version N --stale unambiguous simple move--> version N+1 + rebased operation
version N --stale filtered/ambiguous move--> version N + conflict record
operation depth threshold --compact--> new verified snapshot generation through version N
corrupt/missing snapshot --restore/reconcile--> replay canonical operations + rebuild snapshot
```

### Work eligibility effects

```text
new/create/restore/authorization gain --> implicit tail in overall and applicable Project scope
Project move --> overall unchanged; old Project removed; destination Project tail
Project removal --> overall unchanged; Project membership removed
complete/archive/authorization loss --> removed from active derived stacks
permanent delete --> removed; stale references purged/ignored; no resurrection
```

### Urgency and completion

```text
create without urgency --> medium
authorized urgency edit --> new shared urgency + revision; personal order unchanged
Task/Subtask complete --> completion event snapshots current urgency
Task/Subtask reopen --> event reversed; snapshot retained
Task/Subtask re-complete --> new event snapshots then-current urgency
List finish/archive/restore --> no completion event transition
```
