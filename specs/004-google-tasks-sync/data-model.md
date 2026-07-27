# Data Model: Bidirectional Google Tasks Sync

All timestamps are ISO 8601 UTC. Provider strings are bounded and validated before persistence.
Protected values follow existing task authorization and log-redaction rules.

## GoogleConnection

Owner-scoped singleton at `PK=USER#{userId}`, `SK=GOOGLE#CONNECTION`.

| Field | Type | Rules |
|---|---|---|
| userId | string | Owner; immutable |
| id | ULID | Stable support/correlation identity |
| state | disconnected, connecting, preview, active, paused, reauthRequired, disconnecting | Explicit lifecycle |
| selectedTaskListId | string | Required after preview; protected provider identifier |
| selectedTaskListTitle | string | 1–1024; protected display value |
| encryptedRefreshToken | string | KMS ciphertext; never returned or logged |
| tokenKeyVersion | string | Supports key rotation/re-encryption |
| scope | fixed Tasks read/write scope | Reject unexpected/missing grants |
| defaultLocalTime | HH:mm | Default 09:00 |
| defaultTimeZone | IANA zone | Updated explicitly by user |
| privateTaskMode | exclude | Future-compatible enum; private publication remains per-task |
| syncIntervalMinutes | integer | Fixed 5 in v1 |
| checkpointAt | timestamp | Last fully committed remote boundary |
| overlapMinutes | integer | Fixed 5 in v1 |
| lastAttemptAt / lastSuccessAt | timestamp, optional | Status only |
| pendingCount / conflictCount / quarantineCount / skippedUndatedCount | nonnegative integer | Rebuildable summary |
| version | positive integer | Optimistic concurrency |
| createdAt / updatedAt | timestamp | Server canonical |

State transitions:

`disconnected → connecting → preview → active ↔ paused`; token/list failures move active to
`reauthRequired`; disconnect is `* → disconnecting → disconnected`. Only active connections run.

## GoogleOAuthState

Short-lived state at `PK=OAUTHSTATE#{sha256(state)}`, `SK=GOOGLE`, with DynamoDB TTL.

Contains user ID, session ID/hash, exact redirect URI, PKCE verifier, issued/expiry timestamps and a
single-use consumed marker. Raw state is never stored. Consumption is conditional and atomic.

## GoogleTaskLink

Canonical link at `PK=TASK#{naasehTaskId}`, `SK=GOOGLE#LINK`; reverse lookup at
`PK=GOOGLETASK#{connectionId}#{googleTaskId}`, `SK=LINK` is written transactionally.

| Field | Type | Rules |
|---|---|---|
| connectionId / userId | string | Link must match owner connection |
| naasehTaskId / googleTaskId / googleTaskListId | string | Immutable identity tuple |
| origin | naaseh, google | Controls safe disconnect cleanup |
| marker | string, optional | Exact `naaseh:<taskId>` only for Na'aseh-origin tasks |
| base | GoogleSupportedTaskSnapshot | Last common values; protected |
| googleEtag / googleUpdatedAt | string | Provider revision hints, not sole conflict authority |
| localVersion | positive integer | Last acknowledged local task version |
| state | linked, pending, conflicted, quarantined, remoteDeleted, retired | Explicit lifecycle |
| lastSyncedAt | timestamp | Successful convergence |
| version | positive integer | Conditional updates |

## GoogleSupportedTaskSnapshot

`title` (1–300 after safe truncation policy), `dueDate` (`YYYY-MM-DD`), and `status`
(`open|completed`). It never includes local time, time zone, memo, hidden memo, organization,
collaboration or attachments.

## GoogleSyncOperation

`PK=GOOGLECONN#{connectionId}`, `SK=OP#{state}#{createdAt}#{operationId}` with GSI owner lookup.
Operation ID is deterministic for local task version/provider task revision and direction.

Fields: connection/link/task IDs; direction (`toGoogle|fromGoogle`); type (`create|update|complete|
reopen|archive|retire|resolve`); expected local/link/provider revisions; state (`pending|running|
succeeded|retry|quarantined|cancelled`); attempt count; next attempt; safe error code/status class;
correlation/run IDs; timestamps. No task values are copied into the operation.

## GoogleSyncConflict

`PK=GOOGLECONN#{connectionId}`, `SK=CONFLICT#{conflictId}` plus owner GSI.

Fields: link/task IDs; field (`title|dueDate|status`); encrypted or ordinarily protected base/local/
remote values; detected revisions; state (`open|resolved|superseded`); resolution source
(`local|google|edited`); resolved value; actor/time; version. Logs expose only field and IDs.

## GoogleSyncRun

`PK=GOOGLECONN#{connectionId}`, `SK=RUN#{startedAt}#{runId}` with bounded retention/TTL.

Stores trigger (`scheduled|manual|initial|disconnect`), state, checkpoint start/end, safe aggregate
counts, duration, retry/quota state, and correlation ID. It contains no task content.

## Atomicity and invariants

- Forward/reverse links are created and retired together.
- A task has at most one active Google link and a provider task has at most one active Na'aseh link.
- A run lease on the connection prevents concurrent scheduled/manual reconciliation.
- A checkpoint never advances past an uncommitted page item.
- Imported task mutation, revision, completion event when applicable, feed changes, link snapshot and
  provider operation result commit atomically where DynamoDB transaction limits permit; otherwise a
  resumable operation records the boundary before effects.
- Provider-origin mutation IDs are deterministic so replay produces the original durable result.
- Conflict values inherit task-owner authorization and are excluded from administrator content views.
- Restore marks connections `reauthRequired` and cancels pre-restore operations until credentials and
  list ownership are revalidated.
