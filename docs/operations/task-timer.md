# Task timer operations

## Persistence and privacy

Each user owns at most one current timer at `PK=USER#{ownerId}, SK=TIMER#CURRENT`. An accepted semantic command conditionally writes the current record, immutable revision, mutation receipt, and owner-feed change in one DynamoDB transaction. Timer state is never published to public, group, administrator, or task collaboration feeds. Browser current state, feedback checkpoints, conflicts, and outbox commands are device-key encrypted.

Running timers use timestamp projection; there is no EventBridge schedule, polling Lambda, interval row, or passive AWS request. Repeat gaps are projected with bounded integer arithmetic. Server time anchors accepted commands, so client clock changes cannot rewrite elapsed history.

## Conflicts and revocation

All commands condition on `baseVersion` and are idempotent by mutation receipt. Version conflicts retain the encrypted command for explicit reapply/discard. Authorization changes quarantine or purge the timer and its dependent checkpoints/outbox data. Do not log task IDs, labels, duration values tied to identities, timer payloads, or feedback checkpoints.

Monitor `TaskTimerCommands`, p95 `TaskTimerCommandLatency`, `TaskTimerConflicts`, `TaskTimerFailures`, and `TaskTimerInvariantFailures`. The dashboard and alarms use bounded operation/outcome dimensions only.

## Restore gate

Before reopening a restore, require at most one current timer per owner, valid state-field combinations, owner identity equality, monotonic revisions, receipts bounded by the current version, and owner-only feed consistency. Treat an invalid or orphan timer record as a fail-closed restore error; do not repair it by marking a referenced task complete. Verify restored task authorization during reconciliation and quarantine inaccessible references.
