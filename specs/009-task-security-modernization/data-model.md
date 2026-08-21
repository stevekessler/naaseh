# Data Model: Task Security and Experience Modernization

This document describes canonical domain state. DynamoDB keys are illustrative and remain subject to the repository's centralized key builders. Client records containing protected task data remain encrypted at rest in IndexedDB.

## User and username lookup

### User (extended)

Authoritative record: `PK=USER#{userId}`, current user sort key.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID/string | Immutable |
| `username` | canonical string | Unique; immutable unless a separately designed rename exists |
| `displayName` | string | Existing validation |
| `role` | `user \| admin` | Server-authorized mutation only |
| `active` | boolean | Inactive users receive no protected access |
| `sessionEpoch` | non-negative integer | Increment on password/factor recovery and every factor-state boundary |
| `credentialVersion` | non-negative integer | Increment when password verifier changes |
| `tfaStatus` | `disabled \| enrollment_required \| enabled \| recovery_required` | Safe summary only; admin may not be `disabled` for authenticated access |
| `tfaEnrolledAt` | UTC instant/null | Safe summary; no secret material |
| `securityUpdatedAt` | UTC instant | Updated with credential/factor state |
| `version` | positive integer | Conditional mutation version |

### UsernameLookup

Record: `PK=USERNAME#{canonicalUsername}`, lookup sort key.

| Field | Type | Rules |
|---|---|---|
| `userId` | string | Points to authoritative User |
| `canonicalUsername` | string | Must match key |

Full duplicated user data is not authoritative. Login/reset resolves the pointer and consistently reads User before making a security decision.

## TFAFactor

Record: `PK=USER#{userId}`, `SK=TFA#FACTOR`.

| Field | Type | Rules |
|---|---|---|
| `userId` | string | Owner; never taken from request body |
| `status` | `enabled \| recovery_required` | Pending enrollment is not durable factor state |
| `secretCiphertext` | bytes/base64/null | Present only when enabled; KMS encryption context binds purpose and user |
| `kmsKeyArn` | string/null | Key metadata, not secret |
| `formatVersion` | `1` | Cipher/package version |
| `algorithm` | `SHA1` | Fixed for version 1 |
| `digits` | `6` | Fixed for version 1 |
| `periodSeconds` | `30` | Fixed for version 1 |
| `lastAcceptedCounter` | non-negative integer/null | Conditionally increases; prevents replay |
| `recoveryCodes` | array of RecoveryCodeDigest | Exactly ten on rotation; plaintext never persisted |
| `verifiedAt` | UTC instant | Required when enabled |
| `version` | positive integer | Conditional factor transitions |
| `createdAt`, `updatedAt` | UTC instants | Audit timestamps |

### RecoveryCodeDigest

| Field | Type | Rules |
|---|---|---|
| `id` | opaque string | Safe display/reference ID |
| `digest` | SHA-256 bytes/base64 | Digest of normalized high-entropy code |
| `usedAt` | UTC instant/null | Conditional null → timestamp consumption |

The API returns only `status`, `verifiedAt`, and unused-code count. It never returns ciphertext or digests.

## LoginTransaction

Record: `PK=LOGIN#{sha256(cookieToken)}`, `SK=CHALLENGE`; DynamoDB TTL enabled.

| Field | Type | Rules |
|---|---|---|
| `tokenDigest` | SHA-256 bytes/base64 | Raw 256-bit token exists only in Secure HttpOnly cookie |
| `userId` | string | Resolved after primary authentication |
| `purpose` | `tfa_challenge \| tfa_enrollment` | Single purpose |
| `sessionEpoch`, `credentialVersion` | integers | Must still match authoritative User |
| `attemptCount` | integer 0..5 | Fifth failure consumes transaction |
| `pendingSecretCiphertext` | bytes/base64/null | Enrollment only; never returned after start response |
| `createdAt`, `expiresAt` | UTC instants | Five-minute lifetime |
| `ttl` | epoch seconds | DynamoDB cleanup; authorization still checks `expiresAt` |

State: `issued → consumed` on success, `issued → invalidated` on expiry/five failures/epoch change. There is no partially authenticated application session.

## AdminTfaRecoveryAudit

Immutable application record plus CloudTrail invocation evidence.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `targetUserId` | string | Must resolve to active administrator at execution |
| `reason` | bounded string | Required operator justification; exclude secrets |
| `idempotencyToken` | opaque string | Stable retry result |
| `priorState`, `newState` | safe factor-state enums | New state is `recovery_required` |
| `correlationId` | opaque string | Joins safe logs and CloudTrail lookup |
| `outcome` | safe enum | success/rejected/failed |
| `occurredAt` | UTC instant | Server assigned |

Successful recovery removes factor material, increments user/factor security versions and `sessionEpoch`, and invalidates outstanding login transactions atomically.

