# Research: Journal Recycle Bin

## Decision 1: Repair pull/bootstrap before adding lifecycle UI

**Decision**: Wire paginated Journal bootstrap/pull into application sync, preserve pending
local rows during pull, persist the top-level date token, and expose Journal conflicts through
an actionable Journal conflict source before recycle/restore ships.

**Rationale**: The current application drains Journal pushes but does not invoke Journal pull
or bootstrap. Pulled rows can overwrite pending local work and omit the date token used by the
unique owner/date index. Shipping lifecycle controls on that path would recreate the class of
hidden-data failure that prompted this feature.

**Alternatives rejected**: A UI-only recycle bin would work on one browser but could hide or
resurrect entries across devices. Last-write-wins pull was rejected because it can discard
offline content and intent.

## Decision 2: Put user-visible lifecycle inside encrypted projection v2

**Decision**: Introduce encrypted Journal projection v2 with `lifecycle` and `recycledAt`.
Projection v1 decrypts as `active`. Store only a duplicated coarse `active`, `recycled`, or
`deleting` control state on the server entry row.

**Rationale**: The recycle-bin UI needs a removal timestamp and sorting data without exposing
Journal dates/content to the service. The service still needs an authoritative state bit to
reject edits to recycled/deleting entries, validate permanent deletion, and defeat stale
clients. This is the minimum feasible leakage and stays owner-scoped and encrypted at rest.

**Alternatives rejected**: Purely client-side lifecycle cannot enforce deletion eligibility or
stale-write rejection. Storing the removal timestamp outside ciphertext leaks unnecessary
behavioral metadata. Re-encrypting old entries eagerly creates migration risk; v1-as-active is
backward-compatible.

## Decision 3: Use explicit versioned lifecycle mutations

**Decision**: Bump the Journal sync protocol and support `upsert`, `recycle`, and `restore`
mutations with mutation UUID, base version, ciphertext envelope, and expected lifecycle. Apply
each in one DynamoDB transaction containing entry version/control state, unchanged date
reservation, mutation receipt, and owner-feed record.

**Rationale**: Explicit intent enables idempotency, state-machine validation, useful conflicts,
and offline retry. Keeping the date reservation while recycled preserves one-entry-per-date.

**Alternatives rejected**: Treating lifecycle as an undifferentiated upsert lets old or buggy
clients bypass transition rules. Removing the date reservation would allow a second entry and
make restore ambiguous.

## Decision 4: Add tombstones and strict protocol negotiation

**Decision**: Extend pull changes with explicit lifecycle events and a payload-free permanent
deletion tombstone. New clients purge matching local entry/outbox/conflicts on a tombstone or
`hard_deleted` mutation response. Clients that do not support the new protocol must refresh or
upgrade rather than continue writing.

**Rationale**: Old clients otherwise display recycled records as active and can replay a
permanently deleted UUID. Tombstones are necessary for connected stale devices while a
content-free deletion ledger blocks server acceptance forever.

**Alternatives rejected**: Silent compatibility with v5 cannot represent tombstones or
lifecycle intent safely. Returning fake ciphertext for deletion would complicate crypto and
retain unnecessary data.

## Decision 5: Keep recycled entries in the existing Dexie store

**Decision**: Add lifecycle indexes in a new database version, retain the same local row and
owner/date unique index, filter active projections before list/dashboard/streak calculations,
and query recycled rows for a dedicated bin route.

**Rationale**: One store preserves identity, encryption, offline behavior, date uniqueness, and
atomic local transitions. Per-record decrypt settlement prevents one corrupt record from hiding
all healthy entries.

**Alternatives rejected**: A second recycle-bin store creates cross-store atomicity and unique
date problems. Deleting the local row until restore defeats offline recovery.

## Decision 6: Reuse but harden permanent deletion infrastructure

**Decision**: Add Journal-specific preview and purge behavior to the existing HMAC-confirmed,
checkpointed Step Functions workflow. Stages conditionally lock `recycled -> deleting`, purge
ciphertext-bearing historical feed rows in retryable bounded batches, atomically delete current
entry/date reservation while writing the content-free ledger and tombstone, verify absence, and
complete. Persist safe failure state and make stranded jobs resumable.

**Rationale**: The existing workflow supplies online preview, explicit confirmation, durable
jobs, alarms, and no always-on compute. Journal UUIDs, owner-partition storage, ciphertext feed
copies, and stale-client semantics require an isolated branch rather than pretending Journal is
a task/list resource. Atomic final deletion plus ledger write closes a resurrection crash window.

**Alternatives rejected**: Synchronous API deletion cannot safely purge paginated history or
resume. A new queue/service duplicates infrastructure and cost. Copying the generic task/list
purger would miss Journal feed ciphertext and assumes ULID resource IDs.

## Decision 7: Apply ledger remediation during restore

**Decision**: Before restored traffic is enabled, load the protected current deletion ledger,
purge matching Journal entry/date/feed ciphertext from the isolated restored table, then validate
their absence. Validate backup manifest integrity before intentional remediation and validate
post-remediation invariants afterward.

**Rationale**: Point-in-time recovery can contain content that was later permanently deleted.
Current restore validation only checks task/list current rows and would miss Journal ciphertext
copies.

**Alternatives rejected**: Merely failing validation leaves recovery blocked and invites manual,
error-prone repair. Keeping deleted ciphertext accessible in an archive violates permanent
deletion semantics.

## Decision 8: Bounded validation coverage

**Decision**: Add domain, contract, repository, sync, API integration, deletion, restore,
security, and performance tests. Add at most one representative lifecycle journey to the quick
Playwright suite after recording its test count and wall time; keep exhaustive desktop/iPhone/
iPad Chromium/WebKit combinations in the full and pre-AWS browser gates.

**Rationale**: This covers high-risk data lifecycle paths without violating the ten-minute
required-validation target.

**Alternatives rejected**: Putting the full device matrix in the required quick suite increases
PR time without proportional signal. Unit-only coverage misses browser storage and sync behavior.
