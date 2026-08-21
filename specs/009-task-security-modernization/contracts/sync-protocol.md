# Sync Contract Version 5 Delta

This delta extends the existing version 4 push/pull/bootstrap protocol. All version 4 task, stack, feed, sequencing, mutation-receipt, purge, and problem semantics remain unless explicitly changed here.

## Version negotiation

- Clients that send feature 009 mutations send `contractVersion: 5`.
- Server deployment first accepts v4 and v5 and emits compatibility-readable records; web deployment upgrades encrypted local schemas and then emits v5.
- A v4 client never receives a timer entity it cannot parse. Once migration verification completes and the compatibility window expires, bootstrap instructs obsolete clients to upgrade before mutation.
- Bootstrap and pull include `serverTime` as a UTC instant so timer projections can maintain a bounded server offset.

## New entity: `taskTimer`

- `entityId` is the authenticated user ID and cannot be supplied as a different owner.
- Timer current/revisions/feed items appear only in `OWNER#{userId}`.
- Task collaborators and administrators do not receive timer data.
- A timer task reference is accepted only while the owner can read the canonical task.
- One deterministic aggregate and a conditional `baseVersion` enforce the account-wide invariant.

## Timer mutation envelope

```json
{
  "contractVersion": 5,
  "mutations": [
    {
      "id": "01J...",
      "entityId": "authenticated-user-id",
      "entityType": "taskTimer",
      "operation": "start",
      "baseVersion": 0,
      "createdAt": "2026-08-14T18:00:00.000Z",
      "attempts": 0,
      "sourceClientId": "opaque-client-id",
      "payload": {
        "taskId": "01J...",
        "durationMinutes": 10,
        "repeatEnabled": false
      }
    }
  ]
}
```

The encrypted local outbox contains the full payload. Logs and low-cardinality metrics do not.

## Operations

| Operation | Required payload | Preconditions/effect |
|---|---|---|
| `start` | `taskId`, `durationMinutes`, `repeatEnabled` | absent/stopped/finished; starts new run |
| `switch` | same as start plus `confirmed: true` | another task effectively active; atomically replaces run |
| `pause` | `runId` | running; materializes ordinal and remaining |
| `resume` | `runId` | paused; anchors same ordinal |
| `stop` | `runId` | running/paused/finished; same-run replay idempotent |
| `restart` | `taskId`, optional duration/repeat | existing stopped/finished; new run |
| `changeDuration` | `runId`, `durationMinutes`, `confirmed: true` | running/paused; new run at full duration |
| `setRepeat` | `runId`, `repeatEnabled` | preserves base state; finished does not auto-start |

`durationMinutes` is an integer 1..1,440. Server evaluates the effective timer state at its normalized acceptance time before validating the command.

## Commit and idempotency

An accepted command atomically commits:

1. canonical current timer;
2. immutable timer revision;
3. stable mutation receipt/result;
4. owner-feed counter;
5. owner-feed upsert.

Replaying a mutation ID returns its stored result without repeating an action. A new mutation with stale `baseVersion` never silently overwrites canonical state.

## Result and conflict

Successful results retain the version 4 stable shape: `mutationId`, `status`, `version`, and optional `operationId`. Timer conflicts add a safe problem extension:

```json
{
  "mutationId": "01J...",
  "status": "conflict",
  "problem": {
    "type": "https://naaseh.example/problems/timer-conflict",
    "reason": "version_mismatch",
    "currentVersion": 8,
    "canReapply": true
  }
}
```

Allowed timer reasons:

- `version_mismatch`
- `switch_required`
- `task_unavailable`
- `authorization_changed`
- `invalid_transition`
- `run_replaced`
- `clock_anomaly`
- `hard_deleted`

The browser stores the original local command in an encrypted conflict. `reapply` refreshes canonical state and creates a new mutation ID/base version after explicit confirmation; `discard` removes only the local conflicting command. History is never rewritten.

## Timer projection and feedback

- `remainingSeconds`, effective status, and repeat ordinal are projections, not per-second server fields.
- A live page uses a monotonic clock; reload/device reconciliation uses canonical UTC anchors and `serverTime` offset.
- Repeat advances with bounded arithmetic and produces completion feedback once per active device and interval. It creates no task `CompletionEvent`; finishing a timer interval does not complete or mutate the task.
- Completion feedback identity is `{runId, intervalOrdinal}`. Each active device stores an encrypted checkpoint and signals at most once; clients do not replay a backlog after suspension.
- Notification/audio availability is best effort and never changes canonical timer or task data.

## Task entity additions

Task create/patch/snapshot schemas add:

- `memoDocument` version 1 plus deterministic `memo` projection, or protected hidden-memo package v2;
- `dueKind`, `dueDate`, and the normalized timed `dueAt` meaning;
- optional fixed-enum `postItColor`;
- active urgency vocabulary without `extra_low`.

All changed task fields are one existing versioned task mutation. Same-field rich-document/color/date conflicts use the current visible task conflict behavior; clients do not automatically merge rich documents.

The pre-deployment removal guard must prove that no current, pending, snapshot, or restore value contains `extra_low`. Sync v5 rejects any inbound or restored `extra_low` value; it never normalizes or silently rewrites one.

## Revocation and purge

If task access is revoked or the task is hard-deleted:

1. server rejects new timer commands with a safe generic reason;
2. owner reconciliation emits a purge/quarantine action for task-identifying timer content;
3. the browser atomically purges identifying cached content and quarantines dependent outbox mutations before advancing the access-control cursor;
4. only safe receipt/audit metadata remains.

An inactive/revoked user receives no timer feed or protected task data. Startup/reconnect session validation precedes unlocking retained protected cache after server revocation is known.

## Local database version 11

The upgrade adds encrypted `secureTaskTimers` indexed only by `id`, `ownerId`, `status`, and `updatedAt`, plus an encrypted feedback checkpoint. It also migrates active priority values, validates memo/date/color additions, and preserves settings, keys, mutation identity, outbox order, and conflict records. Upgrade failure aborts the transaction and surfaces recovery guidance; it never deletes the previous database as an automatic remedy.