## TaskTimer

Current record: `PK=USER#{ownerId}`, `SK=TIMER#CURRENT`; deterministic identity equals owner ID. Immutable revision and mutation receipt records accompany accepted commands.

| Field | Type | Rules |
|---|---|---|
| `id`, `ownerId` | user ID | Identical; derived from session |
| `taskId` | task ID | Owner must currently have read authorization; not shared through task feeds |
| `durationSeconds` | integer | 60..86,400 and divisible by 60; default 600 on first open |
| `repeatEnabled` | boolean | Enabling on finished does not restart |
| `status` | `running \| paused \| finished \| stopped` | See transitions |
| `runId` | ULID | Changes on start, switch, restart, and duration change |
| `intervalOrdinal` | positive integer | Current interval in run, starts at 1 |
| `completedIntervalsAtAnchor` | non-negative integer | Materialized count when anchor established |
| `anchorAt` | UTC instant/null | Required only when running |
| `endsAt` | UTC instant/null | Running validation/projection aid |
| `pausedRemainingSeconds` | integer/null | 0..duration; required only when paused |
| `lastCompletedAt` | UTC instant/null | Materialized at next command; not a task completion |
| `version` | non-negative integer | Conditional command base version |
| `lastMutationId`, `sourceClientId` | opaque strings | Idempotency/diagnostics |
| `updatedAt` | UTC instant | Server normalized |

### Effective time rules

- Running non-repeat becomes effectively `finished` when server-adjusted `now >= endsAt`.
- Running repeat derives elapsed ordinals with bounded integer arithmetic from `anchorAt` and duration; it creates no row per passive interval.
- Pausing first materializes the effective ordinal and remaining seconds.
- Resuming anchors the same current ordinal with the paused remaining duration.
- Changing duration creates a new `runId`, ordinal 1, and a full-duration running interval after confirmation.
- Feedback identity is `{runId, intervalOrdinal}`. Completion feedback occurs once per active device and interval; it never creates a task `CompletionEvent`, and a finished timer interval does not mean the task is complete.

### Timer transitions

| From | Command | To | Notes |
|---|---|---|---|
| absent/stopped/finished | `start` or `restart` | running | New run; requires authorized task |
| running | `pause` | paused | Materialize derived remaining state |
| paused | `resume` | running | New anchor; same run/ordinal |
| running/paused/finished | `stop` | stopped | Same-run replay is idempotent |
| running/paused | `changeDuration` | running | Confirmation; new run/full duration |
| any current | `setRepeat` | same base state | Finished does not auto-start |
| running another task | `switch` | running | Explicit confirmation; new task/run |
| running non-repeat | elapsed projection | finished | No write required |
| running repeat | elapsed projection | running | Advance ordinal arithmetically |

Every mutation conditions on `baseVersion`. Conflicts retain the command encrypted with reasons defined in [contracts/sync-protocol.md](contracts/sync-protocol.md).

## MemoDocument

Canonical rich semantics are structured data, never HTML.

```text
MemoDocument {
  version: 1
  blocks: MemoBlock[]
}

MemoBlock = Paragraph | OrderedList | UnorderedList
Paragraph { type: "paragraph", runs: TextRun[] }
OrderedList { type: "ordered-list", items: ListItem[] }
UnorderedList { type: "unordered-list", items: ListItem[] }
ListItem { runs: TextRun[] }
TextRun { text: string, bold?: true, italic?: true, strikethrough?: true }
```

Validation:

- No nested lists, HTML, URLs, embedded nodes, arbitrary attributes, empty mark flags, or unsupported node types.
- Deterministic normalization merges adjacent equal-mark runs and removes empty runs/blocks except one empty paragraph for editor state.
- Derived `memo` preserves text/line/list structure and is at most 20,000 Unicode characters.
- Serialized document has a bounded byte size (100 KiB initial ceiling) and depth.
- `memoDocument` and derived `memo` are written atomically; server independently derives/verifies the projection.
- A legacy `memo` without a document is interpreted as paragraphs and is upgraded only on memo edit.

### HiddenMemoPayload v2

```text
{ version: 2, memoDocument: MemoDocument, memo: string }
```

The entire payload is encrypted. No hidden document/text appears in IndexedDB indexes, search, logs, CSV, or unauthorized UI. Readers retain v1 plain-text ciphertext compatibility; writers emit v2 after edit.

## Task (extended/normalized fields)

Only relevant additions/changes are shown; all existing ownership, sharing, lock, lifecycle, recurrence, attachment, Google, and version rules remain.

