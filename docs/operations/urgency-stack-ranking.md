# Urgency and Personal Stack Ranking Operations Runbook

## Architecture and invariants

Urgency is canonical shared Task/List data. Completion events capture immutable
`urgencyAtCompletion`. Personal order is owner-private and stored per user in one overall scope and one
scope per Project. Immutable semantic operations are canonical; gzip-compressed, checksummed snapshot
chunks are derived acceleration data. Never use a rank record, audience pointer, or cursor as proof of
authorization—hydrate canonical work and authorize it before return.

Active-work and archive traversal uses audience/lifecycle/scope/urgency pointers. Owner, public, group,
and sharded administrator streams are merged, deduplicated, then reauthorized. Every pointer change
advances its partition source epoch. Workload total and five urgency counters change in the same
transaction as their pointers and canonical lifecycle/urgency change.

## Stack operations and compaction

Reorders are idempotent by owner and mutation ID and conditionally advance a scope version. Large
filtered permutations are split into compressed chunks below 250 KiB; manifests contain aggregate
count and checksum. Acknowledgement may be durable while compaction is pending. The compactor:

1. reads metadata, the active snapshot, membership, and the complete canonical operation log;
2. rejects version gaps, corrupt chunks, or invalid checksums;
3. replays contiguous operations and deterministic tail admissions;
4. writes and validates a new snapshot generation; and
5. conditionally advances the metadata pointer only if the scope did not change.

It retries a concurrent scope change up to three times. Canonical operations and receipts follow table
and backup retention. Keep the active and one prior verified snapshot generation until restore
validation; older snapshots may then expire because they are rebuildable.

## Filtered pagination and cursors

A requested limit caps returned authorized matches, not candidates examined. A request stops after it
fills the page, reaches the source end, examines `max(500, min(4000, 20 × limit))` candidates, reads
four source pages, or reaches the reserved deadline. Short and empty pages with a continuation are
valid.

Opaque cursors bind actor/access epoch, endpoint, scope, normalized filter/order hash, evaluated source
position, visible ordinal, source epochs, and applicable stack version/snapshot/tail state. Inline
single-source cursors are encrypted and signed. Multi-source state is encrypted in an owner-scoped
DynamoDB item and the signed client token carries only its ID. Cursor state has a 15-minute TTL.

- `400 invalid_cursor`: discard the token and restart with validated filters.
- `409 pagination_context_changed`: access, pointers, stack, or filters changed; restart from page one.
- `410 cursor_expired`: restart from page one.

Never log a cursor or decoded cursor state.

## Monitoring and protected logging

Application/ranking logs retain 30 days; authentication, recovery, and audit logs retain 90 days.
Events may contain correlation ID, bounded operation class/scope/outcome, rounded duration, safe error
class, and closed count/depth buckets. They must not contain work/user/Project IDs in bulk, labels,
memos, raw filters, urgency tied to a record, rank/position, cursor state, exact affected counts, report
totals, payloads, ciphertext, or key material.

Use the Operations dashboard for stack/reorder latency and conflicts, compaction latency/failures,
completion and filtered-read latency, amplification, short pages, read units/bytes, cursor restarts and
expiry, urgency-total consistency, and projection reconciliation. Alerts cover any consistency,
reconciliation, filtered-read, export, reorder, or compaction failure; sustained conflict/latency and
cursor restart/expiry rates alarm on two of three five-minute periods.

## Diagnosis and recovery

For a failed reorder, correlate the request without inspecting content. Validation/authorization
failures are not retried. Retry dependency/time-out failures with the same mutation ID. For a visible
conflict, reload the owner scope and let the user resubmit; never silently overwrite a later accepted
order.

For compaction failure, check operation continuity, chunk count/checksum, snapshot checksum, and scope
version. Repair or restore canonical operations first, then rerun compaction. Do not make a corrupt
snapshot active.

For workload mismatch, run projection reconciliation against canonical authorized work. Classify and
repair missing, stale, orphan, and unauthorized pointers/counters idempotently; verify all five urgency
counts sum to Task plus List totals and source epochs advance. For completion mismatch, verify indexed
events, detail pointers, reversal state at `asOf`, and immutable completion urgency before rebuilding
derived aggregates.

For repeated short pages, review amplification/read-unit buckets and pointer selectivity. A short page
alone is not failure. For repeated context restarts, identify high-frequency lifecycle/access/pointer
updates; never weaken epoch validation to suppress the signal.

## Backup and restore

PITR and AWS Backup protect the encrypted table. A restore candidate must pass canonical operation
continuity, mutation receipt, compressed chunk, checksum, urgency enum, completion snapshot, pointer,
counter, and urgency-total validation. Snapshots are derived: rebuild them from operations and current
membership if absent, and reject rather than activate corrupt or version-gapped data. Exercise the
restore workflow end to end before release and after persistence-format changes.

## Cost controls

Primary variable costs are DynamoDB operation/snapshot and pointer reads/writes, Lambda duration, sync
traffic, backups, cursor items, and CloudWatch ingestion. Keep the table on demand for the initial
traffic profile, keep dimensions bounded, retain cursor state for only 15 minutes, and compact only
when measured replay depth/large operations justify it. Audience pointers avoid per-viewer fan-out;
inline cursors avoid cursor-item writes for single-source reads. Revisit provisioned capacity, caching,
or scheduled compaction only after dashboard evidence shows sustained throttling, amplification, or
backlog.