| Field | Type | Rules |
|---|---|---|
| `memo` | string/null | Deterministic plain projection; absent for hidden memo outside decrypt context |
| `memoDocument` | MemoDocument/null | Non-hidden canonical semantics |
| `encryptedMemo` | versioned cipher package/null | Hidden v1/v2 payload; mutually protected with plaintext fields |
| `memoHidden` | boolean | Controls protection/render/export |
| `dueKind` | `date \| timed`/null | Null when undated |
| `dueDate` | `YYYY-MM-DD`/null | Required only for `date`; browser-zone invariant |
| `dueAt` | UTC instant/null | Required only for `timed`; absolute instant |
| `dueTimeZone` | legacy string/null | Read-only compatibility metadata; no new UI input |
| `urgency` | `low \| medium \| high \| critical` | `extra_low` is invalid in current, imported, pending, and restored data |
| `postItColor` | fixed color enum/null | Optional per-task override |

Due invariants: undated has all due value fields null; date-only has `dueDate` only; timed has `dueAt`, with legacy zone metadata optional. Existing off-five-minute instants remain unchanged unless due time itself changes.

Post-it rendering precedence is explicit task color, then existing category color, then yellow. Color is not task ownership/visibility metadata and changes in the same versioned patch as other dialog fields.

## ListItem create extension

No canonical schema addition is required: `amountMinor` already exists.

Initial create accepts `{name, amountMinor?}` as one domain/API/outbox operation. `amountMinor` is a signed safe integer in existing minor currency units; the form's positive/cost control and parser produce it. Invalid input creates no partial item and preserves valid form input.

## CompletionExportJob

Extend the existing export-job model with completion scope.

| Field | Type | Rules |
|---|---|---|
| `id`, `ownerId` | opaque IDs | Job result is owner-authorized |
| `scope` | `self \| all_users` | All users requires admin, explicit confirmation, and audit |
| `filters` | normalized completion filters | No user-facing zone preference |
| `browserTimeZone` | IANA zone | Captured from requesting browser; server validates |
| `asOf` | UTC instant | Snapshot boundary |
| `schemaVersion` | `naaseh.completed-tasks/v1` | Binds stable headers |
| `idempotencyKey` | opaque string | Stable retry |
| `status` | existing export job states | No successful result until validation completes |
| `rowCount`, `headerHash`, `checksum` | integrity metadata | Required before download-ready state |
| `objectKey` | private internal key | Never returned as reusable object access |
| timestamps/error class | existing safe fields | No CSV row content in logs |

Rows are derived from snapshot-matching completion events and reauthorized current task/related metadata. Repeated fields use deterministic compact JSON. Missing optional cells are empty.

## Extra Low removal guard

Use a read-only deployment guard with phases:

1. `inventory`: count `extra_low` across current records, projections, pending mutations, encrypted local fixtures, stack snapshots, and restore/backup fixtures without mutation.
2. `gate`: continue only when every bounded count is zero; otherwise block deployment and require explicit review.
3. `delete`: remove the value and compatibility branches from schemas, imports, filters, reports, exports, UI, and fixtures.
4. `enforce`: current, imported, pending, historical, and restored records reject `extra_low`; post-deployment verification again requires zero occurrences.

The inventory is cursor-based, idempotent, read-only, and reports bounded counts plus a safe failure class. Browser schema version 11 verifies the same zero-value invariant while preserving every record, key, setting, outbox identity, and conflict; it aborts rather than rewriting an unexpected value.

## Ownership and relationship summary

- User owns one optional TFA factor, many sessions/login transactions, one current TaskTimer, and personal profile preferences.
- TaskTimer references one authorized Task but is not part of the Task's collaboration audience or history.
- Task owns its memo semantics, due meaning, urgency, and optional post-it override; one atomic task revision captures changes.
- CompletionExportJob belongs to its requester; administrator scope changes row authorization, not ownership.
- System administrators may manage users/system configuration but cannot read TOTP secrets, recovery digests, other users' hidden memo plaintext, or personal timer state.
- Recovery operator can reset administrator factor state but cannot decrypt the old factor or access application content.

## Backup, restore, and revocation

- Existing DynamoDB PITR/AWS Backup and retained KMS versions cover factors, timers, task changes, migrations, jobs, revisions, and receipts; private S3 lifecycle/backup rules cover finished exports.
- Full restore validation checks one timer current record per user, valid timer field combinations, monotonic revisions, receipts/feed consistency, current priority values, structured memo validity, and export integrity.
- A full production restore can resurrect used codes/old counters. Before reopening access, increment all user session epochs and put all administrator factors into `recovery_required` for audited re-enrollment.
- On task-access revocation, the next authorized reconciliation stops/quarantines a referring timer, purges task-identifying cached timer data atomically with cursor progress, and preserves only safe recovery/audit metadata.
- Remote revocation cannot erase a fully offline browser instantly. Startup and reconnect validate the session and lock/purge protected cached data before returning it after revocation is learned.
